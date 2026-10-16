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

test('證實：完成時記下作品 id；老師「請再說明」的附註會顯示在學生面板', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow; globalThis.fetch = oldFetch; act(() => setStudentId(''));
    });
    const storage = memoryStorage();
    let progress = progressLib.emptyProgress('C2-1');
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFT, unit));
    for (const stage of ['CG', 'VA', 'GE']) {
        progress.gates[stage] = {activityDone: true, reasoningStatus: 'not_applicable', checks: []};
    }
    progress.drafts.JU = {text: '因為每一包 10 都能平分，所以只看零散的。'};
    progressLib.saveProgress('S08', progress, storage);
    const records = [], queries = [];
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        if (String(url).startsWith('./api/student/reasoning-feedback')) {
            queries.push(String(url));
            return new Response(JSON.stringify({review: {status: 'needs_work', note: '請用包數說明', reviewedAt: '2026-10-14T00:00:00Z'}}));
        }
        return new Response('', {status: 404});
    };
    act(() => setStudentId('S08'));
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '積木', blocks: {}}]});
    let node;
    await act(async () => {
        node = create(React.createElement(ConjecturePanel, {vm, task: taskFor('JU'), studentId: 'S08', onSelectTask: () => {}}));
    });
    // 還沒完成證實時沒有作品 id，不查詢。
    assert.deepEqual(queries, []);
    const complete = node.root.findAll(n => n.type === 'button' && n.props.children === '完成本階段')[0];
    await act(async () => complete.props.onClick());
    const artifact = records.find(r => r.type === 'artifact');
    assert.equal(progressLib.loadProgress('S08', 'C2-1', storage).artifactIds.JU, artifact.id);
    await act(async () => {
        await new Promise(r => setTimeout(r, 20));
    });
    assert.equal(queries.length, 1);
    assert.ok(queries[0].includes(`artifactId=${artifact.id}`) && queries[0].includes('studentId=S08'));
    assert.ok(JSON.stringify(node.toJSON()).includes('老師請你再說明：請用包數說明。修改下面的理由後'));
    act(() => node.unmount());
    vm.quit();
});

// ---- P6 外審 R4b 四點的回歸測試 ----
const juReadyProgress = (storage, studentId, extra = {}) => {
    let progress = progressLib.emptyProgress('C2-1');
    progress = progressLib.applyCompletion(progress, 'EX', progressLib.completeStage('EX', EX_DRAFT, unit));
    for (const stage of ['CG', 'VA', 'GE']) {
        progress.gates[stage] = {activityDone: true, reasoningStatus: 'not_applicable', checks: []};
    }
    progress.drafts.JU = {text: '因為每一包 10 都能平分，所以只看零散的。'};
    progressLib.saveProgress(studentId, {...progress, ...extra}, storage);
};

test('R4b-1：作品沒有保存成功時不記下 id、不查回饋；保存成功後才查', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow; globalThis.fetch = oldFetch; act(() => setStudentId(''));
    });
    const storage = memoryStorage();
    juReadyProgress(storage, 'S11');
    const events = [];
    let artifactOk = false;
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            const body = JSON.parse(options.body);
            events.push(`post-${body.type}`);
            if (body.type === 'artifact' && !artifactOk) return new Response('{}', {status: 500});
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        if (String(url).startsWith('./api/student/reasoning-feedback')) {
            events.push('query');
            return new Response(JSON.stringify({review: null}));
        }
        return new Response('', {status: 404});
    };
    act(() => setStudentId('S11'));
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '積木', blocks: {}}]});
    let node;
    await act(async () => {
        node = create(React.createElement(ConjecturePanel, {vm, task: taskFor('JU'), studentId: 'S11', onSelectTask: () => {}}));
    });
    const complete = () => node.root.findAll(n => n.type === 'button' && n.props.children === '完成本階段')[0];
    await act(async () => complete().props.onClick());
    await act(async () => new Promise(r => setTimeout(r, 20)));
    assert.equal(progressLib.loadProgress('S11', 'C2-1', storage).artifactIds?.JU, undefined);
    assert.equal(events.includes('query'), false);
    artifactOk = true;
    events.length = 0;
    await act(async () => complete().props.onClick());
    await act(async () => new Promise(r => setTimeout(r, 20)));
    assert.ok(progressLib.loadProgress('S11', 'C2-1', storage).artifactIds.JU);
    assert.ok(events.indexOf('query') > events.indexOf('post-artifact'));
    act(() => node.unmount());
    vm.quit();
});

