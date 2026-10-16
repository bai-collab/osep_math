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
    assert.deepEqual(unit.toCourse().tasks.map(t => t.steps.length), [9, 5, 6, 5, 6]);
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

const stepsOf = stage => unit.STAGES.find(s => s.stage === stage).steps;
const currentOf = (stage, state) => evaluateSteps(stepsOf(stage), state).find(s => s.current);
const checkMap = (stage, draft) => Object.fromEntries(
    require('../../src/lib/conjecture-progress.js').checkStage(stage, draft, unit).checks.map(c => [c.id, c.met]));

test('每個階段程式區步驟的「步驟 N」都對得上 sb3 註解；最後一步都是完成本階段', () => {
    const {BUILDERS} = require('../conjecture-dev-tools/build-c2-1-sb3.js');
    for (const spec of unit.STAGES) {
        const notes = BUILDERS[spec.stage]().toJSON('test').targets.flatMap(t => Object.values(t.comments))
            .map(c => c.text).join('\n');
        spec.steps.forEach((step, i) => {
            const ref = /程式區「步驟 (\d+)」/.exec(step.where);
            if (!ref) return;
            // 程式區開頭的步驟就是在程式區做的那一步，編號要等於自己的順序；
            // 「右邊面板＋程式區『步驟 2』」這類是借用前面的程式，只要 sb3 有那個編號。
            if (step.where.startsWith('程式區')) assert.equal(Number(ref[1]), i + 1, `${spec.stage}/${step.id}`);
            assert.ok(notes.includes(`步驟 ${ref[1]}`), `${spec.stage} 的 sb3 註解缺「步驟 ${ref[1]}」`);
        });
        assert.equal(spec.steps[spec.steps.length - 1].done.type, 'stageDone', spec.stage);
    }
});

test('CG：先按綠旗（手動）→ 寫猜想 → 有範圍；選做步驟不會變成目前步驟', () => {
    assert.equal(currentOf('CG', {}).id, 'redraw');
    const seen = {stepsSeen: ['redraw']};
    assert.equal(currentOf('CG', {draft: seen, checks: checkMap('CG', seen)}).id, 'write');
    const draft = {...seen, text: '只要個位是 0，就是 10 的倍數。'};
    const result = evaluateSteps(stepsOf('CG'), {draft, checks: checkMap('CG', draft)});
    assert.equal(result.find(s => s.current).id, 'finish', '選做的程式條件區被跳過');
    assert.equal(result.find(s => s.id === 'program-condition').optional, true);
    assert.equal(result.find(s => s.id === 'program-condition').done, false);
});

test('VA：用別組資料加算式、打開猜想池、檢驗猜想池一句，都沿用檢核點判斷', () => {
    const test1 = {conjectureRef: 'own', number: 14, dataFrom: '小華組', computation: '14÷4＝3…2', source: 'student'};
    const s1 = {stepsSeen: ['redraw'], tests: [test1]};
    assert.equal(currentOf('VA', {draft: s1, checks: checkMap('VA', s1)}).id, 'open-pool');
    const s2 = {...s1, poolOpened: true};
    assert.equal(currentOf('VA', {draft: s2, checks: checkMap('VA', s2)}).id, 'test-pool');
    const s3 = {...s2, tests: [test1, {...test1, conjectureRef: 'pool-1'}]};
    assert.equal(currentOf('VA', {draft: s3, checks: checkMap('VA', s3)}).id, 'finish');
    // 只寫結論、沒有算式：仍停在檢驗自己的猜想。
    const noCalc = {stepsSeen: ['redraw'], tests: [{...test1, computation: '我覺得不是'}]};
    assert.equal(currentOf('VA', {draft: noCalc, checks: checkMap('VA', noCalc)}).id, 'test-own');
});

test('GE：修訂、理由、每個除數都要標過；JU：手動三步後寫操作與理由', () => {
    const ge = {before: '原本', after: '任何數都要先檢驗過除數，才能只看個位', reason: '14 推翻了 4',
        divisorMarks: {2: 'checked', 3: 'unknown', 4: 'checked', 5: 'checked', 6: 'unknown'}};
    assert.equal(currentOf('GE', {draft: ge, checks: checkMap('GE', ge)}).id, 'marks');
    const geAll = {...ge, divisorMarks: {...ge.divisorMarks, 10: 'checked'}};
    assert.equal(currentOf('GE', {draft: geAll, checks: checkMap('GE', geAll)}).id, 'finish');
    const ju = {stepsSeen: ['draw', 'split', 'vary'], representation: '3 包 10 和 4 個'};
    assert.equal(currentOf('JU', {draft: ju, checks: checkMap('JU', ju)}).id, 'because');
});

