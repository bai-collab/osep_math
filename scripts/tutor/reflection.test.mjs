import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vmModule from 'node:vm';
import {createRecordStore, cleanRecord, summarize, needsV2Sheet} from './record-store.mjs';
import {createTutorServer} from './server.mjs';
import {requestGuidance} from './provider.mjs';
import {analyzeDependency} from './dependency-analysis.mjs';

const require = createRequire(import.meta.url);
// 這些測試用假的 fetch 計算請求；先把教師預覽定為學生模式，不多出預覽查詢。
require('../../src/lib/teacher-preview.js').settlePreviewForTest(false);
const React = require('react');
const {create, act} = require('react-test-renderer');
const records = require('../../src/lib/learning-records.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = path.resolve(root, '../../workspace/osep-judge/reflection');
async function directory (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'run-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}
const program = {targets: [{name: '角色', blocks: {a: {opcode: 'looks_say', inputs: {MESSAGE: [1, [10, 'x']]}, fields: {}}}}]};
const base = {studentId: 'S01', task: {code: 'q1', title: '題目一'}};
const reflection = (extra = {}) => ({id: 'reflect-12345678', ...base, type: 'reflection', status: 'completed',
    source: 'mock', question: '先用詢問讀名字，再說出 Hello 加名字', guidance: '你把順序說得很清楚。',
    followup: '名字存在哪裡？', program, schemaVersion: 2, ...extra});
const skipped = (extra = {}) => ({id: 'reflect-87654321', ...base, type: 'reflection', status: 'completed', skipped: true,
    schemaVersion: 2, ...extra});

test('reflection 紀錄：有內容時要求程式與導師來源；下次再說只記 skipped；需要 v2 試算表；摘要另計', () => {
    const clean = cleanRecord(reflection());
    assert.equal(clean.type, 'reflection');
    assert.equal(clean.question, reflection().question);
    assert.equal(clean.guidance, '你把順序說得很清楚。');
    assert.throws(() => cleanRecord(reflection({program: undefined})));
    assert.throws(() => cleanRecord(reflection({source: 'teacher'})));
    assert.throws(() => cleanRecord(reflection({question: ''})));
    const skip = cleanRecord(skipped({question: '不該保存', program}));
    assert.equal(skip.skipped, true);
    assert.equal(Object.hasOwn(skip, 'question'), false);
    assert.ok(skip.program, '跳過時可附程式');
    assert.equal(Object.hasOwn(cleanRecord(skipped()), 'program'), false);
    assert.throws(() => cleanRecord(skipped({status: 'failed'})));
    assert.equal(needsV2Sheet(skip), true);
    const at = (record, minute) => ({...cleanRecord(record), timestamp: `2026-10-01T00:0${minute}:00Z`});
    const [row] = summarize([at(reflection(), 0), at(skipped(), 1)]);
    assert.equal(row.reflectionCount, 2);
    assert.equal(row.gradeCount, 0);
    assert.equal(row.aiCount, 0);
});

test('HTTP：purpose=reflection 用回饋式回覆並存成 reflection；有內容的想法不能繞過導師直接寫入', async t => {
    const store = createRecordStore(await directory(t));
    const server = createTutorServer({recordStore: store});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
    const url = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(url + route, {method: 'POST',
        headers: {'Origin': url, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const context = {task: {code: 'q1', title: '題目一', description: '公開說明'}, blocks: []};
    const reply = await (await post('/api/tutor', {mode: 'mock', purpose: 'reflection', context,
        question: '先問名字再說出來', learning: {id: 'reflect-12345678', studentId: 'S01', program, schemaVersion: 2}})).json();
    assert.match(reply.guidance, /說明解法/);
    assert.equal(reply.recording.status, 'saved_local');
    const help = await (await post('/api/tutor', {mode: 'mock', context, question: '不會',
        learning: {id: 'ai-1234567890', studentId: 'S01', program}})).json();
    assert.doesNotMatch(help.guidance, /說明解法/);
    assert.equal((await post('/api/records', skipped())).status, 200);
    assert.equal((await post('/api/records', reflection({id: 'forged-12345678'}))).status, 400);
    const saved = await store.list();
    assert.deepEqual(saved.map(r => r.type).sort(), ['ai', 'reflection', 'reflection']);
    assert.equal(saved.find(r => r.id === 'reflect-12345678').question, '先問名字再說出來');
});

test('真模型：reflection 在系統提示加上「回饋、不評對錯、追問一處」，求助則不加', async () => {
    const systems = [];
    const fetchImpl = async (url, options) => {
        systems.push(JSON.parse(options.body).input[0].content);
        return new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'output_text',
            text: JSON.stringify({guidance: '說得很清楚', question: '名字存在哪裡？', relatedBlocks: []})}]}]}));
    };
    const context = {task: {code: 'q1', title: '', description: '說明'}, blocks: [], editor: {renderedBlocks: [], availableBlocks: []}};
    await requestGuidance({apiKey: 'fixture-key-123', context, question: '我的想法', history: [], fetchImpl, purpose: 'reflection'});
    await requestGuidance({apiKey: 'fixture-key-123', context, question: '不會', history: [], fetchImpl});
    assert.match(systems[0], /本輪不是求助/);
    assert.match(systems[0], /不評斷想法對錯/);
    assert.doesNotMatch(systems[1], /本輪不是求助/);
});

