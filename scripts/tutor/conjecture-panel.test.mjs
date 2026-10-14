// osep_math P5c：階段面板、進度與解鎖、程式檢核、前階段資料注入。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react'), {create, act} = require('react-test-renderer'), VM = require('scratch-vm');
const progressLib = require('../../src/lib/conjecture-progress.js');
const unit = require('../../src/lib/conjecture-units/c2-1.js');
const {applyInjection, readNumberList} = require('../../src/lib/conjecture-vm.js');
const {setStudentId} = require('../../src/lib/learning-records.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const memoryStorage = () => {
    const map = new Map();
    return {getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map};
};

const EX_DRAFT = {
    examples: [{card: 2, value: 4, source: 'student'}, {card: 2, value: 6, source: 'student'},
        {card: 10, value: 30, source: 'student'}, {card: 2, value: 12, source: 'program'}],
    classification: {
        2: {appeared: [0, 2, 4, 6, 8], notAppeared: [1, 3, 5, 7, 9]},
        10: {appeared: [0], notAppeared: [1, 2, 3, 4, 5, 6, 7, 8, 9]}
    }
};

test('解鎖：只有第一階段預設開放；前一階段活動完成才開下一階段', () => {
    let progress = progressLib.emptyProgress('C2-1');
    assert.equal(progressLib.isUnlocked(progress, 'EX'), true);
    assert.equal(progressLib.isUnlocked(progress, 'CG'), false);
    const notDone = progressLib.completeStage('EX', {...EX_DRAFT, examples: EX_DRAFT.examples.slice(0, 2)}, unit);
    progress = progressLib.applyCompletion(progress, 'EX', notDone);
    assert.equal(notDone.gate.activityDone, false);
    assert.equal(progressLib.isUnlocked(progress, 'CG'), false);
    const done = progressLib.completeStage('EX', EX_DRAFT, unit);
    progress = progressLib.applyCompletion(progress, 'EX', done);
    assert.equal(progressLib.isUnlocked(progress, 'CG'), true);
    assert.equal(progressLib.isUnlocked(progress, 'VA'), false);
});

test('EX 檢核：自己寫的例子要 ≥3、都是倍數、兩張卡都分類完', () => {
    const ids = draft => Object.fromEntries(progressLib.checkStage('EX', draft, unit).checks.map(c => [c.id, c.met]));
    assert.deepEqual(ids(EX_DRAFT), {'own-examples-3': true, 'examples-are-multiples': true, 'ones-classified': true});
    // 程式產生的例子不算「自己寫的」。
    assert.equal(ids({...EX_DRAFT, examples: EX_DRAFT.examples.map(e => ({...e, source: 'program'}))})['own-examples-3'], false);
    assert.equal(ids({...EX_DRAFT, examples: [...EX_DRAFT.examples, {card: 2, value: 7, source: 'student'}]})['examples-are-multiples'],
        false);
    assert.equal(ids({...EX_DRAFT, classification: {2: EX_DRAFT.classification[2]}})['ones-classified'], false);
});

test('CG 檢核只看有沒有寫出有範圍的猜想，不看真假；錯的猜想也能過', () => {
    const wrong = progressLib.completeStage('CG', {text: '只要個位是 0、2、4、6、8，就是 4 的倍數。', template: 'if-then',
        condition: '個位是 0、2、4、6、8', conclusion: '是 4 的倍數'}, unit);
    assert.equal(wrong.gate.activityDone, true);
    assert.equal(wrong.gate.reasoningStatus, 'not_applicable');
    const vague = progressLib.checkStage('CG', {text: '個位好像有規律'}, unit);
    assert.equal(vague.activityDone, false);
});

test('VA 檢核：要用別組資料、寫出驗算、也檢驗過猜想池的一句', () => {
    const own = {conjectureRef: 'own', conjectureText: 'x', number: 14, dataFrom: '小華組', prediction: 'refute',
        computation: '14÷4＝3…2', verdict: 'refutes', source: 'student'};
    assert.equal(progressLib.checkStage('VA', {tests: [own]}, unit).activityDone, false);
    assert.equal(progressLib.checkStage('VA', {tests: [own, {...own, conjectureRef: 'pool-1'}], poolOpened: true}, unit)
        .activityDone, true);
    assert.equal(progressLib.checkStage('VA', {tests: [{...own, computation: '我覺得不是'},
        {...own, conjectureRef: 'pool-1', computation: '不對'}]}, unit).activityDone, false);
    const scanned = {...own, source: 'scan'};
    assert.equal(progressLib.checkStage('VA', {tests: [scanned, {...scanned, conjectureRef: 'pool-2'}]}, unit).activityDone,
        false);
});