test('R4b-2／3／4：換學生代號清掉前一位的回饋、不拿舊作品 id 配新代號查詢；查詢失敗清掉舊回饋', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow; globalThis.fetch = oldFetch;
    });
    const storage = memoryStorage();
    juReadyProgress(storage, 'S12', {artifactIds: {JU: 'artifact-s12-0001'}});
    juReadyProgress(storage, 'S13');
    const queries = [];
    let failQueries = false;
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async url => {
        if (String(url).startsWith('./api/student/reasoning-feedback')) {
            queries.push(String(url));
            if (failQueries) throw new Error('offline');
            return new Response(JSON.stringify({review: {status: 'needs_work', note: 'S12 的私人附註', reviewedAt: 'x'}}));
        }
        return new Response('', {status: 404});
    };
    const vm = new VM();
    let node;
    const props = studentId => ({vm, task: taskFor('JU'), studentId, onSelectTask: () => {}});
    await act(async () => {
        node = create(React.createElement(ConjecturePanel, props('S12')));
    });
    await act(async () => new Promise(r => setTimeout(r, 20)));
    assert.ok(JSON.stringify(node.toJSON()).includes('S12 的私人附註'));
    // R4b-4：查詢失敗時舊回饋要清掉。
    failQueries = true;
    const recheck = node.root.findAll(n => n.type === 'button' && n.props.children === '重新查看老師回饋')[0];
    await act(async () => recheck.props.onClick());
    assert.equal(JSON.stringify(node.toJSON()).includes('S12 的私人附註'), false);
    failQueries = false;
    await act(async () => recheck.props.onClick());
    assert.ok(JSON.stringify(node.toJSON()).includes('S12 的私人附註'));
    // R4b-2／3：同一個面板換成 S13（沒有證實作品）。
    queries.length = 0;
    await act(async () => node.update(React.createElement(ConjecturePanel, props('S13'))));
    await act(async () => new Promise(r => setTimeout(r, 20)));
    assert.equal(JSON.stringify(node.toJSON()).includes('S12 的私人附註'), false);
    assert.equal(queries.some(q => q.includes('studentId=S13')), false);
    act(() => node.unmount());
    vm.quit();
});

test('面板：EX 顯示步驟卡取代任務段落；寫完 3 個數換下一步，程式執行停止後依清單自動打勾', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    globalThis.window = {localStorage: memoryStorage()};
    globalThis.fetch = async () => new Response('', {status: 404});
    const vm = new VM();
    await vm.loadProject(await fs.readFile(path.join(root, 'static/judge-content', unit.STAGES[0].sb3Path)));
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    act(() => setStudentId('S09'));
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('EX'), studentId: 'S09',
            onSelectTask: () => {}}));
    });
    const text = () => JSON.stringify(rootNode.toJSON());
    const currentStep = () => rootNode.root.find(node => node.type === 'li' && node.props['aria-current'] === 'step');
    const stepText = node => node.children.map(child => (typeof child === 'string' ? child : stepText(child))).join('');
    assert.ok(text().includes('照著做：步驟 1／9'));
    assert.ok(!text().includes(unit.STAGES[0].task), '有步驟卡時不再顯示整段任務說明');
    // 完整步驟清單預設收合；目前步驟由頂端提示條顯示。
    const stepsBox = rootNode.root.find(node => node.type === 'details' && node.props['aria-label'] === '步驟');
    assert.ok(!stepsBox.props.open);
    assert.ok(text().includes('步驟 1／9・右邊面板：'));
    for (const value of ['4', '6', '8']) {
        act(() => rootNode.root.find(n => n.props['aria-label'] === '輸入一個 2 的倍數').props.onChange({target: {value}}));
        act(() => rootNode.root.findAll(n => n.type === 'button' && n.props.children === '加入')[0].props.onClick());
    }
    assert.ok(text().includes('照著做：步驟 2／9'));
    assert.ok(stepText(currentStep()).includes('程式區「步驟 2」'));
    // 模擬學生改次數後按綠旗：清單變長，執行停止時步驟卡重讀清單。
    const list = Object.values(vm.runtime.getTargetForStage().variables).find(v => v.name === '2的倍數');
    list.value = ['2', '4', '6', '8', '10'];
    act(() => vm.runtime.emit('PROJECT_RUN_STOP'));
    assert.ok(text().includes('照著做：步驟 3／9'));
    assert.ok(stepText(currentStep()).includes('讀取程式清單'));
});