test('手動記住只限 manual 與程式清單步驟：不能拿 stepsSeen 跳過要檢查的步驟', () => {
    const {manualIds} = require('../../src/lib/conjecture-steps.js');
    assert.deepEqual(manualIds(stepsOf('JU')), ['draw', 'split', 'vary']);
    assert.deepEqual(manualIds(stepsOf('EX')), []);
    const cheat = {stepsSeen: ['redraw', 'write', 'scope', 'finish']};
    assert.equal(currentOf('CG', {draft: cheat, checks: checkMap('CG', cheat)}).id, 'write');
});

test('程式清單步驟要檢查內容：補錯積木加進去的文字不算做好，並提醒學生檢查', () => {
    const {newlySeen} = require('../../src/lib/conjecture-steps.js');
    const lists = {'2的倍數': [2, 4, 6, 8]};
    const sorted = {examples: [...own(2, [4, 6, 8]), ...fromProgram(2, [10]), ...own(10, [30])],
        classification: {2: allDigits}};
    // Codex 實測：把字面文字 thing 加進「10的倍數的個位」，步驟 6 不能打勾。
    const wrong = {...lists, '10的倍數的個位': ['thing', 'thing']};
    const atRun10 = evaluateSteps(steps, {draft: sorted, programLists: wrong}).find(s => s.current);
    assert.equal(atRun10.id, 'run-10');
    assert.equal(atRun10.listProblem, true);
    assert.ok(!newlySeen(steps, {draft: sorted, programLists: wrong}).includes('run-10'));
    // 個位只能是 0～9；10、-1、空字串都不算。
    assert.equal(current({draft: sorted, programLists: {...lists, '10的倍數的個位': ['10', -1, '']}}).id, 'run-10');
    // 改好後再執行，清單裡有合理的個位就算完成，提醒消失。
    const fixed = evaluateSteps(steps, {draft: sorted, programLists: {...lists, '10的倍數的個位': ['thing', '0']}})
        .find(s => s.id === 'run-10');
    assert.equal(fixed.done, true);
    assert.equal(fixed.listProblem, false);
    // 2 的倍數清單：奇數或文字不算；還沒執行（空清單）時不提醒。
    const draft = {examples: own(2, [4, 6, 8])};
    const odd = evaluateSteps(steps, {draft, programLists: {'2的倍數': [2, 4, 6, 7]}}).find(s => s.current);
    assert.equal(odd.id, 'run-2');
    assert.equal(odd.listProblem, true);
    assert.equal(evaluateSteps(steps, {draft, programLists: {'2的倍數': []}}).find(s => s.current).listProblem, false);
});

test('第二批單元的程式清單步驟也有內容規則：倍數要整除、算式要有數字和運算符號', () => {
    const {evaluateSteps: evaluate} = require('../../src/lib/conjecture-steps.js');
    const stepOf = (code, id) => require(`../../src/lib/conjecture-units/${code}.js`).STAGES
        .find(s => s.stage === 'EX').steps.find(s => s.id === id);
    const doneWith = (step, values) => evaluate([step], {programLists: {[step.done.list]: values}})[0].done;
    const runA = stepOf('c4-1', 'run-a');
    const A = runA.done.valid.of;
    assert.equal(doneWith(runA, [A, 2 * A, 3 * A, 4 * A]), true);
    assert.equal(doneWith(runA, [A, 2 * A, 3 * A, (4 * A) + 1]), false);
    const runB = stepOf('c4-1', 'run-b');
    assert.equal(doneWith(runB, ['thing']), false);
    assert.equal(doneWith(runB, [String(runB.done.valid.of * 2)]), true);
    for (const code of ['c6-1', 'c6-2']) {
        const record = stepOf(code, 'record');
        assert.equal(doneWith(record, ['thing']), false, code);
        assert.equal(doneWith(record, ['0']), false, code);
    }
    assert.equal(doneWith(stepOf('c6-1', 'record'), ['6×5＋4×5']), true);
    assert.equal(doneWith(stepOf('c6-2', 'record'), ['48÷6÷2＝4']), true);
    // 每個程式清單步驟都要寫內容規則，避免之後新增的步驟漏掉。
    for (const code of ['c2-1', 'c4-1', 'c6-1', 'c6-2']) {
        for (const stage of require(`../../src/lib/conjecture-units/${code}.js`).STAGES) {
            for (const step of stage.steps || []) {
                if (step.done && step.done.type === 'programList') assert.ok(step.done.valid, `${code} ${step.id}`);
            }
        }
    }
});

test('⑥-2 補積木步驟提示寫明要貼緊接在連除機下面', () => {
    const record = require('../../src/lib/conjecture-units/c6-2.js').STAGES
        .find(s => s.stage === 'EX').steps.find(s => s.id === 'record');
    assert.match(record.text, /貼緊接上/);
    assert.match(record.text, /沒接上，不會記下來/);
});
