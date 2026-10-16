// 第二批單元（④-1、⑥-1、⑥-2）：半成品用真正的 scratch-vm 載入、注入、執行；步驟卡、作品格式、檢核與防洩漏。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const VM = require('scratch-vm');
const progressLib = require('../../src/lib/conjecture-progress.js');
const artifactLib = require('../../src/lib/conjecture-artifact.js');
const {applyInjection, readList, readNumberList} = require('../../src/lib/conjecture-vm.js');
const {evaluateSteps} = require('../../src/lib/conjecture-steps.js');
const {stageRuleFor, guardOutput} = await import('./stage-rules.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNITS = {
    'C4-1': {unit: require('../../src/lib/conjecture-units/c4-1.js'), builders: require('../conjecture-dev-tools/build-c4-1-sb3.js').BUILDERS,
        file: 'src/lib/conjecture-units/c4-1.js'},
    'C6-1': {unit: require('../../src/lib/conjecture-units/c6-1.js'), builders: require('../conjecture-dev-tools/build-c6-1-sb3.js').BUILDERS,
        file: 'src/lib/conjecture-units/c6-1.js'},
    'C6-2': {unit: require('../../src/lib/conjecture-units/c6-2.js'), builders: require('../conjecture-dev-tools/build-c6-2-sb3.js').BUILDERS,
        file: 'src/lib/conjecture-units/c6-2.js'}
};
// 學生端（單元檔與 sb3）不能出現的結論、條件、理由與名稱。
const FORBIDDEN = {
    'C4-1': ['最小公倍數的倍數', '互質', '中間不會有', '中間沒有', '重新開始'],
    'C6-1': ['分配律', '(a＋b)', '(a+b)', 'a×c＋b×c', '共同的因數', '共同因數'],
    'C6-2': ['除以乘積', '除以兩數的乘積', '(b×c)', '被除數不能', '除以商']
};

const sb3 = (unit, stage) => path.join(root, 'static/judge-content', unit.STAGES.find(s => s.stage === stage).sb3Path);
// 測試失敗時也要關掉 VM，否則計時器讓測試行程停不下來。
const openVms = new Set();
test.afterEach(() => {
    for (const vm of openVms) vm.quit();
    openVms.clear();
});
async function load (unit, stage) {
    const vm = new VM();
    openVms.add(vm);
    vm.setTurboMode(true);
    await vm.loadProject(await fs.readFile(sb3(unit, stage)));
    vm.start();
    return vm;
}
async function run (vm, trigger, answers = []) {
    const said = [];
    const asked = [];
    const queue = [...answers];
    const onQuestion = question => {
        if (question !== null) {
            asked.push(question);
            vm.runtime.emit('ANSWER', String(queue.shift() ?? ''));
        }
    };
    const onSay = (target, type, text) => said.push(String(text));
    vm.runtime.on('QUESTION', onQuestion);
    vm.runtime.on('SAY', onSay);
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
    return {said: said.filter(Boolean), asked};
}
const pressKey = (vm, key) => () => vm.runtime.startHats('event_whenkeypressed', {KEY_OPTION: key});
const variable = (vm, name) => vm.runtime.getTargetForStage().lookupVariableByNameAndType(name, '').value;