test('面板：按綠旗達成的步驟記進草稿；重新載入半成品清單清空後不會被打回步驟 2', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage();
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async () => new Response('', {status: 404});
    const vm = new VM();
    await vm.loadProject(await fs.readFile(path.join(root, 'static/judge-content', unit.STAGES[0].sb3Path)));
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    act(() => setStudentId('S10'));
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('EX'), studentId: 'S10',
            onSelectTask: () => {}}));
    });
    const text = () => JSON.stringify(rootNode.toJSON());
    for (const value of ['4', '6', '8']) {
        act(() => rootNode.root.find(n => n.props['aria-label'] === '輸入一個 2 的倍數').props.onChange({target: {value}}));
        act(() => rootNode.root.findAll(n => n.type === 'button' && n.props.children === '加入')[0].props.onClick());
    }
    const list = Object.values(vm.runtime.getTargetForStage().variables).find(v => v.name === '2的倍數');
    list.value = ['2', '4', '6', '8'];
    act(() => vm.runtime.emit('PROJECT_RUN_STOP'));
    assert.ok(text().includes('步驟 3／9'));
    assert.deepEqual(progressLib.loadProgress('S10', 'C2-1', storage).drafts.EX.stepsSeen, ['run-2']);
    list.value = [];
    act(() => vm.runtime.emit('PROJECT_LOADED'));
    assert.ok(text().includes('步驟 3／9'), '清單清空後仍停在步驟 3');
});

test('面板：CG 第一步是程式區手動步驟，按「這步做好了」記進草稿並前進；檢核點達成的步驟自動打勾', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage();
    progressLib.saveProgress('S11', progressLib.applyCompletion(progressLib.emptyProgress('C2-1'), 'EX',
        progressLib.completeStage('EX', EX_DRAFT, unit)), storage);
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async () => new Response('', {status: 404});
    const vm = new VM();
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    act(() => setStudentId('S11'));
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('CG'), studentId: 'S11',
            onSelectTask: () => {}}));
    });
    const text = () => JSON.stringify(rootNode.toJSON());
    assert.ok(text().includes('步驟 1／5・程式區「步驟 1」：'));
    const doneButton = () => rootNode.root.findAll(n => n.type === 'button' && n.props.children === '這步做好了')[0];
    act(() => doneButton().props.onClick());
    assert.ok(text().includes('步驟 2／5・右邊面板：'));
    assert.deepEqual(progressLib.loadProgress('S11', 'C2-1', storage).drafts.CG.stepsSeen, ['redraw']);
    act(() => rootNode.root.find(n => n.props['aria-label'] === '條件').props.onChange({target: {value: '個位是 0'}}));
    act(() => rootNode.root.find(n => n.props['aria-label'] === '結論').props.onChange({target: {value: '是 10 的倍數'}}));
    // 寫出有條件的猜想後，2、3 步都打勾；選做的第 4 步跳過，直接停在完成本階段。
    assert.ok(text().includes('步驟 5／5・右邊面板最下面：'));
});

