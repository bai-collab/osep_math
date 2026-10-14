// osep_math 紀錄格式 v3：階段作品（artifact）、過關判定（gate）、接觸紀錄（exposure）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vmModule from 'node:vm';
import {createRecordStore, cleanRecord, summarize, requiredSheetSchema} from './record-store.mjs';
import {createSheetClient} from './sheet-client.mjs';
import {createTutorServer} from './server.mjs';
const require = createRequire(import.meta.url);
const artifactLib = require('../../src/lib/conjecture-artifact.js');
const learning = require('../../src/lib/learning-records.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = path.resolve(root, '../../workspace/osep-math/conjecture-records');
const program = {targets: [{name: '小貓',
    blocks: {a: {opcode: 'looks_say',
        next: null,
        parent: null,
        inputs: {MESSAGE: [1, [10, '測試']]},
        fields: {},
        shadow: false,
        topLevel: true}}}]};
const v3 = {schemaVersion: 3, sessionId: 'session-12345678', clientTime: '2026-10-14T01:02:03.000Z', selfTestCount: 0};

const ARTIFACTS = {
    EX: {cards: [2, 10],
        examples: [{card: 2, value: 4, source: 'student'}, {card: 2, value: 6, source: 'student'},
            {card: 2, value: 8, source: 'student'}, {card: 2, value: 12, source: 'program'}, {card: 10, value: 20, source: 'program'}],
        classification: [{card: 2, appeared: [0, 2, 4, 6, 8], notAppeared: [1, 3, 5, 7, 9]}],
        trace: '第一次 2×1＝2，個位 2'},
    CG: {conjecture: {text: '只要個位是 0，就是 10 的倍數', template: 'if-then', condition: '個位是 0', conclusion: '是 10 的倍數'}},
    VA: {tests: [{conjectureRef: 'pool-1',
        conjectureText: '個位是偶數就是 4 的倍數',
        number: 14,
        dataFrom: '小華組',
        prediction: 'refute',
        computation: '14÷4＝3…2',
        verdict: 'refutes',
        source: 'student'}],
    poolOpened: true},
    GE: {revision: {before: '看個位就能判斷倍數', after: '在 2、3、4、5、6、10 裡，只有部分的數可以只看個位', reason: '14 推翻了 4'},
        checkedDivisors: [2, 3, 4, 5, 6, 10],
        unknownDivisors: [7]},
    JU: {justification: {text: '因為每一包 10 都能平分成 2 份，所以不管有幾包，只要看剩下的個位', representation: '把 34 拆成 3 包 10 和 4'}}
};
const stageRecord = (type, stage, extra = {}) => ({id: `${type}-${stage}-12345678`,
    studentId: 'S01',
    type,
    status: 'completed',
    task: {code: `C2-1-${stage}`, title: `②-1 ${stage}`},
    unit: 'C2-1',
    stage,
    ...v3,
    ...extra});
const artifact = (stage, extra = {}) => stageRecord('artifact', stage, {artifact: ARTIFACTS[stage], ...extra});
const gate = (stage, gateValue, extra = {}) => stageRecord('gate', stage, {gate: gateValue, ...extra});

async function directory (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'records-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}

function appsScript () {
    const rows = []; const properties = {SHEET_ID: 'TEST', RECORD_TOKEN: 'token-'.repeat(8)};
    const names = [];
    let made = false;
    const sheet = {appendRow: row => rows.push(row),
        setFrozenRows () {},
        setColumnWidths () {},
        getLastRow: () => rows.length,
        getRange: (row, column, height = 1, width = 1) => ({getValue: () => rows[row - 1]?.[column - 1],
            getValues: () => Array.from({length: height}, (_, i) => rows[row - 1 + i].slice(column - 1, column - 1 + width)),
            setValues: values => values.forEach((value, i) => {
                rows[row - 1 + i] = value;
            }),
            setBackground () {
                return this;
            },
            setFontColor () {
                return this;
            },
            setFontWeight () {
                return this;
            }})};
    const sandbox = {PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key]})},
        ContentService: {MimeType: {JSON: 'json'},
            createTextOutput: text => ({text,
                setMimeType () {
                    return this;
                }})},
        LockService: {getScriptLock: () => ({waitLock () {}, hasLock: () => true, releaseLock () {}})},
        SpreadsheetApp: {openById: () => ({getSheetByName: name => {
            names.push(name); return made ? sheet : null;
        },
        insertSheet: name => {
            names.push(name); made = true; return sheet;
        }}),
        flush () {}}};
    return {rows,
        names,
        token: properties.RECORD_TOKEN,
        sandbox,
        load: async () => {
            vmModule.createContext(sandbox);
            vmModule.runInContext(await fs.readFile(path.join(root, 'scripts/tutor/sheets/Code.gs'), 'utf8'), sandbox);
            return body => JSON.parse(sandbox.doPost({postData: {contents: JSON.stringify(body)}}).text);
        }};
}

