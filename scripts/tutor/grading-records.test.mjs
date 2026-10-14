import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react'), {create, act} = require('react-test-renderer'), VM = require('scratch-vm');
const {setStudentId} = require('../../src/lib/learning-records.js');
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/components/judge-panel/judge-panel.jsx');
const sourceRequire = createRequire(source);
const code = require('@babel/core').transformFileSync(source, {babelrc: false, configFile: false,
    presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-proposal-dynamic-import'),
        require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const task = {code: 'q1', title: '測試題', description: '公開說明', examples: [], testCases: [{input: 'HIDDEN', expectedOutput: 'GOLD'}]};
let gradeImpl;
const tutorProps = {current: null, open: false};
const subject = {exports: {}};
new Function('require', 'module', 'exports', code)(name => {
    if (name.endsWith('.css')) return {};
    if (name === '../../lib/tw-judge-engine.js') return {prepareVmForGrading: () => {}, gradeSubmission: (...args) => gradeImpl(...args)};
    if (name === '../../lib/judge-content/index.js') return {courses: [], findTaskByCode: async () => ({course: {code: 'C1'}, task})};
    if (name === '../../lib/scaffold-content.js') return {scaffoldUrlForCourse: () => null};
    if (name === './task-list.jsx') return {__esModule: true, default: ({onSelectTask}) =>
        React.createElement('button', {onClick: () => onSelectTask('q1')}, '選測試題')};
    if (name === './tutor-tab.jsx') return {__esModule: true, default: props => {tutorProps.current = props; return null;}};
    if (name === './floating-tutor.jsx') return {__esModule: true, default: props => {
        tutorProps.open = props.open;
        return props.children;
    }};
    return sourceRequire(name);
}, subject, subject.exports);
const JudgePanel = subject.exports.default;
test('真正評分按鈕保存按下當時程式與分數；重複點擊不重跑；記錄失敗不吞分數', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = new Map(), records = [];
    globalThis.window = {localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}};
    let saveFailed = false;
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: saveFailed ? 'failed' : 'saved_local'}}));
        }
        return new Response('{}');
    };
    const vm = new VM();
    let blockText = '按下前';
    vm.toJSON = () => JSON.stringify({targets: [{name: '學生角色', blocks: {one: {opcode: 'looks_say',
        inputs: {MESSAGE: [1, [10, blockText]]}, fields: {}}}, costumes: ['ASSET']}], hiddenTests: 'GOLD'});
    let root;
    t.after(() => {act(() => root.unmount()); vm.quit(); globalThis.window = oldWindow; globalThis.fetch = oldFetch;});
    await act(async () => {root = create(React.createElement(JudgePanel, {vm}));});
    const button = text => root.root.findAllByType('button').find(node => node.props.children === text);
    await act(async () => button('選測試題').props.onClick());
    act(() => setStudentId('S01'));
    act(() => button('評分').props.onClick());
    let resolveGrade, calls = 0;
    gradeImpl = () => {calls++; return new Promise(resolve => {resolveGrade = resolve;});};
    let pending;
    act(() => {const handler = button('執行評分').props.onClick; pending = handler(); handler();});
    assert.equal(calls, 1);
    blockText = '評分途中改過';
    await act(async () => {resolveGrade({totalScore: 7, maxScore: 10, results: [{pass: true}]}); await pending;});
    assert.equal(records.length, 1);
    assert.equal(records[0].program.targets[0].blocks.one.inputs.MESSAGE[1][1], '按下前');
    assert.equal(records[0].programChanged, true);
    assert.equal(records[0].totalScore, 7);
    for (const forbidden of ['HIDDEN', 'GOLD', 'ASSET']) assert.ok(!JSON.stringify(records).includes(forbidden));
    saveFailed = true;
    gradeImpl = async () => ({totalScore: 0, maxScore: 10, results: [{pass: false}]});
    await act(async () => button('執行評分').props.onClick());
    assert.equal(records[1].programChanged, false);
    assert.equal(records[1].totalScore, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes('分數：'));
    assert.ok(JSON.stringify(root.toJSON()).includes('記錄失敗'));
    gradeImpl = async () => {throw new Error('GRADER_INTERNAL');};
    await act(async () => button('執行評分').props.onClick());
    assert.equal(records[2].status, 'failed');
    assert.equal(records[2].errorCode, 'GRADING_FAILED');
    assert.ok(!JSON.stringify(records[2]).includes('GRADER_INTERNAL'));
    act(() => setStudentId(''));
    await act(async () => button('執行評分').props.onClick());
    assert.equal(records.length, 3);
});
test('載入範例送出 demo 紀錄並公開告知；評分紀錄帶 v2 欄位與自行測試次數', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = new Map(), records = [];
    globalThis.window = {localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        if (url === 'demo.sb3') return new Response(new Uint8Array([1, 2, 3]));
        return new Response('{}');
    };
    const savedTask = {...task};
    Object.assign(task, {loadable: true, answerProjectUrl: 'demo.sb3'});
    const vm = new VM();
    vm.loadProject = async () => {};
    vm.greenFlag = () => {};
    vm.toJSON = () => JSON.stringify({targets: [{name: '學生角色', blocks: {}}]});
    let root;
    t.after(() => {
        act(() => root.unmount()); vm.quit(); globalThis.window = oldWindow; globalThis.fetch = oldFetch;
        for (const key of Object.keys(task)) delete task[key];
        Object.assign(task, savedTask);
    });
    await act(async () => {root = create(React.createElement(JudgePanel, {vm}));});
    const button = text => root.root.findAllByType('button').find(node => node.props.children === text);
    await act(async () => button('選測試題').props.onClick());
    assert.ok(JSON.stringify(root.toJSON()).includes('載入範例會記錄在學習紀錄中'));
    await act(async () => button('載入範例').props.onClick());
    assert.equal(records.length, 0, '沒有學生代號時不記錄');
    act(() => setStudentId('S02'));
    await act(async () => button('✓ 已載入範例答案').props.onClick());
    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'demo');
    assert.equal(records[0].task.code, 'q1');
    assert.equal(records[0].program, undefined);
    assert.equal(records[0].schemaVersion, 2);
    act(() => button('自行測試').props.onClick());
    act(() => button('開始手動測試').props.onClick());
    act(() => button('停止（隱藏舞台）').props.onClick());
    act(() => button('開始手動測試').props.onClick());
    act(() => button('停止（隱藏舞台）').props.onClick());
    act(() => button('評分').props.onClick());
    gradeImpl = async () => ({totalScore: 10, maxScore: 10, results: [{pass: true}]});
    await act(async () => button('執行評分').props.onClick());
    const graded = records.find(r => r.type === 'grade');
    assert.equal(graded.demoLoaded, true);
    assert.equal(graded.selfTestCount, 2);
    assert.equal(graded.sessionId, records[0].sessionId);
    assert.ok(Number.isFinite(Date.parse(graded.clientTime)));
    await act(async () => button('執行評分').props.onClick());
    assert.equal(records.at(-1).selfTestCount, 0);
    act(() => setStudentId(''));
});
test('從電腦開啟或載入還原點時記錄 open（含開啟後程式）；未選題時先暫存，選題後才記錄', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = new Map(), records = [];
    globalThis.window = {localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)}};
    globalThis.fetch = async (url, options) => {
        if (url === './api/records') {
            records.push(JSON.parse(options.body));
            return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
        }
        return new Response('{}');
    };
    const {notifyProjectOpened} = require('../../src/lib/learning-records.js');
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '學生角色', blocks: {one: {opcode: 'looks_say',
        inputs: {MESSAGE: [1, [10, '開啟的檔案']]}, fields: {}}}}]});
    let root;
    t.after(() => {act(() => root.unmount()); vm.quit(); globalThis.window = oldWindow; globalThis.fetch = oldFetch;});
    act(() => setStudentId('S03'));
    await act(async () => {root = create(React.createElement(JudgePanel, {vm}));});
    await act(async () => notifyProjectOpened('file'));
    assert.equal(records.length, 0, '尚未選題時不記錄');
    const button = text => root.root.findAllByType('button').find(node => node.props.children === text);
    await act(async () => button('選測試題').props.onClick());
    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'open');
    assert.equal(records[0].source, 'file');
    assert.equal(records[0].task.code, 'q1');
    assert.equal(records[0].program.targets[0].blocks.one.inputs.MESSAGE[1][1], '開啟的檔案');
    await act(async () => notifyProjectOpened('restore'));
    assert.equal(records.length, 2);
    assert.equal(records[1].source, 'restore');
    act(() => setStudentId(''));
    await act(async () => notifyProjectOpened('file'));
    assert.equal(records.length, 2, '沒有學生代號時不記錄');
});
test('打開評分紀錄：這題有自己的評分且沒說過想法，導師跳出邀請；只有範例評分或已說過就不問', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = new Map();
    globalThis.window = {location: {protocol: 'http:', hostname: '127.0.0.1'},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}};
    globalThis.fetch = async () => new Response(JSON.stringify({recording: {status: 'saved_local'}}));
    const {markReflected} = require('../../src/lib/learning-records.js');
    const vm = new VM();
    vm.toJSON = () => JSON.stringify({targets: [{name: '學生角色', blocks: {}}]});
    let root;
    t.after(() => {act(() => root.unmount()); vm.quit(); globalThis.window = oldWindow; globalThis.fetch = oldFetch;});
    // 這台電腦上這題只有「載入範例」的評分。
    storage.set('osepJudgeHistory:q1', JSON.stringify([{totalScore: 10, maxScore: 10, timestamp: 1, demoLoaded: true}]));
    act(() => setStudentId('S10'));
    await act(async () => {root = create(React.createElement(JudgePanel, {vm}));});
    const button = text => root.root.findAllByType('button').find(node => node.props.children === text);
    await act(async () => button('選測試題').props.onClick());
    act(() => button('評分紀錄').props.onClick());
    assert.equal(tutorProps.current.reflectionRequest, null, '只有範例評分不問');
    assert.equal(tutorProps.open, false);
    gradeImpl = async () => ({totalScore: 8, maxScore: 10, results: [{pass: true}]});
    act(() => button('評分').props.onClick());
    await act(async () => button('執行評分').props.onClick());
    act(() => button('評分紀錄').props.onClick());
    assert.deepEqual(tutorProps.current.reflectionRequest, {totalScore: 8, maxScore: 10});
    assert.equal(tutorProps.open, true, '導師視窗自動打開');
    act(() => tutorProps.current.onReflectionDone());
    assert.equal(tutorProps.current.reflectionRequest, null);
    act(() => button('評分紀錄').props.onClick());
    assert.deepEqual(tutorProps.current.reflectionRequest, {totalScore: 8, maxScore: 10}, '下次再說後再打開會再問');
    act(() => tutorProps.current.onReflectionDone());
    markReflected('S10', 'q1');
    act(() => button('評分紀錄').props.onClick());
    assert.equal(tutorProps.current.reflectionRequest, null, '說過就不再問');
    act(() => setStudentId(''));
});
