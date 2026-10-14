import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vmModule from 'node:vm';
import {createRecordStore, cleanRecord, summarize, needsV2Sheet} from './record-store.mjs';
import {createSheetClient} from './sheet-client.mjs';
import {createTutorServer} from './server.mjs';
import {analysisContext} from './teacher-analysis.mjs';
const require = createRequire(import.meta.url);
const records = require('../../src/lib/learning-records.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = path.resolve(root, '../../workspace/osep-judge/learning-records-v2');
const program = {targets: [{name: '學生角色', blocks: {a: {opcode: 'looks_say', next: null, parent: null,
    inputs: {MESSAGE: [1, [10, '測試']]}, fields: {}, shadow: false, topLevel: true}}}]};
const v2 = {schemaVersion: 2, sessionId: 'session-12345678', clientTime: '2026-10-12T01:02:03.000Z', selfTestCount: 3};
const grade = (id = 'event-12345678', extra = {}) => ({id, studentId: 'S01', type: 'grade', status: 'completed',
    task: {code: 'q1', title: '題目一'}, program, totalScore: 10, maxScore: 20, demoLoaded: false, programChanged: false,
    ...extra});
const demo = (id = 'demo-12345678', extra = {}) => ({id, studentId: 'S01', type: 'demo', status: 'completed',
    task: {code: 'q1', title: '題目一'}, ...v2, ...extra});
async function directory(t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'records-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}

test('v1 紀錄清理結果不變；v2 欄位保留，格式不符的選填欄位略過而不讓整筆失敗', () => {
    assert.deepEqual(Object.keys(cleanRecord(grade())).sort(),
        ['demoLoaded', 'errorCode', 'id', 'maxScore', 'programChanged', 'program', 'status', 'studentId', 'task', 'totalScore', 'type'].sort());
    const clean = cleanRecord(grade(undefined, v2));
    for (const [key, value] of Object.entries(v2)) assert.equal(clean[key], value);
    const messy = cleanRecord(grade(undefined, {schemaVersion: 3, sessionId: 'bad id', clientTime: 'not-a-date',
        selfTestCount: -1}));
    for (const key of Object.keys(v2)) assert.equal(Object.hasOwn(messy, key), false);
    for (const selfTestCount of [1.5, '3', 100001, NaN]) {
        assert.equal(Object.hasOwn(cleanRecord(grade(undefined, {selfTestCount})), 'selfTestCount'), false);
    }
    assert.equal(cleanRecord(grade(undefined, {selfTestCount: 0})).selfTestCount, 0);
});

test('demo 紀錄不需要也不保存程式；只接受 completed', () => {
    const clean = cleanRecord(demo(undefined, {program, totalScore: 10, question: 'x'}));
    assert.equal(clean.type, 'demo');
    for (const key of ['program', 'totalScore', 'question', 'demoLoaded']) assert.equal(Object.hasOwn(clean, key), false);
    assert.equal(clean.sessionId, v2.sessionId);
    assert.throws(() => cleanRecord(demo(undefined, {status: 'failed'})), /INVALID_RECORD/);
    assert.throws(() => cleanRecord({...demo(), type: 'copy'}), /INVALID_RECORD/);
    assert.throws(() => cleanRecord({...grade(), program: undefined}), /INVALID_PROGRAM/);
});

test('成績摘要：demo 只計次數，不影響有效成績與最後程式', () => {
    const at = (record, minute) => ({...record, timestamp: `2026-10-01T00:0${minute}:00Z`});
    const [row] = summarize([at(grade('grade-1234567'), 0), at(demo('demo-1234567'), 1)]);
    assert.equal(row.demoCount, 1);
    assert.equal(row.gradeCount, 1);
    assert.equal(row.aiCount, 0);
    assert.equal(row.latestGrade.id, 'grade-1234567');
    assert.equal(row.latestProgram, 'grade-1234567');
    assert.equal(summarize([at(demo(), 0)])[0].latestProgram, undefined);
});

test('新舊格式混合寫入後重啟可完整讀回', async t => {
    const dir = await directory(t), store = createRecordStore(dir);
    await store.save(grade('old-format-1'));
    await store.save(grade('new-format-1', v2));
    await store.save(demo());
    await store.save(demo());
    const reloaded = await createRecordStore(dir).list();
    assert.equal(reloaded.length, 3);
    assert.equal(reloaded.find(r => r.id === 'new-format-1').selfTestCount, 3);
    assert.equal(Object.hasOwn(reloaded.find(r => r.id === 'old-format-1'), 'sessionId'), false);
    assert.equal(reloaded.find(r => r.type === 'demo').program, undefined);
});

test('舊版試算表：v2 與 demo 紀錄暫留本機、v1 照常上傳；更新腳本後補傳', async t => {
    const dir = await directory(t);
    let schema = 1;
    const appended = [];
    const sheetClient = {info: async () => ({schema}), append: async record => {appended.push(record.id);},
        read: async offset => ({records: [], nextOffset: offset, more: false})};
    const store = createRecordStore(dir, {sheetClient});
    await store.save(grade('old-format-1'));
    await store.save(grade('new-format-1', v2));
    await store.save(demo());
    const first = await store.sync();
    assert.deepEqual(appended, ['old-format-1']);
    assert.equal(first.lastSyncError, 'SHEET_SCRIPT_OUTDATED');
    assert.equal(first.pending, 2);
    schema = 2;
    const second = await store.sync();
    assert.equal(second.lastSyncError, '');
    assert.equal(second.pending, 0);
    assert.deepEqual(appended.sort(), ['demo-12345678', 'new-format-1', 'old-format-1']);
    assert.equal(needsV2Sheet(cleanRecord(grade())), false);
    assert.equal(needsV2Sheet(cleanRecord(demo())), true);
});

test('舊版試算表下自動同步不會無限重試', async t => {
    const dir = await directory(t);
    let infoCalls = 0;
    const sheetClient = {info: async () => {infoCalls++; return {schema: 1};}, append: async () => {},
        read: async offset => ({records: [], nextOffset: offset, more: false})};
    const store = createRecordStore(dir, {sheetClient});
    await store.save(demo());
    store.autoSync();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(infoCalls, 1);
    assert.equal((await store.status()).pending, 1);
});

test('同步用戶端：舊版腳本拒絕 info 視為 v1；新版回報 v2；網路錯誤照常拋出', async () => {
    const url = 'https://script.google.com/macros/s/abc/exec', token = 't'.repeat(32);
    const respond = body => async () => new Response(JSON.stringify(body));
    assert.deepEqual(await createSheetClient({url, token, fetchImpl: respond({ok: false, code: 'INVALID_ACTION'})}).info(), {schema: 1});
    assert.deepEqual(await createSheetClient({url, token, fetchImpl: respond({ok: true, schema: 2})}).info(), {schema: 2});
    assert.deepEqual(await createSheetClient({url, token, fetchImpl: respond({ok: true})}).info(), {schema: 1});
    await assert.rejects(createSheetClient({url, token, fetchImpl: async () => {throw new Error('offline');}}).info(), /offline/);
});

test('HTTP：學生頁可送出 demo 紀錄；求助紀錄保存 v2 欄位；其他類型仍拒絕', async t => {
    const store = createRecordStore(await directory(t));
    const server = createTutorServer({recordStore: store});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(base + route, {method: 'POST',
        headers: {Origin: base, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    assert.equal((await (await post('/api/records', demo())).json()).recording.status, 'saved_local');
    assert.equal((await post('/api/records', {...demo('demo-87654321'), type: 'ai'})).status, 400);
    const context = {task: {code: 'q1', title: '題目一', description: '公開說明'}, blocks: []};
    const response = await post('/api/tutor', {mode: 'mock', context, question: '怎麼做',
        learning: {id: 'ai-123456789', studentId: 'S01', program, ...v2}});
    assert.equal((await response.json()).recording.status, 'saved_local');
    const saved = await store.list();
    assert.equal(saved.length, 2);
    const ai = saved.find(r => r.type === 'ai');
    for (const [key, value] of Object.entries(v2)) assert.equal(ai[key], value);
});

test('真正Apps Script：info、demo 無程式、v2 欄位可寫入並讀回；一般紀錄仍要求程式', async () => {
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
    const token = properties.RECORD_TOKEN;
    assert.equal(call({action: 'info', token: 'wrong'}).ok, false);
    assert.deepEqual(call({action: 'info', token}), {ok: true, schema: 2});
    const timestamp = '2026-10-12T00:00:00Z';
    assert.equal(call({action: 'append', token, record: {...demo(), timestamp, program, secret: 'X'}}).ok, true);
    assert.equal(call({action: 'append', token, record: {...grade('grade-v2-1234', v2), timestamp}}).ok, true);
    assert.equal(call({action: 'append', token, record: {...grade('no-program-1'), program: undefined, timestamp}}).ok, false);
    assert.equal(rows.length, 3);
    assert.equal(rows[1][5], '​demo');
    const read = call({action: 'read', token, offset: 0}).records;
    assert.equal(read[0].type, 'demo');
    assert.equal(read[0].program, undefined);
    assert.equal(read[0].secret, undefined);
    for (const [key, value] of Object.entries(v2)) {
        assert.equal(read[0][key], value);
        assert.equal(read[1][key], value);
    }
    // 讀回的紀錄要能通過本機清理，且與原本一致，才不會在同步時造成 ID 衝突。
    assert.deepEqual(cleanRecord(read[0]), cleanRecord(demo()));
    assert.deepEqual(cleanRecord(read[1]), cleanRecord(grade('grade-v2-1234', v2)));
});

test('學習段落：20 分鐘內沿用同一個 sessionId，超過就換新；時間倒退也換新', () => {
    const storage = new Map();
    const oldWindow = globalThis.window;
    globalThis.window = {sessionStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}};
    try {
        const start = 1_800_000_000_000;
        const first = records.touchSession(start);
        assert.match(first, /^[a-f0-9-]{36}$/);
        assert.equal(records.touchSession(start + records.SESSION_IDLE_MS), first);
        const later = start + (2 * records.SESSION_IDLE_MS);
        assert.equal(records.touchSession(later), first);
        const fresh = records.touchSession(later + records.SESSION_IDLE_MS + 1);
        assert.notEqual(fresh, first);
        assert.notEqual(records.touchSession(later), fresh);
    } finally {
        globalThis.window = oldWindow;
    }
});

test('分頁儲存無法使用時，學習段落退回本頁記憶體', () => {
    const oldWindow = globalThis.window;
    globalThis.window = {sessionStorage: {getItem: () => {throw new Error('blocked');}, setItem: () => {throw new Error('blocked');}}};
    try {
        const first = records.touchSession(1_900_000_000_000);
        assert.equal(records.touchSession(1_900_000_000_100), first);
    } finally {
        globalThis.window = oldWindow;
    }
});

test('自行測試只記次數：各題分開累計，取用後歸零；recordContext 帶齊 v2 欄位', () => {
    records.countSelfTest('q1');
    records.countSelfTest('q1');
    records.countSelfTest('q2');
    records.countSelfTest('');
    assert.equal(records.takeSelfTestCount('q1'), 2);
    assert.equal(records.takeSelfTestCount('q1'), 0);
    records.countSelfTest('q1');
    const context = records.recordContext('q1', Date.parse('2026-10-12T00:00:00Z'));
    assert.equal(context.schemaVersion, 2);
    assert.equal(context.selfTestCount, 1);
    assert.equal(context.clientTime, '2026-10-12T00:00:00.000Z');
    assert.equal(typeof context.sessionId, 'string');
    assert.equal(records.takeSelfTestCount('q2'), 1);
    assert.doesNotThrow(() => cleanRecord(grade(undefined, context)));
});

test('教師分析：demo 紀錄與 v2 欄位帶進分析內容；舊紀錄的自行測試次數為 null 而不是 0', () => {
    const at = (record, minute) => ({...cleanRecord(record), timestamp: `2026-10-01T00:0${minute}:00Z`});
    const context = analysisContext([at(grade(), 0), at(demo(), 1)]);
    assert.equal(context.records[0].selfTestCount, null);
    assert.equal(context.records[0].sessionId, null);
    assert.equal(context.records[1].type, 'demo');
    assert.equal(context.records[1].selfTestCount, 3);
    assert.equal(context.records[1].programSummary, null);
});

test('open 紀錄：只接受 file／restore；程式快照可有可無；計入摘要；需要 v2 試算表', () => {
    const open = (extra = {}) => ({id: 'open-12345678', studentId: 'S01', type: 'open', status: 'completed',
        source: 'file', task: {code: 'q1', title: '題目一'}, ...v2, ...extra});
    const withProgram = cleanRecord(open({program, question: 'x'}));
    assert.equal(withProgram.source, 'file');
    assert.deepEqual(withProgram.program, cleanRecord(grade()).program);
    assert.equal(Object.hasOwn(withProgram, 'question'), false);
    assert.equal(Object.hasOwn(cleanRecord(open()), 'program'), false);
    assert.equal(cleanRecord(open({source: 'restore'})).source, 'restore');
    for (const bad of [{source: 'cloud'}, {source: undefined}, {status: 'failed'}, {program: {targets: 'x'}}]) {
        assert.throws(() => cleanRecord(open(bad)));
    }
    assert.equal(needsV2Sheet(cleanRecord(open())), true);
    const at = (record, minute) => ({...cleanRecord(record), timestamp: `2026-10-01T00:0${minute}:00Z`});
    const [row] = summarize([at(grade(), 0), at(open({program}), 1), at(open({id: 'open-87654321'}), 2)]);
    assert.equal(row.openCount, 2);
    assert.equal(row.latestProgram, 'open-12345678');
});

test('HTTP 與真正 Apps Script：open 紀錄可保存、上傳並一致讀回', async t => {
    const store = createRecordStore(await directory(t));
    const server = createTutorServer({recordStore: store});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
    const base = `http://127.0.0.1:${server.address().port}`;
    const open = {id: 'open-12345678', studentId: 'S01', type: 'open', status: 'completed', source: 'restore',
        task: {code: 'q1', title: '題目一'}, ...v2};
    const response = await fetch(`${base}/api/records`, {method: 'POST',
        headers: {'Origin': base, 'Content-Type': 'application/json'}, body: JSON.stringify(open)});
    assert.equal((await response.json()).recording.status, 'saved_local');
    assert.equal((await store.list())[0].source, 'restore');

    const rows = [], properties = {SHEET_ID: 'TEST', RECORD_TOKEN: 'token-'.repeat(8)};
    const sheet = {appendRow: row => rows.push(row), setFrozenRows () {}, setColumnWidths () {}, getLastRow: () => rows.length,
        getRange: (row, column, height = 1, width = 1) => ({getValue: () => rows[row - 1]?.[column - 1],
            getValues: () => Array.from({length: height}, (_, i) => rows[row - 1 + i].slice(column - 1, column - 1 + width)),
            setValues: values => values.forEach((value, i) => {rows[row - 1 + i] = value;}),
            setBackground () {return this;}, setFontColor () {return this;}, setFontWeight () {return this;}})};
    let made = false;
    const sandbox = {PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key]})},
        ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({text, setMimeType () {return this;}})},
        LockService: {getScriptLock: () => ({waitLock () {}, hasLock: () => true, releaseLock () {}})},
        SpreadsheetApp: {openById: () => ({getSheetByName: () => (made ? sheet : null),
            insertSheet: () => {made = true; return sheet;}}), flush () {}}};
    vmModule.createContext(sandbox);
    vmModule.runInContext(await fs.readFile(path.join(root, 'scripts/tutor/sheets/Code.gs'), 'utf8'), sandbox);
    const call = body => JSON.parse(sandbox.doPost({postData: {contents: JSON.stringify(body)}}).text);
    const token = properties.RECORD_TOKEN, timestamp = '2026-10-12T00:00:00Z';
    assert.equal(call({action: 'append', token, record: {...open, timestamp}}).ok, true);
    assert.equal(call({action: 'append', token, record: {...open, id: 'open-with-prog', program, timestamp}}).ok, true);
    const read = call({action: 'read', token, offset: 0}).records;
    assert.deepEqual(cleanRecord(read[0]), cleanRecord(open));
    assert.deepEqual(cleanRecord(read[1]), cleanRecord({...open, id: 'open-with-prog', program}));
});

test('開啟專案通知：通知所有訂閱者，取消訂閱後不再收到，訂閱者出錯不影響其他人', () => {
    const received = [];
    const offBroken = records.onProjectOpened(() => {throw new Error('broken');});
    const off = records.onProjectOpened(source => received.push(source));
    records.notifyProjectOpened('file');
    off();
    offBroken();
    records.notifyProjectOpened('restore');
    assert.deepEqual(received, ['file']);
});