test('五個階段的作品都能清理；清理兩次結果相同；未知欄位丟棄', () => {
    for (const stage of artifactLib.STAGES) {
        const once = artifactLib.cleanArtifact(stage, {...ARTIFACTS[stage], secretAnswer: '只有 2、5、10'});
        assert.equal(Object.hasOwn(once, 'secretAnswer'), false);
        assert.deepEqual(artifactLib.cleanArtifact(stage, once), once);
        assert.ok(artifactLib.summarizeArtifact(stage, once).length <= 200);
    }
    assert.equal(artifactLib.cleanArtifact('CG', ARTIFACTS.CG).programCondition, false);
    assert.equal(artifactLib.cleanArtifact('CG', {...ARTIFACTS.CG, programCondition: true}).programCondition, true);
});

test('格式不符的作品整筆拒絕', () => {
    const bad = [
        ['EX', {...ARTIFACTS.EX, cards: []}],
        ['EX', {...ARTIFACTS.EX, examples: [{card: 3, value: 6, source: 'student'}]}],
        ['EX', {...ARTIFACTS.EX, classification: [{card: 2, appeared: [0, 2], notAppeared: [2, 3]}]}],
        ['EX', {...ARTIFACTS.EX, classification: [{card: 2, appeared: [0, 0], notAppeared: []}]}],
        ['EX', {...ARTIFACTS.EX, examples: [{card: 2, value: 4, source: 'teacher'}]}],
        ['CG', {conjecture: {text: '   ', template: 'if-then'}}],
        ['CG', {conjecture: {text: 'x'.repeat(301), template: 'if-then'}}],
        ['CG', {conjecture: {text: '個位有規律', template: 'guess'}}],
        ['VA', {tests: [{...ARTIFACTS.VA.tests[0], verdict: 'true'}]}],
        ['VA', {tests: Array(51).fill(ARTIFACTS.VA.tests[0])}],
        ['GE', {...ARTIFACTS.GE, unknownDivisors: [4]}],
        ['GE', {revision: {before: 'a', after: '', reason: 'b'}}],
        ['JU', {justification: {text: ''}}],
        ['XX', ARTIFACTS.CG],
        ['CG', ARTIFACTS.JU]
    ];
    for (const [stage, input] of bad) assert.throws(() => artifactLib.cleanArtifact(stage, input), /INVALID_ARTIFACT/, stage);
});

test('學生端過關判定不能寫入教師確認或由教師判定的檢核', () => {
    const ok = artifactLib.cleanGate('CG', {activityDone: true,
        reasoningStatus: 'not_applicable',
        checks: [{id: 'has-conjecture', met: true, by: 'program'}, {id: 'has-scope', met: true, by: 'ai'}]});
    assert.equal(ok.checks.length, 2);
    assert.throws(() => artifactLib.cleanGate('JU', {activityDone: true, reasoningStatus: 'teacher_confirmed', checks: []}),
        /INVALID_ARTIFACT/);
    assert.throws(() => artifactLib.cleanGate('JU', {activityDone: true,
        reasoningStatus: 'possible',
        checks: [{id: 'reason', met: true, by: 'teacher'}]}), /INVALID_ARTIFACT/);
});