test('GE、JU 檢核；JU 一律先標說理待補；列舉提醒只是提示', () => {
    assert.equal(progressLib.checkStage('GE', {before: '看個位就能判斷', after: '看個位就能判斷', reason: '因為'}, unit).activityDone,
        false);
    const ge = progressLib.completeStage('GE', {before: 'a', after: '只有部分的除數可以只看個位', reason: '14 推翻了 4',
        divisorMarks: {2: 'checked', 4: 'checked', 7: 'checked', 3: 'unknown'}}, unit);
    assert.deepEqual(ge.artifact.checkedDivisors, [2, 4]);
    assert.deepEqual(ge.artifact.unknownDivisors, [3]);
    const ju = progressLib.completeStage('JU', {text: '因為每一包 10 都可以平分，所以只要看剩下的個位。'}, unit);
    assert.equal(ju.gate.activityDone, true);
    assert.equal(ju.gate.reasoningStatus, 'pending');
    assert.equal(progressLib.looksLikeEnumeration('我試了 20、30、40 都對'), true);
    assert.equal(progressLib.looksLikeEnumeration('不管有幾包 10，20、30、40 都對'), false);
});

test('進度存取：依學生與單元分開；損壞內容從頭開始', () => {
    const storage = memoryStorage();
    const progress = progressLib.applyCompletion(progressLib.emptyProgress('C2-1'), 'EX',
        progressLib.completeStage('EX', EX_DRAFT, unit));
    assert.equal(progressLib.saveProgress('S01', progress, storage), true);
    assert.equal(progressLib.loadProgress('S01', 'C2-1', storage).gates.EX.activityDone, true);
    assert.deepEqual(progressLib.loadProgress('S02', 'C2-1', storage).gates, {});
    storage.setItem(progressLib.storageKey('S03', 'C2-1'), '{broken');
    assert.deepEqual(progressLib.loadProgress('S03', 'C2-1', storage).artifacts, {});
});

test('前階段作品注入：EX 例子帶到 CG；VA 才有虛擬組員資料', () => {
    const progress = progressLib.applyCompletion(progressLib.emptyProgress('C2-1'), 'EX',
        progressLib.completeStage('EX', EX_DRAFT, unit));
    assert.deepEqual(unit.injections('EX', progress).lists, {});
    const cg = unit.injections('CG', progress).lists;
    assert.deepEqual(cg['2的倍數'], [4, 6, 12]);
    assert.deepEqual(cg['2的倍數的個位'], [4, 6, 2]);
    assert.equal(Object.keys(cg).some(name => name.includes('組')), false);
    const va = unit.injections('VA', progress).lists;
    assert.deepEqual(va['小華組的資料'].slice(0, 3), [4, 8, 12]);
    assert.deepEqual(va['反例'], []);
});

test('applyInjection 寫入真正 VM 的舞台清單；找不到的清單回報 missing，不自動建立', async () => {
    const vm = new VM();
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {L1: ['2的倍數', ['99']]},
        broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
        costumes: [{assetId: 'cd21514d0531fdffb22204e0ec5ed84a', name: 'backdrop1', md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
            dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}], sounds: [], volume: 100}],
    monitors: [], extensions: [], meta: {semver: '3.0.0'}};
    await vm.loadProject(project).catch(() => vm.loadProject(JSON.stringify(project)));
    const result = applyInjection(vm, {lists: {'2的倍數': [4, 6, 8], '不存在的清單': [1]}});
    assert.deepEqual(result, {applied: ['2的倍數'], missing: ['不存在的清單']});
    assert.deepEqual(readNumberList(vm, '2的倍數'), [4, 6, 8]);
    assert.equal(readNumberList(vm, '不存在的清單'), null);
    vm.quit();
});