test('真正 Apps Script：解題想法與「下次再說」都能寫入並一致讀回', async () => {
    const rows = [], properties = {SHEET_ID: 'TEST', RECORD_TOKEN: 'token-'.repeat(8)};
    let made = false;
    const sheet = {appendRow: row => rows.push(row), setFrozenRows () {}, setColumnWidths () {}, getLastRow: () => rows.length,
        getRange: (row, column, height = 1, width = 1) => ({getValue: () => rows[row - 1]?.[column - 1],
            getValues: () => Array.from({length: height}, (_, i) => rows[row - 1 + i].slice(column - 1, column - 1 + width)),
            setValues: values => values.forEach((value, i) => {rows[row - 1 + i] = value;}),
            setBackground () {return this;}, setFontColor () {return this;}, setFontWeight () {return this;}})};
    const sandbox = {PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key]})},
        ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({text, setMimeType () {return this;}})},
        LockService: {getScriptLock: () => ({waitLock () {}, hasLock: () => true, releaseLock () {}})},
        SpreadsheetApp: {openById: () => ({getSheetByName: () => (made ? sheet : null),
            insertSheet: () => {made = true; return sheet;}}), flush () {}}};
    vmModule.createContext(sandbox);
    vmModule.runInContext(await fs.readFile(path.join(root, 'scripts/tutor/sheets/Code.gs'), 'utf8'), sandbox);
    const call = body => JSON.parse(sandbox.doPost({postData: {contents: JSON.stringify(body)}}).text);
    const token = properties.RECORD_TOKEN, timestamp = '2026-10-12T00:00:00Z';
    assert.equal(call({action: 'append', token, record: {...reflection(), timestamp}}).ok, true);
    assert.equal(call({action: 'append', token, record: {...skipped(), timestamp}}).ok, true);
    assert.equal(call({action: 'append', token, record: {...reflection({id: 'no-program-1'}), program: undefined, timestamp}}).ok, false);
    const read = call({action: 'read', token, offset: 0}).records;
    assert.deepEqual(cleanRecord(read[0]), cleanRecord(reflection()));
    assert.deepEqual(cleanRecord(read[1]), cleanRecord(skipped()));
});

test('依賴分析：解題想法不算求助，只列在提醒的證據裡；回答解題想法的追問算回應追問', () => {
    let second = 0;
    const at = () => `2026-10-12T00:00:${String(second++).padStart(2, '0')}.000Z`;
    const ai = question => ({id: `ai-${String(second).padStart(8, '0')}`, ...base, type: 'ai', status: 'completed',
        source: 'nmking', question, guidance: '先做一步', followup: '你覺得呢？', program, timestamp: at()});
    const passive = ['怎麼做', '然後呢', '下一步', '然後呢'].map(ai);
    const withReflection = [...passive, {...cleanRecord(skipped()), timestamp: at()},
        {...cleanRecord(reflection({question: '不知道'})), timestamp: at()}];
    const [alert] = analyzeDependency(withReflection).alerts;
    assert.equal(alert.requestCount, 4, '解題想法不算求助');
    assert.deepEqual(alert.reflections.map(item => item.skipped), [true, false]);
    assert.equal(alert.reflections[1].text, '不知道');
    const answered = [...passive.slice(0, 1), {...cleanRecord(reflection()), timestamp: at()}, ai('存在名字變數')];
    const result = analyzeDependency(answered);
    assert.equal(result.labels[answered[2].id].primary, 'ANSWERS_FOLLOWUP');
});

