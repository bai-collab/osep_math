import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboard} from './teacher/dashboard.js';

const makeRecord = (type, overrides = {}) => ({
    id: `${type}-id`, studentId: 'S01', type, task: {code: 'Q1', title: '第一題'},
    timestamp: '2026-10-13T01:00:00.000Z', ...overrides
});
const grade = (studentId, code, totalScore, overrides = {}) => makeRecord('grade', {
    studentId, task: {code, title: code}, status: 'completed', totalScore, maxScore: 10, ...overrides
});
const cellFor = (result, studentId, code) => result.grid.cells[studentId][code];

test('空資料回傳零位學生與 null 平均比例', () => {
    const result = buildDashboard();
    assert.equal(result.metrics.students, 0);
    assert.equal(result.metrics.tasks, 0);
    assert.equal(result.metrics.averageLastValidScoreRatio, null);
    assert.deepEqual(result.grid, {students: [], tasks: [], cells: {}});
    assert.deepEqual(result.hardTasks, []);
});

test('只有載入範例時沒有有效分數，但會計入範例次數', () => {
    const result = buildDashboard([makeRecord('demo')]);
    assert.equal(cellFor(result, 'S01', 'Q1').level, 'none');
    assert.equal(cellFor(result, 'S01', 'Q1').demo, 1);
    assert.equal(cellFor(result, 'S01', 'Q1').lastTimestamp, '2026-10-13T01:00:00.000Z');
});

test('真模型與模擬求助分開計數，格內顯示兩者合計', () => {
    const result = buildDashboard([
        makeRecord('ai', {source: 'mock'}),
        makeRecord('ai', {source: 'nmking', task: {code: 'Q2', title: '第二題'}})
    ]);
    assert.equal(result.metrics.realModelHelpCount, 1);
    assert.equal(result.metrics.simulatedHelpCount, 1);
    assert.equal(cellFor(result, 'S01', 'Q1').aiHelp, 1);
    assert.equal(cellFor(result, 'S01', 'Q2').aiHelp, 1);
});

test('題目依第一次出現時間排序，同時間沿用紀錄保存順序', () => {
    const result = buildDashboard([
        makeRecord('demo', {studentId: 'B01', task: {code: 'Q2', title: '第二題'}, timestamp: '2026-10-13T02:00:00.000Z'}),
        makeRecord('demo', {studentId: 'A01', task: {code: 'Q1', title: '第一題'}, timestamp: '2026-10-13T01:00:00.000Z'}),
        makeRecord('demo', {studentId: 'A01', task: {code: 'Q3', title: '第三題'}, timestamp: '2026-10-13T02:00:00.000Z'})
    ]);
    assert.deepEqual(result.grid.tasks.map(task => task.code), ['Q1', 'Q2', 'Q3']);
    assert.deepEqual(result.grid.students, ['A01', 'B01']);
});

test('最後有效成績分成滿分、部分與零分，平均比例以每人每題計算', () => {
    const records = [grade('S01', 'Q1', 10), grade('S02', 'Q1', 5), grade('S03', 'Q1', 0)];
    const result = buildDashboard(records);
    assert.equal(cellFor(result, 'S01', 'Q1').level, 'full');
    assert.equal(cellFor(result, 'S02', 'Q1').level, 'partial');
    assert.equal(cellFor(result, 'S03', 'Q1').level, 'zero');
    assert.equal(result.metrics.averageLastValidScoreRatio, 0.5);
});

test('評分中程式變更或使用範例程式的紀錄不算有效評分', () => {
    const result = buildDashboard([
        grade('S01', 'Q1', 5),
        grade('S01', 'Q1', 10, {timestamp: '2026-10-13T02:00:00.000Z', programChanged: true}),
        grade('S01', 'Q1', 0, {timestamp: '2026-10-13T03:00:00.000Z', demoLoaded: true})
    ]);
    assert.equal(cellFor(result, 'S01', 'Q1').level, 'partial');
    assert.equal(result.metrics.averageLastValidScoreRatio, 0.5);
});

test('同生同題以時間較晚且保存順序較後的最後一筆有效評分為準', () => {
    const timestamp = '2026-10-13T01:00:00.000Z';
    const result = buildDashboard([
        grade('S01', 'Q1', 4, {timestamp}),
        grade('S01', 'Q1', 10, {timestamp}),
        grade('S01', 'Q1', 0, {timestamp: '2026-10-13T02:00:00.000Z', programChanged: true})
    ]);
    assert.equal(cellFor(result, 'S01', 'Q1').level, 'full');
    assert.equal(result.metrics.averageLastValidScoreRatio, 1);
});

test('老師標記 false_positive 的依賴提醒不計數也不顯示在格內', () => {
    const records = [makeRecord('demo'), makeRecord('demo', {studentId: 'S02', task: {code: 'Q2', title: '第二題'}})];
    const dependency = {alerts: [
        {studentId: 'S01', task: {code: 'Q1'}, review: {status: 'false_positive'}},
        {studentId: 'S02', task: {code: 'Q2'}, review: {status: 'open'}}
    ]};
    const result = buildDashboard(records, dependency);
    assert.equal(result.metrics.dependencyAlertCount, 1);
    assert.equal(cellFor(result, 'S01', 'Q1').alert, false);
    assert.equal(cellFor(result, 'S02', 'Q2').alert, true);
});

test('跳過說明不算說過想法，其他學生的說明會計入人數與格子', () => {
    const result = buildDashboard([
        makeRecord('reflection', {studentId: 'S01', skipped: true}),
        makeRecord('reflection', {studentId: 'S02', skipped: false})
    ]);
    assert.equal(result.metrics.studentsWithReflections, 1);
    assert.equal(cellFor(result, 'S01', 'Q1').reflected, false);
    assert.equal(cellFor(result, 'S02', 'Q1').reflected, true);
});

test('卡關題目依未滿分人數、求助次數排序，並最多回傳五題', () => {
    const records = [];
    const addTask = (code, first, second, helpCount = 0) => {
        records.push(makeRecord(first.type, {studentId: 'S01', task: {code, title: code}, ...first.fields}));
        records.push(makeRecord(second.type, {studentId: 'S02', task: {code, title: code}, ...second.fields}));
        for (let index = 0; index < helpCount; index++) {
            records.push(makeRecord('ai', {studentId: 'S01', task: {code, title: code}, source: 'mock'}));
        }
    };
    const demo = {type: 'demo', fields: {}};
    const full = {type: 'grade', fields: {status: 'completed', totalScore: 10, maxScore: 10}};
    const partial = {type: 'grade', fields: {status: 'completed', totalScore: 5, maxScore: 10}};
    addTask('Q1', demo, partial);
    addTask('Q2', demo, full, 4);
    addTask('Q3', demo, full, 5);
    addTask('Q4', demo, demo, 6);
    addTask('Q5', full, full);
    addTask('Q6', demo, full);

    const result = buildDashboard(records);
    assert.deepEqual(result.hardTasks.map(task => task.code), ['Q4', 'Q1', 'Q3', 'Q2', 'Q6']);
    assert.deepEqual(result.hardTasks[0], {code: 'Q4', title: 'Q4', notFull: 2, aiHelp: 6, students: 2});
});