test('學生端單元檔不含教師答案或設計玄機的關鍵字', async () => {
    const source = await fs.readFile(path.join(root, 'src/lib/conjecture-units/c2-1.js'), 'utf8');
    for (const forbidden of ['只有 2、5、10', '只有2、5、10', '末兩位', '數字和', '反例靶', '恆真', '設計玄機']) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    const course = unit.toCourse();
    assert.equal(course.tasks.length, 5);
    assert.deepEqual(course.tasks.map(t => t.code), ['C2-1-EX', 'C2-1-CG', 'C2-1-VA', 'C2-1-GE', 'C2-1-JU']);
    assert.ok(course.tasks.every(t => t.description && t.sb3Path.endsWith('.sb3') && Array.isArray(t.examples)));
});

// ---- 面板互動（真正的 ConjecturePanel 元件） ----
const source = path.join(root, 'src/components/judge-panel/conjecture-panel.jsx');
const sourceRequire = createRequire(source);
const code = require('@babel/core').transformFileSync(source, {babelrc: false, configFile: false,
    presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const stageView = {calls: []};
const subject = {exports: {}};
new Function('require', 'module', 'exports', code)(name => {
    if (name.endsWith('.css')) return {};
    if (name === '../../lib/conjecture-stage-view.js') {
        return {__esModule: true, default: {show: () => stageView.calls.push('show'), hide: () => stageView.calls.push('hide')}};
    }
    return sourceRequire(name);
}, subject, subject.exports);
const ConjecturePanel = subject.exports.default;

const taskFor = stage => ({...unit.toCourse().tasks.find(t => t.stage === stage), answerProjectUrl: `https://x.invalid/${stage}.sb3`});

test('面板：EX 填例子、分類、完成後送出作品與判定，並出現前往下一階段；CG 才解鎖', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage(), records = [], fetched = [];
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        fetched.push(url);
        return new Response('', {status: 404});
    };
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '小貓', blocks: {}}]});
    const selected = [];
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    act(() => setStudentId('S01'));
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('EX'), studentId: 'S01',
            onSelectTask: code => selected.push(code)}));
    });
    assert.deepEqual(stageView.calls, ['show']);
    assert.deepEqual(fetched, ['https://x.invalid/EX.sb3']);
    const text = () => JSON.stringify(rootNode.toJSON());
    assert.ok(text().includes('半成品專案還沒準備好'));
    const byLabel = label => rootNode.root.find(node => node.props['aria-label'] === label);
    const button = label => rootNode.root.findAll(node => node.type === 'button' &&
        [].concat(node.props.children).join('') === label)[0];
    for (const [card, value] of [[2, '4'], [2, '6'], [10, '20']]) {
        act(() => byLabel(`輸入一個 ${card} 的倍數`).props.onChange({target: {value}}));
        const addButtons = rootNode.root.findAll(node => node.type === 'button' && node.props.children === '加入');
        act(() => addButtons[card === 2 ? 0 : 1].props.onClick());
    }
    // 2 的倍數：0,2,4,6,8 出現；其餘沒出現。10 的倍數：0 出現；其餘沒出現。
    const classify = (card, digit, clicks) => {
        for (let i = 0; i < clicks; i++) {
            const node = rootNode.root.find(n => typeof n.props['aria-label'] === 'string' &&
                n.props['aria-label'].startsWith(`${card} 的倍數個位 ${digit}：`));
            act(() => node.props.onClick());
        }
    };
    for (let d = 0; d < 10; d++) {
        classify(2, d, d % 2 === 0 ? 1 : 2);
        classify(10, d, d === 0 ? 1 : 2);
    }
    assert.ok(!text().includes('○ '), '所有檢核點都應達成');
    await act(async () => button('完成本階段').props.onClick());
    assert.deepEqual(records.map(r => r.type), ['artifact', 'gate']);
    assert.equal(records[0].unit, 'C2-1');
    assert.equal(records[0].stage, 'EX');
    assert.equal(records[0].schemaVersion, 3);
    assert.equal(records[0].artifact.examples.filter(e => e.source === 'student').length, 3);
    assert.equal(records[1].gate.activityDone, true);
    const saved = progressLib.loadProgress('S01', 'C2-1', storage);
    assert.equal(progressLib.isUnlocked(saved, 'CG'), true);
    await act(async () => button('前往下一階段：提出猜想').props.onClick());
    assert.deepEqual(selected, ['C2-1-CG']);
});