// 各單元一份完整造例草稿：自己寫 ≥3、都合規、都分好類。
const EX_DRAFTS = {
    'C4-1': {examples: [{group: '4', value: '8', source: 'student'}, {group: '4', value: '20', source: 'student'},
        {group: '5', value: '20', source: 'student'}, {group: '5', value: '15', source: 'program'}],
    sorting: {'4|8': 'only-a', '4|20': 'both', '5|20': 'both', '5|15': 'only-b'}},
    'C6-1': {examples: [{group: 'expr', value: '6×5＋4×5', source: 'student'}, {group: 'expr', value: '5×4＋5×3', source: 'student'},
        {group: 'expr', value: '6×5＋4×3', source: 'student'}],
    sorting: {'expr|6×5＋4×5': 'combine', 'expr|5×4＋5×3': 'combine', 'expr|6×5＋4×3': 'separate'}},
    'C6-2': {examples: [{group: 'expr', value: '84÷4÷7＝3', source: 'student'}, {group: 'expr', value: '84÷7÷4＝3', source: 'student'},
        {group: 'expr', value: '24÷(6÷2)＝8', source: 'student'}],
    sorting: {'expr|84÷4÷7＝3': 'same', 'expr|84÷7÷4＝3': 'same', 'expr|24÷(6÷2)＝8': 'changed'}}
};
const progressThrough = code => {
    const {unit} = UNITS[code];
    let progress = progressLib.emptyProgress(code);
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFTS[code], unit));
    progress = progressLib.applyCompletion(progress, 'CG', progressLib.completeStage('CG',
        {text: '只要兩個都是，就比最小的大。', template: 'free'}, unit));
    return progress;
};

test('三個新單元：造例檢核與作品組裝（分類型）；舊格式 ②-1 不受影響', () => {
    for (const [code, {unit}] of Object.entries(UNITS)) {
        const result = progressLib.completeStage('EX', EX_DRAFTS[code], unit);
        assert.equal(result.gate.activityDone, true, code);
        assert.equal(result.artifact.kind, 'sort', code);
        assert.equal(result.artifact.sorting.length, EX_DRAFTS[code].examples.length, code);
        // 重新清理一次結果相同（讀回比對不會衝突）。
        assert.deepEqual(artifactLib.cleanArtifact('EX', result.artifact), result.artifact, code);
        // 沒分完類、或例子不合規，就不算完成。
        const unsorted = {...EX_DRAFTS[code], sorting: {}};
        assert.equal(progressLib.checkStage('EX', unsorted, unit).activityDone, false, code);
        const invalid = {...EX_DRAFTS[code], examples: [...EX_DRAFTS[code].examples,
            {group: unit.EX.groups[0].id, value: '7', source: 'student'}]};
        assert.equal(progressLib.checkStage('EX', invalid, unit).checks.find(c => c.id === 'examples-valid').met, false, code);
    }
    // 分類不能指向不存在的例子；類別必須是單元定義的。
    assert.throws(() => artifactLib.cleanArtifact('EX', {kind: 'sort', groups: ['expr'], categories: ['a', 'b'],
        examples: [], sorting: [{group: 'expr', value: '1×1＋1×1', category: 'a'}]}), /INVALID_ARTIFACT/);
    assert.throws(() => artifactLib.cleanArtifact('EX', {kind: 'sort', groups: ['expr'], categories: ['a', 'b'],
        examples: [{group: 'expr', value: 'x', source: 'student'}], sorting: [{group: 'expr', value: 'x', category: 'c'}]}),
    /INVALID_ARTIFACT/);
});

test('效化可以用算式檢驗；一般化標記各組資料卡', () => {
    const {unit} = UNITS['C6-1'];
    const test1 = {conjectureRef: 'own', conjectureText: 'x', example: '6×5＋4×3', dataFrom: '小英組', prediction: 'refute',
        computation: '6×5＋4×3＝42；(6＋4)×5＝50', verdict: 'refutes', source: 'student'};
    const va = progressLib.completeStage('VA', {tests: [test1, {...test1, conjectureRef: 'pool-1'}], poolOpened: true}, unit);
    assert.equal(va.gate.activityDone, true);
    assert.equal(va.artifact.tests[0].example, '6×5＋4×3');
    assert.equal(Object.hasOwn(va.artifact.tests[0], 'number'), false);
    assert.throws(() => artifactLib.cleanArtifact('VA', {tests: [{...test1, example: ''}]}), /INVALID_ARTIFACT/);
    const ge = progressLib.completeStage('GE', {before: '原本', after: '只要兩個乘法有一樣的數，就可以合起來', reason: '卡 D 合不起來',
        itemMarks: {A: 'checked', B: 'checked', C: 'unknown', D: 'checked'}}, unit);
    assert.deepEqual(ge.artifact.checkedItems, ['A', 'B', 'D']);
    assert.deepEqual(ge.artifact.unknownItems, ['C']);
    assert.match(artifactLib.summarizeArtifact('EX', progressLib.completeStage('EX', EX_DRAFTS['C6-1'], unit).artifact), /例子3/);
});