test('artifact／gate／exposure 紀錄：必須 completed 並帶單元與階段；摘要由作品重算、不接受偽造', () => {
    const clean = cleanRecord(artifact('VA', {summary: '全部答對了'}));
    assert.equal(clean.summary, '檢驗1筆｜反駁1｜猜想池已開');
    assert.equal(clean.unit, 'C2-1');
    assert.equal(clean.schemaVersion, 3);
    assert.deepEqual(cleanRecord({...clean, timestamp: 'x'}), clean);
    assert.equal(Object.hasOwn(clean, 'program'), false);
    assert.ok(cleanRecord(artifact('EX', {program})).program);
    assert.throws(() => cleanRecord(artifact('CG', {status: 'failed'})), /INVALID_RECORD/);
    assert.throws(() => cleanRecord(artifact('CG', {unit: 'bad unit'})), /INVALID_ARTIFACT/);
    assert.throws(() => cleanRecord(artifact('CG', {stage: 'XX'})), /INVALID_ARTIFACT/);
    const g = cleanRecord(gate('EX', {activityDone: true,
        reasoningStatus: 'not_applicable',
        checks: [{id: 'examples>=3', met: true, by: 'program'}]}));
    assert.equal(g.gate.activityDone, true);
    assert.throws(() => cleanRecord(gate('JU', {activityDone: true, reasoningStatus: 'teacher_confirmed', checks: []})));
    const e = cleanRecord(stageRecord('exposure', 'VA', {exposure: {item: 'conjecture-pool', ref: 'C2-1-pool'}}));
    assert.deepEqual(e.exposure, {item: 'conjecture-pool', ref: 'C2-1-pool'});
    assert.throws(() => cleanRecord(stageRecord('exposure', 'VA', {exposure: {item: 'answer-key'}})));
});

test('其他類型可選填單元與階段；格式不符時略過而不讓整筆失敗', () => {
    const grade = {id: 'grade-12345678',
        studentId: 'S01',
        type: 'grade',
        status: 'completed',
        task: {code: 'C2-1-EX'},
        program,
        totalScore: 10,
        maxScore: 10,
        demoLoaded: false,
        programChanged: false};
    const withStage = cleanRecord({...grade, unit: 'C2-1', stage: 'EX'});
    assert.equal(withStage.stage, 'EX');
    assert.equal(requiredSheetSchema(withStage), 3);
    const messy = cleanRecord({...grade, unit: 'C2-1', stage: 'ZZ'});
    assert.equal(Object.hasOwn(messy, 'stage'), false);
    assert.equal(Object.hasOwn(messy, 'unit'), false);
    assert.equal(requiredSheetSchema(cleanRecord(grade)), 1);
});

test('教師摘要分開計數階段紀錄，不把作品誤算成評分', () => {
    const at = (record, minute) => ({...cleanRecord(record),
        task: {code: 'C2-1-CG', title: ''},
        timestamp: `2026-10-14T00:0${minute}:00Z`});
    const [row] = summarize([at(artifact('CG'), 0), at(gate('CG', {activityDone: true,
        reasoningStatus: 'not_applicable',
        checks: []}), 1), at(stageRecord('exposure', 'CG', {exposure: {item: 'tutor-hint'}}), 2)]);
    assert.equal(row.artifactCount, 1);
    assert.equal(row.gateCount, 1);
    assert.equal(row.exposureCount, 1);
    assert.equal(row.gradeCount, 0);
    assert.equal(row.latestGrade, null);
});

test('同步：試算表只回報 v2 時，v3 紀錄留在本機並提示更新腳本；回報 v3 後才上傳', async t => {
    const appended = [];
    let schema = 2;
    const client = {info: async () => ({schema}),
        append: async record => {
            appended.push(record.id);
        },
        read: async offset => ({records: [], nextOffset: offset, more: false})};
    const store = createRecordStore(await directory(t), {sheetClient: client});
    await store.save(artifact('CG'));
    let result = await store.sync({pull: false});
    assert.equal(result.pushed, 0);
    assert.equal(result.lastSyncError, 'SHEET_SCRIPT_OUTDATED');
    schema = 3;
    result = await store.sync({pull: false});
    assert.equal(result.pushed, 1);
    assert.equal(result.lastSyncError, '');
    assert.deepEqual(appended, ['artifact-CG-12345678']);
});