test('本機記住已說過解題想法；跳過不算；分頁儲存無法使用時退回本頁記憶體', () => {
    const storage = new Map();
    const oldWindow = globalThis.window;
    globalThis.window = {localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}};
    try {
        assert.equal(records.hasReflected('S01', 'q-local'), false);
        records.markReflected('S01', 'q-local');
        assert.equal(records.hasReflected('S01', 'q-local'), true);
        assert.equal(records.hasReflected('S02', 'q-local'), false);
        assert.ok(JSON.parse(storage.get('osepReflectedTasks')).includes('S01|q-local'));
        globalThis.window = {localStorage: {getItem: () => {throw new Error('blocked');}, setItem: () => {throw new Error('blocked');}}};
        records.markReflected('S01', 'q-memory');
        assert.equal(records.hasReflected('S01', 'q-memory'), true);
    } finally {
        globalThis.window = oldWindow;
    }
});

// 真正的 TutorTab：解題想法表單送出與「下次再說」。
const source = path.resolve(root, 'src/components/judge-panel/tutor-tab.jsx');
const code = require('@babel/core').transformFileSync(source, {babelrc: false, configFile: false,
    presets: [require.resolve('@babel/preset-react')],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const sourceRequire = createRequire(source);
const subject = {exports: {}};
new Function('require', 'module', 'exports', code)(name => {
    if (name === './tutor.css') return {};
    if (name === '../../lib/tw-lazy-scratch-blocks') return {isLoaded: () => false};
    return sourceRequire(name);
}, subject, subject.exports);
const {TutorTab} = subject.exports;

test('導師視窗：顯示分數與邀請、送出想法後記為已說過並收起；下次再說只記跳過', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    const storage = new Map(), requests = [];
    globalThis.window = {location: {protocol: 'http:', hostname: '127.0.0.1'},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}};
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('/api/tutor/status')) {
            return new Response(JSON.stringify({managed: true, aiConfigured: true}), {headers: {'Content-Type': 'application/json'}});
        }
        requests.push({url, body: JSON.parse(options?.body || '{}')});
        if (url === './api/tutor') {
            return new Response(JSON.stringify({source: 'mock', guidance: '你把順序說清楚了', question: '名字存在哪？',
                recording: {status: 'saved_local'}}), {headers: {'Content-Type': 'application/json'}});
        }
        return new Response(JSON.stringify({recording: {status: 'saved_local'}}), {headers: {'Content-Type': 'application/json'}});
    };
    records.setStudentId('S09');
    let done = 0;
    const vm = {toJSON: () => JSON.stringify({targets: [{name: '角色', blocks: {}}]})};
    const task = {code: 'q-ui', title: '測試題', description: '讀取輸入。', examples: []};
    const render = request => React.createElement(TutorTab, {task, vm, apiKey: '', mode: 'mock',
        connection: {managed: true, aiConfigured: true, statusReady: true}, reflectionRequest: request,
        onReflectionDone: () => {done++;}});
    let rootNode;
    t.after(() => {
        act(() => rootNode.unmount()); records.setStudentId(''); globalThis.window = oldWindow; globalThis.fetch = oldFetch;
    });
    act(() => {rootNode = create(render({totalScore: 30, maxScore: 40}));});
    const json = () => JSON.stringify(rootNode.toJSON());
    assert.ok(json().includes('30') && json().includes('一步一步解這題'));
    const form = () => rootNode.root.findByProps({'aria-label': '說說你的解題想法'});
    await act(async () => form().props.onSubmit({preventDefault () {}}));
    assert.equal(requests.length, 0, '空白不送出');
    act(() => rootNode.root.findByProps({id: 'tutor-reflection'}).props.onChange({target: {value: '先問名字再說出來'}}));
    await act(async () => form().props.onSubmit({preventDefault () {}}));
    assert.equal(requests[0].url, './api/tutor');
    assert.equal(requests[0].body.purpose, 'reflection');
    assert.equal(requests[0].body.question, '先問名字再說出來');
    assert.equal(requests[0].body.learning.studentId, 'S09');
    assert.equal(records.hasReflected('S09', 'q-ui'), true);
    assert.equal(done, 1);
    assert.ok(json().includes('你的解題想法：') && json().includes('導師回饋：'));
    act(() => rootNode.update(render({totalScore: 30, maxScore: 40})));
    const skip = rootNode.root.findAllByType('button').find(node => node.props.children === '下次再說');
    await act(async () => skip.props.onClick());
    assert.equal(done, 2);
    assert.equal(requests[1].url, './api/records');
    assert.equal(requests[1].body.type, 'reflection');
    assert.equal(requests[1].body.skipped, true);
    assert.equal(requests[1].body.question, undefined);
});