test('每個新單元：五個 sb3 載入後注入前階段作品，沒有找不到的清單', async () => {
    for (const [code, {unit}] of Object.entries(UNITS)) {
        const progress = progressThrough(code);
        for (const stage of ['EX', 'CG', 'VA', 'GE', 'JU']) {
            const vm = await load(unit, stage);
            const {missing} = applyInjection(vm, unit.injections(stage, progress));
            assert.deepEqual(missing, [], `${code} ${stage}`);
            vm.quit();
        }
    }
});

test('④-1：卡片 4 示範迴圈寫入清單；卡片 5 少一塊「加入清單」；證實先找第一次一起落地、答錯重問、再預測', async () => {
    const {unit} = UNITS['C4-1'];
    let vm = await load(unit, 'EX');
    await run(vm, () => vm.greenFlag());
    assert.deepEqual(readNumberList(vm, '4的倍數'), [4, 8, 12]);
    await run(vm, pressKey(vm, 'space'));
    assert.deepEqual(readList(vm, '5的倍數'), []);
    vm.quit();
    vm = await load(unit, 'CG');
    applyInjection(vm, unit.injections('CG', progressThrough('C4-1')));
    await run(vm, () => vm.greenFlag());
    assert.deepEqual(readNumberList(vm, '4的倍數'), [8, 20]);
    vm.quit();
    vm = await load(unit, 'JU');
    await run(vm, () => vm.greenFlag());
    const result = await run(vm, pressKey(vm, 'space'), ['10', '20', '40']);
    assert.equal(result.asked[0], '兩隻青蛙第一次一起落地，在哪個數？');
    assert.equal(result.asked[1], '再看看數線：上下兩排都有記號的地方，最小的是哪個數？');
    assert.ok(result.said.some(text => text.startsWith('你預測 40')));
    // 程式不在學生回答前說出一起落地的數。
    assert.ok(result.asked.every(q => !/20/.test(q)));
    assert.equal(variable(vm, '第一次'), 20);
    vm.quit();
});

test('⑥-1：點陣圖依滑桿組出算式；記下例子那段少一塊；證實數一排、幾排，再預測全部', async () => {
    const {unit} = UNITS['C6-1'];
    let vm = await load(unit, 'EX');
    await run(vm, () => vm.greenFlag());
    assert.equal(variable(vm, '算式'), '6×5＋4×5');
    assert.ok(unit.validExample('expr', variable(vm, '算式')));
    await run(vm, pressKey(vm, 'space'));
    assert.deepEqual(readList(vm, '點陣圖例子'), []);
    vm.quit();
    vm = await load(unit, 'JU');
    await run(vm, () => vm.greenFlag());
    const result = await run(vm, pressKey(vm, 'space'), ['9', '10', '5', '50']);
    assert.deepEqual(result.asked.slice(0, 3), ['一排有幾個點？', '再數一次：一排裡紅點和藍點一共幾個？', '有幾排？']);
    assert.ok(result.said.includes('你預測 50；全部有 50 個點'));
    vm.quit();
});