test('真正 Apps Script：新分頁、v3 欄位寫入，作品／判定／接觸紀錄一致讀回', async () => {
    const gas = appsScript();
    const call = await gas.load();
    assert.deepEqual(call({action: 'info', token: gas.token}), {ok: true, schema: 3});
    const timestamp = '2026-10-14T00:00:00Z';
    const sent = [
        cleanRecord(artifact('CG')),
        cleanRecord(artifact('EX', {program})),
        cleanRecord(gate('JU', {activityDone: true, reasoningStatus: 'pending', checks: [{id: 'reason', met: false, by: 'ai'}]})),
        cleanRecord(stageRecord('exposure', 'VA', {exposure: {item: 'challenge-card', ref: '小華組'}}))
    ];
    for (const record of sent) assert.equal(call({action: 'append', token: gas.token, record: {...record, timestamp}}).ok, true);
    assert.ok(gas.names.every(name => name === '臆測學習事件'));
    const headers = gas.rows[0];
    const col = name => headers.indexOf(name);
    assert.equal(col('完整紀錄1'), 20);
    const cgRow = gas.rows[1].map(cell => (typeof cell === 'string' ? cell.replace(/^\u200B/, '') : cell));
    assert.equal(cgRow[col('單元')], 'C2-1');
    assert.equal(cgRow[col('階段')], 'CG');
    assert.equal(cgRow[col('作品摘要')], '猜想：只要個位是 0，就是 10 的倍數');
    const juRow = gas.rows[3].map(cell => (typeof cell === 'string' ? cell.replace(/^\u200B/, '') : cell));
    assert.equal(juRow[col('說理狀態')], 'pending');
    const read = call({action: 'read', token: gas.token, offset: 0}).records;
    assert.equal(read.length, 4);
    read.forEach((record, i) => assert.deepEqual(cleanRecord(record), sent[i]));
    // 階段紀錄缺單元或作品物件時，腳本拒絕。
    assert.equal(call({action: 'append', token: gas.token, record: {...sent[0], id: 'no-unit-12345', unit: '', timestamp}}).ok, false);
    assert.equal(call({action: 'append', token: gas.token, record: {...sent[0], id: 'no-art-123456', artifact: null, timestamp}}).ok, false);
});

test('真正 Apps Script：舊版 osep-judge 欄位配置的分頁會被拒絕，不混寫', async () => {
    const gas = appsScript();
    const call = await gas.load();
    gas.rows.push(['事件ID', '時間', '學生代號', '題目代碼', '題目', '類型', '結果', '分數', '滿分', '來源',
        '範例程式', '提問', '引導', '追問', '錯誤代碼', '評分時程式變更', '完整紀錄1', '完整紀錄2', '完整紀錄3', '完整紀錄4']);
    gas.sandbox.SpreadsheetApp.openById = () => ({getSheetByName: () => ({...gasSheet(gas.rows)}), insertSheet () {}});
    const result = call({action: 'append', token: gas.token, record: {...cleanRecord(artifact('CG')), timestamp: '2026-10-14T00:00:00Z'}});
    assert.equal(result.ok, false);
    assert.equal(gas.rows.length, 1);
});
function gasSheet (rows) {
    // 完整可寫入的假分頁：只有表頭檢查能擋下寫入，避免測試因缺少方法而「假通過」。
    return {getLastRow: () => rows.length,
        getRange: (row, column, height = 1, width = 1) => ({getValue: () => rows[row - 1]?.[column - 1],
            getValues: () => Array.from({length: height}, (_, i) => rows[row - 1 + i].slice(column - 1, column - 1 + width)),
            setValues: values => values.forEach((value, i) => {
                rows[row - 1 + i] = value;
            })})};
}

test('HTTP：學生頁可送出階段作品；同一入口仍拒絕 ai 類型', async t => {
    const store = createRecordStore(await directory(t));
    const server = createTutorServer({recordStore: store});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections(); server.close(resolve);
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(`${base}/api/records`, {method: 'POST',
        headers: {'Origin': base, 'Content-Type': 'application/json'},
        body: JSON.stringify(body)});
    let response = await post(artifact('GE'));
    assert.equal((await response.json()).recording.status, 'saved_local');
    response = await post(gate('GE', {activityDone: true, reasoningStatus: 'teacher_confirmed', checks: []}));
    assert.equal(response.status, 400);
    response = await post({...artifact('GE'), id: 'ai-123456789', type: 'ai'});
    assert.equal(response.status, 400);
    const saved = await store.list();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].summary.startsWith('修訂：'), true);
});

test('學生端共同欄位改為 v3，並提供階段紀錄送出函式', () => {
    assert.equal(learning.recordContext('C2-1-EX', Date.parse('2026-10-14T00:00:00Z')).schemaVersion, 3);
    assert.equal(typeof learning.postStageRecord, 'function');
});

test('sheet-client 辨識 schema 3', async () => {
    const url = 'https://script.google.com/macros/s/abc/exec'; const token = 't'.repeat(40);
    const client = createSheetClient({url, token, fetchImpl: async () => new Response(JSON.stringify({ok: true, schema: 3}))});
    assert.deepEqual(await client.info(), {schema: 3});
});
