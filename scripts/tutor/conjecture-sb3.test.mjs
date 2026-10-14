// osep_math P5d：五個半成品 sb3 用真正的 scratch-vm 載入、注入前階段作品、執行並檢查結果。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const unit = require('../../src/lib/conjecture-units/c2-1.js');
const progressLib = require('../../src/lib/conjecture-progress.js');
const {applyInjection, readList, readNumberList} = require('../../src/lib/conjecture-vm.js');
const {BUILDERS} = require('../conjecture-dev-tools/build-c2-1-sb3.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sb3 = stage => path.join(root, 'static/judge-content', unit.STAGES.find(s => s.stage === stage).sb3Path);

async function load (stage) {
    const vm = new VM();
    vm.setTurboMode(true);
    await vm.loadProject(await fs.readFile(sb3(stage)));
    vm.start();
    return vm;
}
// 執行到所有執行緒結束；answers 依序回答「詢問並等待」，回傳角色說過的話。
async function run (vm, trigger, answers = []) {
    const said = [];
    const queue = [...answers];
    const onQuestion = question => {
        if (question !== null) vm.runtime.emit('ANSWER', String(queue.shift() ?? ''));
    };
    const onSay = (target, type, text) => said.push(String(text));
    vm.runtime.on('QUESTION', onQuestion);
    vm.runtime.on('SAY', onSay);
    // 角色看得見時「詢問」會改用 SAY 顯示問題；評分引擎同樣先把角色藏起來。
    vm.runtime.targets.forEach(target => {
        if (!target.isStage) target.setVisible(false);
    });
    trigger();
    const start = Date.now();
    while (Date.now() - start < 10000) {
        await new Promise(r => setTimeout(r, 30));
        if (vm.runtime.threads.length === 0) break;
    }
    vm.runtime.off('QUESTION', onQuestion);
    vm.runtime.off('SAY', onSay);
    return said.filter(Boolean);
}
const pressKey = (vm, key) => () => vm.runtime.startHats('event_whenkeypressed', {KEY_OPTION: key});
const stageLists = vm => Object.values(vm.runtime.getTargetForStage().variables).filter(v => v.type === 'list')
    .map(v => v.name).sort();

const EX_DRAFT = {
    examples: [{card: 2, value: 4, source: 'student'}, {card: 2, value: 6, source: 'student'},
        {card: 10, value: 30, source: 'student'}, {card: 2, value: 8, source: 'program'}],
    classification: {2: {appeared: [0, 2, 4, 6, 8], notAppeared: [1, 3, 5, 7, 9]},
        10: {appeared: [0], notAppeared: [1, 2, 3, 4, 5, 6, 7, 8, 9]}}
};
const progressThrough = () => {
    let progress = progressLib.emptyProgress('C2-1');
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFT, unit));
    progress = progressLib.applyCompletion(progress, 'CG', progressLib.completeStage('CG',
        {text: '只要個位是 0，就是 10 的倍數。', template: 'free'}, unit));
    return progress;
};

test('每個階段的 sb3 都含有注入需要的全部舞台清單（注入不會回報 missing）', async () => {
    const progress = progressThrough();
    for (const stage of Object.keys(BUILDERS)) {
        const vm = await load(stage);
        const {missing} = applyInjection(vm, unit.injections(stage, progress));
        assert.deepEqual(missing, [], stage);
        vm.quit();
    }
});

test('EX：綠旗執行卡片 2 的示範迴圈，清單寫入倍數與個位；學生改次數後數量跟著變', async () => {
    const vm = await load('EX');
    await run(vm, () => vm.greenFlag());
    assert.deepEqual(readNumberList(vm, '2的倍數'), [2, 4, 6]);
    assert.deepEqual(readNumberList(vm, '2的倍數的個位'), [2, 4, 6]);
    // 模擬學生把「重複 3 次」改成 12 次。
    const sprite = vm.runtime.targets.find(t => t.getName() === '記號筆');
    const repeats = Object.values(sprite.blocks._blocks).filter(b => b.opcode === 'control_repeat');
    const timesShadow = id => sprite.blocks.getBlock(sprite.blocks.getBlock(id).inputs.TIMES.shadow);
    const loopA = repeats.find(b => timesShadow(b.id).fields.NUM.value === '3');
    timesShadow(loopA.id).fields.NUM.value = '12';
    sprite.blocks.resetCache(); // TurboWarp 會快取編譯後的腳本；編輯器改積木時也會清快取。
    await run(vm, () => vm.greenFlag());
    assert.deepEqual(readNumberList(vm, '2的倍數'), Array.from({length: 12}, (_, i) => 2 * (i + 1)));
    vm.quit();
});

test('EX：卡片 10 的半成品刻意少了「個位」那一塊，空白鍵執行後個位清單是空的', async () => {
    const vm = await load('EX');
    await run(vm, pressKey(vm, 'space'));
    assert.deepEqual(readNumberList(vm, '10的倍數'), [10]);
    assert.deepEqual(readList(vm, '10的倍數的個位'), []);
    vm.quit();
});

test('CG：注入的例子保留；選做條件區預設空白，不替學生判斷', async () => {
    const vm = await load('CG');
    applyInjection(vm, unit.injections('CG', progressThrough()));
    await run(vm, () => vm.greenFlag());
    assert.deepEqual(readNumberList(vm, '2的倍數'), [4, 6, 8]);
    const said = await run(vm, pressKey(vm, 'space'), ['20']);
    assert.deepEqual(said, ['20 不符合我的猜想條件']);
    vm.quit();
});