test('⑥-2：連除機只照輸入順序算、取到小數第 2 位；記下例子那段少一塊；證實先數幾小塊再預測對調', async () => {
    const {unit} = UNITS['C6-2'];
    let vm = await load(unit, 'EX');
    let result = await run(vm, () => vm.greenFlag(), ['84', '4', '7']);
    assert.deepEqual(result.said, ['84÷4÷7＝3']);
    assert.deepEqual(readList(vm, '連除例子'), []);
    result = await run(vm, () => vm.greenFlag(), ['100', '3', '7']);
    assert.deepEqual(result.said, ['100÷3÷7＝4.76']);
    assert.ok(unit.validExample('expr', '100÷3÷7＝4.76'));
    vm.quit();
    vm = await load(unit, 'JU');
    await run(vm, () => vm.greenFlag());
    result = await run(vm, pressKey(vm, 'space'), ['7', '12', '12']);
    assert.equal(result.asked[1], '再數一次：一條有幾段？有幾條？一共幾小塊？');
    assert.equal(result.asked[2], '如果改成先切成 4 條，每條再切 3 段，你預測一共幾小塊？');
    assert.ok(result.said.includes('你預測 12；換個切法，一共 12 小塊'));
    vm.quit();
});

// 版面估算（與 conjecture-sb3.test.mjs 相同的規則）。
const stackHeight = (blocks, topId) => {
    let total = 0;
    for (let id = topId; id; id = blocks[id].next) {
        const block = blocks[id];
        const inner = key => (block.inputs[key] && blocks[block.inputs[key][1]] ? stackHeight(blocks, block.inputs[key][1]) : 24);
        if (block.opcode === 'procedures_definition' || block.opcode.startsWith('event_when')) total += 72;
        else if (block.opcode === 'control_if_else') total += 48 + inner('SUBSTACK') + 32 + inner('SUBSTACK2') + 24;
        else if (block.inputs.SUBSTACK) total += 48 + inner('SUBSTACK') + 24;
        else total += 48;
    }
    return total;
};
const overlaps = boxes => {
    const sorted = [...boxes].sort((a, c) => a.top - c.top);
    return sorted.slice(1).filter((box, i) => box.top < sorted[i].bottom).map((box, i) => `${sorted[i].name} ↔ ${box.name}`);
};

test('版面、步驟編號與學生可見文字：不重疊、程式區「步驟 N」對得上註解、不含結論', async () => {
    for (const [code, {unit, builders, file}] of Object.entries(UNITS)) {
        const source = await fs.readFile(path.join(root, file), 'utf8');
        for (const word of FORBIDDEN[code]) assert.equal(source.includes(word), false, `${code} 單元檔：${word}`);
        for (const spec of unit.STAGES) {
            const project = builders[spec.stage]().toJSON('test');
            const json = JSON.stringify(project);
            for (const word of FORBIDDEN[code]) assert.equal(json.includes(word), false, `${code} ${spec.stage}：${word}`);
            const sprite = project.targets.find(t => !t.isStage);
            const comments = Object.values(sprite.comments);
            const notes = comments.map(c => c.text).join('\n');
            spec.steps.forEach((step, i) => {
                const ref = /程式區「步驟 (\d+)」/.exec(step.where);
                if (!ref) return;
                if (step.where.startsWith('程式區')) assert.equal(Number(ref[1]), i + 1, `${code}/${spec.stage}/${step.id}`);
                assert.ok(notes.includes(`步驟 ${ref[1]}`), `${code} ${spec.stage} 註解缺「步驟 ${ref[1]}」`);
            });
            assert.equal(spec.steps[spec.steps.length - 1].done.type, 'stageDone');
            const left = Object.entries(sprite.blocks).filter(([, b]) => b.topLevel && b.x === 40)
                .map(([id, b]) => ({name: b.opcode, top: b.y, bottom: b.y + stackHeight(sprite.blocks, id)}));
            left.push(...comments.filter(c => c.x === 40).map(c => ({name: c.text.slice(0, 8), top: c.y, bottom: c.y + c.height})));
            assert.deepEqual(overlaps(left), [], `${code} ${spec.stage} 左欄`);
            const right = comments.filter(c => c.x !== 40).map(c => ({name: c.text.slice(0, 8), top: c.y, bottom: c.y + c.height}));
            assert.deepEqual(overlaps(right), [], `${code} ${spec.stage} 右欄`);
            const toolTitle = comments.find(c => c.text.startsWith('工具區'));
            assert.ok(toolTitle, `${code} ${spec.stage} 工具區`);
            assert.ok(Object.values(sprite.blocks).filter(b => b.topLevel && b.opcode.startsWith('event_when'))
                .every(b => b.y < toolTitle.y), `${code} ${spec.stage} 主要程式要在工具區上方`);
        }
    }
});

