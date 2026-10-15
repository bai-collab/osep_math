// 造例步驟卡：依草稿、專案清單與完成狀態判斷每一步；只做引導，不改變檢核點。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const unit = require('../../src/lib/conjecture-units/c2-1.js');
const {evaluateSteps, programListNames} = require('../../src/lib/conjecture-steps.js');

const steps = unit.STAGES.find(s => s.stage === 'EX').steps;
const current = state => evaluateSteps(steps, state).find(s => s.current);
const allDigits = {appeared: [0, 2, 4, 6, 8], notAppeared: [1, 3, 5, 7, 9]};
const own = (card, values) => values.map(value => ({card, value, source: 'student'}));
const fromProgram = (card, values) => values.map(value => ({card, value, source: 'program'}));

test('造例步驟卡共 9 步，程式區步驟對齊 sb3 註解編號', () => {
    assert.equal(steps.length, 9);
    assert.equal(steps[1].where, '程式區「步驟 2」');
    assert.equal(steps[5].where, '程式區「步驟 6」');
    assert.deepEqual(programListNames(steps), ['2的倍數', '10的倍數的個位']);
    assert.equal(unit.toCourse().tasks.find(t => t.stage === 'EX').steps.length, 9);
    assert.deepEqual(unit.toCourse().tasks.find(t => t.stage === 'CG').steps, []);
});

test('一開始停在步驟 1；同一個數寫兩次不算兩個', () => {
    assert.equal(current({}).id, 'write-2');
    assert.equal(current({draft: {examples: own(2, [4, 4, 6])}}).id, 'write-2');
    assert.equal(current({draft: {examples: own(2, [4, 6, 8])}}).id, 'run-2');
});

test('按綠旗後程式清單超過 3 個，才算改了次數；讀進來的數不算自己寫的', () => {
    const draft = {examples: own(2, [4, 6, 8])};
    assert.equal(current({draft, programLists: {'2的倍數': [2, 4, 6]}}).id, 'run-2');
    assert.equal(current({draft, programLists: {'2的倍數': [2, 4, 6, 8]}}).id, 'read-2');
    const read = {examples: [...own(2, [4, 6, 8]), ...fromProgram(2, [10, 12])]};
    assert.equal(current({draft: read, programLists: {'2的倍數': [2, 4, 6, 8]}}).id, 'sort-2');
    // 只讀程式清單、沒有自己寫：步驟 1 仍未完成。
    assert.equal(current({draft: {examples: fromProgram(2, [2, 4, 6])}}).id, 'write-2');
});

test('分類要 0～9 全部點過；卡片 10 補了個位那一塊才算步驟 6；全部做完才沒有目前步驟', () => {
    const lists = {'2的倍數': [2, 4, 6, 8], '10的倍數的個位': []};
    const base = {examples: [...own(2, [4, 6, 8]), ...fromProgram(2, [10])],
        classification: {2: {appeared: [0, 2], notAppeared: [1]}}};
    assert.equal(current({draft: base, programLists: lists}).id, 'sort-2');
    const sorted = {...base, classification: {2: allDigits}, examples: [...base.examples, ...own(10, [30])]};
    assert.equal(current({draft: sorted, programLists: lists}).id, 'run-10');
    const withOnes = {...lists, '10的倍數的個位': [0]};
    const done = {...sorted, examples: [...sorted.examples, ...fromProgram(10, [10, 20])],
        classification: {2: allDigits, 10: {appeared: [0], notAppeared: [1, 2, 3, 4, 5, 6, 7, 8, 9]}}};
    assert.equal(current({draft: done, programLists: withOnes}).id, 'finish');
    const finished = evaluateSteps(steps, {draft: done, programLists: withOnes, stageDone: true});
    assert.ok(finished.every(s => s.done && !s.current));
});

test('步驟可以不照順序做：後面先做完的照樣打勾，目前步驟是第一個沒做完的', () => {
    const result = evaluateSteps(steps, {draft: {classification: {10: allDigits}}});
    assert.equal(result.find(s => s.id === 'sort-10').done, true);
    assert.equal(result.find(s => s.current).id, 'write-2');
});

test('程式清單步驟達成過就記住：重新載入半成品清單清空後仍算完成；只記程式清單類步驟', () => {
    const {newlySeen} = require('../../src/lib/conjecture-steps.js');
    const draft = {examples: own(2, [4, 6, 8])};
    assert.deepEqual(newlySeen(steps, {draft, programLists: {'2的倍數': [2, 4, 6, 8]}}), ['run-2']);
    assert.deepEqual(newlySeen(steps, {draft, programLists: {'2的倍數': [2, 4, 6]}}), []);
    const remembered = {...draft, stepsSeen: ['run-2']};
    assert.deepEqual(newlySeen(steps, {draft: remembered, programLists: {'2的倍數': [2, 4, 6, 8]}}), []);
    assert.equal(current({draft: remembered, programLists: {'2的倍數': []}}).id, 'read-2');
    // 記錄只對程式清單類步驟有效，不能拿來跳過自己寫或分類。
    assert.equal(current({draft: {stepsSeen: ['write-2', 'sort-2']}}).id, 'write-2');
});