test('面板：教師預覽時未解鎖的階段也能開、顯示預覽提示；完成階段不送紀錄、不寫學生本機進度', async t => {
    const previewLib = require('../../src/lib/teacher-preview.js');
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage(), records = [];
    globalThis.window = {localStorage: storage, location: {protocol: 'http:', hostname: '127.0.0.1'}};
    globalThis.fetch = async (url, options) => {
        if (url === './api/teacher/preview') return new Response(JSON.stringify({preview: true}));
        if (url === './api/records') records.push(JSON.parse(options.body));
        return new Response('', {status: 404});
    };
    previewLib.resetPreviewForTest();
    const vm = new VM();
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
        previewLib.resetPreviewForTest();
    });
    act(() => setStudentId('S12'));
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task: taskFor('CG'), studentId: 'S12',
            onSelectTask: () => {}}));
    });
    await act(async () => {
        await previewLib.refreshPreview();
    });
    const text = () => JSON.stringify(rootNode.toJSON());
    assert.ok(text().includes('教師預覽'));
    assert.ok(!text().includes('這個階段還沒解鎖'));
    const stageButtons = rootNode.root.findAll(n => n.type === 'button' && n.props.title && n.props.onClick &&
        typeof n.props.disabled === 'boolean');
    assert.ok(stageButtons.length === 5 && stageButtons.every(b => b.props.disabled === false), '五個階段都能點');
    act(() => rootNode.root.find(n => n.props['aria-label'] === '條件').props.onChange({target: {value: '個位是 0'}}));
    act(() => rootNode.root.find(n => n.props['aria-label'] === '結論').props.onChange({target: {value: '是 10 的倍數'}}));
    const complete = rootNode.root.findAll(n => n.type === 'button' &&
        [].concat(n.props.children).join('') === '完成本階段')[0];
    await act(async () => complete.props.onClick());
    assert.ok(text().includes('教師預覽中：這筆紀錄沒有保存。'));
    assert.deepEqual(records, [], '預覽不送任何紀錄');
    assert.equal([...storage.map.keys()].some(key => key.includes('S12')), false, '不寫學生的本機進度');
});

test('面板：⑥-1 分類型造例——加入算式、擋掉不合規的、逐一分類，完成後送出分類型作品', async t => {
    const unit61 = require('../../src/lib/conjecture-units/c6-1.js');
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = memoryStorage(), records = [];
    globalThis.window = {localStorage: storage};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        return new Response('', {status: 404});
    };
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '點點', blocks: {}}]});
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount());
        vm.quit();
        act(() => setStudentId(''));
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
    });
    act(() => setStudentId('S13'));
    const task = {...unit61.toCourse().tasks.find(x => x.stage === 'EX'), answerProjectUrl: 'https://x.invalid/C6-1-EX.sb3'};
    await act(async () => {
        rootNode = create(React.createElement(ConjecturePanel, {vm, task, studentId: 'S13', onSelectTask: () => {}}));
    });
    const text = () => JSON.stringify(rootNode.toJSON());
    const input = () => rootNode.root.find(n => n.props['aria-label'] === '輸入兩堆乘法相加的算式');
    const add = value => {
        act(() => input().props.onChange({target: {value}}));
        act(() => rootNode.root.findAll(n => n.type === 'button' && n.props.children === '加入')[0].props.onClick());
    };
    add('6 x 5 + 4 x 5');
    add('5*4+5*3');
    add('6×5＋4×3');
    add('三十');
    assert.ok(text().includes('請寫成「□×□＋□×□」'), '不合規的例子被擋下並提示');
    const chooser = (value, label) => rootNode.root.find(n => n.props['aria-label'] === `${value}：${label}`);
    act(() => chooser('6×5＋4×5', '可以合起來算').props.onClick());
    act(() => chooser('5×4＋5×3', '可以合起來算').props.onClick());
    act(() => chooser('6×5＋4×3', '合不起來').props.onClick());
    assert.ok(!text().includes('○ '), '檢核點都達成');
    const complete = rootNode.root.findAll(n => n.type === 'button' &&
        [].concat(n.props.children).join('') === '完成本階段')[0];
    await act(async () => complete.props.onClick());
    const artifact = records.find(r => r.type === 'artifact');
    assert.equal(artifact.unit, 'C6-1');
    assert.equal(artifact.artifact.kind, 'sort');
    assert.deepEqual(artifact.artifact.examples.map(e => e.value), ['6×5＋4×5', '5×4＋5×3', '6×5＋4×3']);
    assert.deepEqual(artifact.artifact.sorting.map(s => s.category), ['combine', 'combine', 'separate']);
    assert.equal(records.find(r => r.type === 'gate').gate.activityDone, true);
});