test('面板：未解鎖的階段不載入半成品；VA 進入時記錄看過虛擬組員資料，猜想池要先檢驗自己的猜想', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage(), records = [], fetched = [];
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        fetched.push(url);
        return new Response('', {status: 404});
    };
    const vm = new VM();
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('VA'), studentId: 'S01',
            onSelectTask: () => {}}));
    });
    assert.ok(JSON.stringify(rootNode.toJSON()).includes('還沒解鎖'));
    assert.deepEqual(fetched, []);
    act(() => rootNode.unmount());
    let progress = progressLib.emptyProgress('C2-1');
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFT, unit));
    progress = progressLib.applyCompletion(progress, 'CG', progressLib.completeStage('CG', {text: '只要個位是 0，就是 10 的倍數。',
        template: 'free'}, unit));
    progressLib.saveProgress('S01', progress, storage);
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('VA'), studentId: 'S01',
            onSelectTask: () => {}}));
    });
    assert.deepEqual(records.map(r => [r.type, r.exposure && r.exposure.item]), [['exposure', 'virtual-data']]);
    const poolButton = rootNode.root.findAll(node => node.type === 'button' &&
        String(node.props.children).startsWith('打開猜想池'))[0];
    assert.equal(poolButton.props.disabled, true);
    assert.ok(!JSON.stringify(rootNode.toJSON()).includes('只要個位是 0、2、4、6、8，就是 4 的倍數'),
        '打開前不顯示猜想池內容');
});

// ---- P6 外審 R3a 三點的回歸測試 ----
test('R3a-1：效化選「我自己的例子」不算用別組資料檢驗', () => {
    const own = {conjectureRef: 'own', conjectureText: 'x', number: 4, dataFrom: '我自己的例子', prediction: 'support',
        computation: '4÷2＝2', verdict: 'supports', source: 'student'};
    const ids = draft => Object.fromEntries(progressLib.checkStage('VA', draft, unit).checks.map(c => [c.id, c.met]));
    assert.equal(ids({tests: [own, {...own, conjectureRef: 'pool-1'}]})['tested-with-new-data'], false);
    assert.equal(ids({tests: [{...own, dataFrom: '小華組'}]})['tested-with-new-data'], true);
    assert.equal(ids({tests: [{...own, dataFrom: '不存在的組'}]})['tested-with-new-data'], false);
});

const renderPanel = async (task, studentId, storage, fetched) => {
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        fetched.push(`${studentId}:${url}`);
        return new Response('', {status: 404});
    };
    const vm = new VM();
    let node;
    await act(async () => {
        node = create(React.createElement(ConjecturePanel, {vm, task, studentId, onSelectTask: () => {}}));
    });
    return {node, vm};
};

test('R3a-2：本機草稿的檢驗結果損壞時，面板不崩潰並顯示「未知」', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow; globalThis.fetch = oldFetch;
    });
    const storage = memoryStorage();
    let progress = progressLib.emptyProgress('C2-1');
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFT, unit));
    progress = progressLib.applyCompletion(progress, 'CG', progressLib.completeStage('CG', {text: '只要個位是 0，就是 10 的倍數。',
        template: 'free'}, unit));
    progress.drafts.VA = {tests: [{number: 14, dataFrom: '小華組', conjectureText: 'x', computation: '14÷4', verdict: 'broken',
        source: 'student'}]};
    progressLib.saveProgress('S07', progress, storage);
    const {node, vm} = await renderPanel(taskFor('VA'), 'S07', storage, []);
    assert.ok(JSON.stringify(node.toJSON()).includes('未知'));
    act(() => node.unmount());
    vm.quit();
});

test('R3a-3：同一頁換學生代號後，新學生進入同一階段仍會自動載入半成品；同一學生回來不重複載入', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow; globalThis.fetch = oldFetch;
    });
    const fetched = [];
    for (const studentId of ['S05', 'S06', 'S05']) {
        const {node, vm} = await renderPanel(taskFor('EX'), studentId, memoryStorage(), fetched);
        act(() => node.unmount());
        vm.quit();
    }
    assert.deepEqual(fetched, ['S05:https://x.invalid/EX.sb3', 'S06:https://x.invalid/EX.sb3']);
});