test('VA：驗算機算出商與餘數；反例獵人只依學生設定的條件掃描', async () => {
    const vm = await load('VA');
    applyInjection(vm, unit.injections('VA', progressThrough()));
    assert.deepEqual(readNumberList(vm, '小華組的資料').slice(0, 4), [4, 8, 12, 16]);
    assert.deepEqual(readList(vm, '我的猜想'), ['只要個位是 0，就是 10 的倍數。']);
    // 預設除數 1：任何數都整除，所以找不到反例（不預設任何一個目標除數）。
    await run(vm, pressKey(vm, 's'));
    assert.deepEqual(readList(vm, '反例'), []);
    const said = await run(vm, pressKey(vm, 'space'), ['14', '4']);
    assert.deepEqual(said, ['14 ÷ 4 ＝ 3 … 2']);
    // 驗算機用自己的變數，不會偷偷改掉反例獵人的設定。
    await run(vm, pressKey(vm, 's'));
    assert.deepEqual(readList(vm, '反例'), []);
    const stage = vm.runtime.getTargetForStage();
    stage.lookupVariableByNameAndType('個位條件', '').value = 4;
    stage.lookupVariableByNameAndType('除數', '').value = 4;
    await run(vm, pressKey(vm, 's'));
    assert.deepEqual(readNumberList(vm, '反例'), [14, 34, 54, 74, 94]);
    vm.quit();
});

test('GE：前階段資料帶入，驗算機可用', async () => {
    const vm = await load('GE');
    applyInjection(vm, unit.injections('GE', progressThrough()));
    assert.deepEqual(readList(vm, '我的猜想'), ['只要個位是 0，就是 10 的倍數。']);
    assert.deepEqual(await run(vm, pressKey(vm, 'space'), ['26', '4']), ['26 ÷ 4 ＝ 6 … 2']);
    vm.quit();
});

// run() 會記下每次「詢問」的題目，方便檢查學生答錯時是否重問。
async function runWithQuestions (vm, trigger, answers) {
    const asked = [];
    const onQuestion = question => {
        if (question) asked.push(question);
    };
    vm.runtime.on('QUESTION', onQuestion);
    const said = await run(vm, trigger, answers);
    vm.runtime.off('QUESTION', onQuestion);
    return {said, asked};
}

test('JU：位值表徵依滑桿變數組成數；每包與零散的剩餘由學生自己算，答錯就重問，最後先預測再揭曉', async () => {
    const vm = await load('JU');
    assert.deepEqual(await run(vm, () => vm.greenFlag()), ['這個數是 34']);
    // 34 ÷ 2：每包剩 0、零散 4 剩 0；學生預測 0。
    let result = await runWithQuestions(vm, pressKey(vm, 'space'), ['0', '0', '0']);
    assert.deepEqual(result.said, ['對！每一包都剩下 0', '對！零散的剩下 0', '你預測 0；整個數平分後剩下 0']);
    assert.deepEqual(result.asked, ['每一包 10 個平分成 2 份，會剩下幾個？', '零散的 4 個平分成 2 份，會剩下幾個？',
        '那整個數平分後，你預測會剩下幾個？']);
    // 程式在學生回答前不說出每包的餘數。
    assert.ok(result.asked.every(q => !/剩下 \d/.test(q)));
    const stage = vm.runtime.getTargetForStage();
    stage.lookupVariableByNameAndType('包數', '').value = 7;
    stage.lookupVariableByNameAndType('除數', '').value = 4;
    assert.deepEqual(await run(vm, () => vm.greenFlag()), ['這個數是 74']);
    // 74 ÷ 4：學生先答錯每包剩 1（重問），再答 2；零散 4 剩 0；預測 1，揭曉 2。
    result = await runWithQuestions(vm, pressKey(vm, 'space'), ['1', '2', '0', '1']);
    assert.equal(result.asked[1], '再算算看：10 ÷ 4 ＝ ？… ？ 剩下幾個？');
    assert.deepEqual(result.said, ['對！每一包都剩下 2', '對！零散的剩下 0', '你預測 1；整個數平分後剩下 2']);
    vm.quit();
});

test('專案結構：清單都在舞台、有說明註解、只用 pen 擴充；學生可見文字不含目標結論', async () => {
    for (const stage of Object.keys(BUILDERS)) {
        const project = BUILDERS[stage]().toJSON('test');
        const [stageTarget, ...sprites] = project.targets;
        assert.equal(stageTarget.isStage, true);
        assert.ok(sprites.every(s => Object.keys(s.lists).length === 0 && Object.keys(s.variables).length === 0), stage);
        assert.ok(sprites.some(s => Object.keys(s.comments).length > 0), stage);
        assert.deepEqual(project.extensions, ['pen']);
        const text = JSON.stringify(project);
        for (const forbidden of ['只有 2、5、10', '只有2、5、10', '末兩位', '數字和', '反例靶', '恆真']) {
            assert.equal(text.includes(forbidden), false, `${stage}: ${forbidden}`);
        }
    }
    const vm = await load('VA');
    assert.deepEqual(stageLists(vm), ['10的倍數', '10的倍數的個位', '2的倍數', '2的倍數的個位', '反例', '小明組的資料',
        '小英組的資料', '小華組的資料', '我的猜想'].sort());
    vm.quit();
});
