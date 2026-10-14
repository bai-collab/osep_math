// osep_math P5f：教師頁臆測進度整理、教師確認說理入口、評分儀表板排除臆測紀錄。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTutorServer} from './server.mjs';
import {createRecordStore, cleanRecord} from './record-store.mjs';
import {createReasoningReviewStore} from './reasoning-review.mjs';
import {buildConjectureView, describeArtifact} from './teacher/conjecture-view.js';
import {buildDashboard} from './teacher/dashboard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const scratch = path.resolve(root, '../../workspace/osep-math/conjecture-teacher');
const v3 = {schemaVersion: 3};
let seq = 0;
const at = minute => `2026-10-14T01:${String(minute).padStart(2, '0')}:00.000Z`;
const rec = (type, stage, extra = {}) => ({id: `${type}-${stage}-${String(++seq).padStart(6, '0')}`, studentId: 'S01',
    type, status: 'completed', task: {code: `C2-1-${stage}`, title: stage}, unit: 'C2-1', stage, ...v3, ...extra});
const ARTIFACT = {
    CG: {conjecture: {text: '只要個位是 0，就是 10 的倍數。', template: 'if-then'}},
    JU: {justification: {text: '因為每一包 10 都可以平分，所以只要看零散的。', representation: '34 拆成 3 包和 4 個'}}
};
const gate = (stage, done, reasoningStatus = 'not_applicable') => ({activityDone: done, reasoningStatus, checks: []});

async function directory (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'records-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}

test('臆測進度：最後一次過關判定決定狀態；同時間以保存順序較後者為準；求助與攔下次數分階段計', () => {
    const records = [
        {...rec('gate', 'EX', {gate: gate('EX', false)}), timestamp: at(1)},
        {...rec('gate', 'EX', {gate: gate('EX', true)}), timestamp: at(2)},
        {...rec('artifact', 'CG', {artifact: ARTIFACT.CG}), timestamp: at(3)},
        // 同一時間：先存的「完成」、後存的「未完成」→ 以後存的為準。
        {...rec('gate', 'CG', {gate: gate('CG', true)}), timestamp: at(4)},
        {...rec('gate', 'CG', {gate: gate('CG', false)}), timestamp: at(4)},
        {...rec('ai', 'VA', {source: 'nmking', question: 'q', errorCode: 'LEAK_FILTERED'}), timestamp: at(5)},
        {...rec('ai', 'VA', {source: 'nmking', question: 'q'}), timestamp: at(6)},
        {...rec('exposure', 'VA', {exposure: {item: 'conjecture-pool'}}), timestamp: at(7)},
        {id: 'grade-plain-1', studentId: 'S01', type: 'grade', status: 'completed', task: {code: 'q1'}, timestamp: at(8)}
    ];
    const [view] = buildConjectureView(records, {});
    assert.equal(view.unit, 'C2-1');
    const [row] = view.students;
    assert.equal(row.stages.EX.status, 'done');
    assert.equal(row.stages.CG.status, 'working');
    assert.equal(row.stages.VA.status, 'working');
    assert.equal(row.stages.VA.aiHelp, 2);
    assert.equal(row.stages.VA.leaks, 1);
    assert.equal(row.stages.GE.status, 'none');
    assert.equal(row.leaks, 1);
    assert.deepEqual(row.exposures.map(e => e.exposure.item), ['conjecture-pool']);
    assert.equal(buildConjectureView([records.at(-1)], {}).length, 0);
});

test('說理狀態：老師確認優先於過關判定；沒有證實作品時不顯示', () => {
    const artifact = {...rec('artifact', 'JU', {artifact: ARTIFACT.JU}), timestamp: at(1)};
    const juGate = {...rec('gate', 'JU', {gate: gate('JU', true, 'possible')}), timestamp: at(2)};
    let [view] = buildConjectureView([artifact, juGate], {});
    assert.equal(view.students[0].stages.JU.reasoning, 'possible');
    [view] = buildConjectureView([artifact, juGate], {[artifact.id]: {status: 'teacher_confirmed', reviewedAt: at(3)}});
    assert.equal(view.students[0].stages.JU.reasoning, 'teacher_confirmed');
    [view] = buildConjectureView([juGate], {});
    assert.equal(view.students[0].stages.JU.reasoning, null);
});

test('作品文字化：五個階段都能讀，不加評語', () => {
    const lines = describeArtifact('VA', {tests: [{number: 14, dataFrom: '小華組', conjectureText: '個位偶數就是 4 的倍數',
        prediction: 'refute', computation: '14÷4＝3…2', verdict: 'refutes', source: 'student'}], poolOpened: true});
    assert.ok(lines[0].includes('先預測推翻') && lines[0].includes('14÷4＝3…2'));
    assert.ok(describeArtifact('CG', ARTIFACT.CG)[0].includes('只要個位是 0'));
    assert.ok(describeArtifact('JU', ARTIFACT.JU).at(-1).includes('每一包'));
    assert.deepEqual(describeArtifact('GE', null), ['（沒有作品）']);
    for (const line of [...describeArtifact('CG', ARTIFACT.CG), ...lines]) assert.equal(/正確|錯誤|很好|不對/.test(line), false);
});

test('評分儀表板不列入臆測紀錄，避免臆測階段顯示成「未做」', () => {
    const {grid, metrics} = buildDashboard([
        {...rec('artifact', 'CG', {artifact: ARTIFACT.CG}), timestamp: at(1)},
        {id: 'grade-1', studentId: 'S02', type: 'grade', status: 'completed', task: {code: 'q1', title: '一般題'},
            totalScore: 10, maxScore: 10, timestamp: at(2)}
    ]);
    assert.deepEqual(grid.tasks.map(task => task.code), ['q1']);
    assert.equal(metrics.students, 1);
});

test('教師確認說理：需登入、同來源；只接受既有的證實作品；GET 紀錄帶回確認結果', async t => {
    const dir = await directory(t);
    const store = createRecordStore(dir);
    const reasoningStore = createReasoningReviewStore(dir);
    const server = createTutorServer({recordStore: store, reasoningStore, teacherPassword: 'fake-teacher-password'});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections();
        server.close(resolve);
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body, headers = {}) => fetch(base + route, {method: 'POST',
        headers: {'Content-Type': 'application/json', 'Origin': base, ...headers}, body: JSON.stringify(body)});
    const ju = cleanRecord(rec('artifact', 'JU', {artifact: ARTIFACT.JU}));
    const cg = cleanRecord(rec('artifact', 'CG', {artifact: ARTIFACT.CG}));
    await store.save(ju);
    await store.save(cg);
    const review = {artifactId: ju.id, status: 'teacher_confirmed', note: '能用包數說明'};
    assert.equal((await post('/api/teacher/reasoning-review', review)).status, 401);
    // 學生頁的紀錄入口也不能寫入教師確認。
    assert.equal((await post('/api/records', {...rec('gate', 'JU', {gate: gate('JU', true, 'teacher_confirmed')})})).status, 400);
    const login = await post('/api/teacher/login', {password: 'fake-teacher-password'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/teacher/reasoning-review', review, {Cookie: cookie, Origin: 'https://other.invalid'})).status, 403);
    assert.equal((await post('/api/teacher/reasoning-review', {...review, artifactId: cg.id}, {Cookie: cookie})).status, 404);
    assert.equal((await post('/api/teacher/reasoning-review', {...review, artifactId: 'missing-123456'}, {Cookie: cookie})).status, 404);
    assert.equal((await post('/api/teacher/reasoning-review', {...review, status: 'possible'}, {Cookie: cookie})).status, 400);
    assert.equal((await post('/api/teacher/reasoning-review', {...review, note: 'x'.repeat(501)}, {Cookie: cookie})).status, 400);
    const ok = await post('/api/teacher/reasoning-review', review, {Cookie: cookie});
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).review.status, 'teacher_confirmed');
    const data = await (await fetch(`${base}/api/records`, {headers: {Cookie: cookie}})).json();
    assert.equal(data.reasoningReviews[ju.id].note, '能用包數說明');
    // 後來改判，以最後一筆為準。
    await post('/api/teacher/reasoning-review', {...review, status: 'needs_work', note: ''}, {Cookie: cookie});
    assert.equal((await reasoningStore.list())[ju.id].status, 'needs_work');
});