test('步驟卡：新單元造例從自己寫開始；檢核點達成的步驟自動打勾', () => {
    for (const [code, {unit}] of Object.entries(UNITS)) {
        const steps = unit.STAGES[0].steps;
        assert.equal(evaluateSteps(steps, {}).find(s => s.current).id.startsWith('write'), true, code);
        const draft = EX_DRAFTS[code];
        const checks = Object.fromEntries(progressLib.checkStage('EX', draft, unit).checks.map(c => [c.id, c.met]));
        const result = evaluateSteps(steps, {draft, checks});
        assert.equal(result.find(s => s.id === 'sort').done, true, code);
    }
});

test('導師規則：新單元有自己的造例與證實行為；結論句會被攔下，一般引導不會', () => {
    const cases = {
        'C4-1': ['所有公倍數都是最小公倍數的倍數。', '先找找兩排都有記號的地方。'],
        'C6-1': ['這就是分配律。', '用滑桿排出卡 A 的點陣圖看看。'],
        'C6-2': ['連除就是除以兩個除數的乘積。', '用連除機照你寫的順序算算看。']
    };
    for (const [code, [leak, safe]] of Object.entries(cases)) {
        const ex = stageRuleFor(`${code}-EX`);
        const ju = stageRuleFor(`${code}-JU`);
        assert.equal(ex.unit, code);
        assert.notEqual(ex.behavior, stageRuleFor('C2-1-EX').behavior, code);
        assert.notEqual(ju.behavior, stageRuleFor('C2-1-JU').behavior, code);
        assert.equal(guardOutput(ju, {guidance: leak, question: '你覺得呢？'}).ok, false, `${code} 結論`);
        assert.equal(guardOutput(ex, {guidance: safe, question: '下一步要做什麼？'}).ok, true, `${code} 一般引導`);
    }
});

// 角色看得見時，「詢問」的問題會變成角色頭上的對話框，常被底下的輸入框蓋住（使用者回報：⑥-2 連除機看不到問題）。
// 規則：詢問時角色要藏起來（問題改印在輸入框上方），說話時要現身。五個單元的每段程式都檢查。
test('所有半成品：詢問時角色是藏起來的，說話時是現身的', () => {
    const all = {'C2-1': require('../conjecture-dev-tools/build-c2-1-sb3.js').BUILDERS,
        ...Object.fromEntries(Object.entries(UNITS).map(([code, value]) => [code, value.builders]))};
    for (const [code, builders] of Object.entries(all)) {
        for (const [stage, build] of Object.entries(builders)) {
            const project = build().toJSON('test');
            for (const target of project.targets.filter(t => !t.isStage)) {
                const blocks = target.blocks;
                const walk = (id, visible) => {
                    let state = visible;
                    for (let cur = id; cur; cur = blocks[cur].next) {
                        const block = blocks[cur];
                        const where = `${code} ${stage} ${block.opcode}`;
                        if (block.opcode === 'looks_hide') state = false;
                        if (block.opcode === 'looks_show') state = true;
                        if (block.opcode === 'sensing_askandwait') assert.equal(state, false, `${where}：詢問前要先藏起來`);
                        if (['looks_say', 'looks_sayforsecs'].includes(block.opcode)) {
                            assert.equal(state, true, `${where}：說話前要現身`);
                        }
                        for (const key of ['SUBSTACK', 'SUBSTACK2']) {
                            if (block.inputs[key] && blocks[block.inputs[key][1]]) state = walk(block.inputs[key][1], state);
                        }
                    }
                    return state;
                };
                Object.entries(blocks).filter(([, b]) => b.topLevel && !b.shadow).forEach(([id]) => walk(id, true));
            }
        }
    }
});