test('教師頁有臆測進度分頁，新模組在教師檔案白名單內', async () => {
    const html = await fs.readFile(path.join(here, 'teacher/teacher.html'), 'utf8');
    assert.ok(html.includes('data-view="conjecture"') && html.includes('id="conjecture-view"'));
    const server = await fs.readFile(path.join(here, 'server.mjs'), 'utf8');
    assert.ok(server.includes("'conjecture-view.js'"));
});

test('學生查老師回饋：以作品 id 當憑證並核對學生代號；不需教師登入；不透露作品是否存在', async t => {
    const dir = await directory(t);
    const store = createRecordStore(dir);
    const reasoningStore = createReasoningReviewStore(dir);
    const server = createTutorServer({recordStore: store, reasoningStore, teacherPassword: 'fake-teacher-password'});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections();
        server.close(resolve);
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (artifactId, studentId) => fetch(`${base}/api/student/reasoning-feedback?artifactId=${
        encodeURIComponent(artifactId)}&studentId=${encodeURIComponent(studentId)}`);
    const ju = cleanRecord(rec('artifact', 'JU', {artifact: ARTIFACT.JU}));
    const cg = cleanRecord(rec('artifact', 'CG', {artifact: ARTIFACT.CG}));
    await store.save(ju);
    await store.save(cg);
    let res = await get(ju.id, 'S01');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).review, null);
    await reasoningStore.save({artifactId: ju.id, status: 'needs_work', note: '請用包數說明為什麼不影響'});
    res = await get(ju.id, 'S01');
    const data = await res.json();
    assert.deepEqual(Object.keys(data.review).sort(), ['note', 'reviewedAt', 'status']);
    assert.equal(data.review.status, 'needs_work');
    assert.equal(data.review.note, '請用包數說明為什麼不影響');
    // 別的學生代號、非證實作品、不存在的 id 都回同樣的 404。
    for (const [id, student] of [[ju.id, 'S02'], [cg.id, 'S01'], ['missing-123456', 'S01']]) {
        res = await get(id, student);
        assert.equal(res.status, 404);
        assert.equal((await res.json()).error, '找不到這份作品的回饋。');
    }
    assert.equal((await get('bad id', 'S01')).status, 400);
    assert.equal((await fetch(`${base}/api/student/reasoning-feedback`, {method: 'POST'})).status, 405);
    assert.equal((await fetch(`${base}/api/student/reasoning-feedback?artifactId=${ju.id}&studentId=S01`,
        {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
});

test('區網學生頁可以查老師回饋（路由在學生白名單內），但仍不能送老師確認', async () => {
    const source = await fs.readFile(path.join(here, 'server.mjs'), 'utf8');
    const whitelist = source.slice(source.indexOf('const lanStudentRoute'), source.indexOf('const handle = async'));
    assert.ok(whitelist.includes("'/api/student/reasoning-feedback' && method === 'GET'"));
    assert.equal(whitelist.includes('reasoning-review'), false);
});
