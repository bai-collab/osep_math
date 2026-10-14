import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {labelQuestion, analyzeDependency, createReviewStore, alertIdFor, THRESHOLDS} from './dependency-analysis.mjs';
import {createRecordStore} from './record-store.mjs';
import {createTutorServer} from './server.mjs';
import {createTeacherSettings} from './teacher-settings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = path.resolve(root, '../../workspace/osep-judge/dependency-analysis');
async function directory (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'run-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}
const programWith = text => ({targets: [{name: '角色', isStage: false, variables: {}, lists: {}, blocks: {a: {opcode: 'looks_say',
    inputs: {MESSAGE: [1, [10, text]]}, fields: {}}}}]});
let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 12, 0, 0, clock++)).toISOString();
const ai = (question, extra = {}) => ({id: `ai-${String(clock).padStart(8, '0')}`, studentId: 'S01', type: 'ai',
    status: 'completed', source: 'nmking', task: {code: 'q1', title: '題目一'}, question, guidance: '先想想',
    followup: '你試了什麼？', program: programWith('同一份'), selfTestCount: 0, timestamp: at(), ...extra});
const grade = (extra = {}) => ({id: `grade-${String(clock).padStart(8, '0')}`, studentId: 'S01', type: 'grade',
    status: 'completed', task: {code: 'q1', title: '題目一'}, program: programWith('同一份'), totalScore: 0, maxScore: 10,
    demoLoaded: false, programChanged: false, timestamp: at(), ...extra});
const dependentSession = (count = 4) => Array.from({length: count}, (_, i) =>
    ai(['這題怎麼做', '然後呢', '好了，下一步', '不會', '直接告訴我答案'][i % 5]));

test('提問標籤：常見的小學生說法（第一輪，沒有追問可回應）', () => {
    const cases = [
        ['可以直接告訴我答案嗎', 'ASK_ANSWER'],
        ['幫我寫這題', 'ASK_ANSWER'],
        ['然後呢', 'NEXT_STEP'],
        ['我放好了，下一步', 'NEXT_STEP'],
        ['好', 'NEXT_STEP'],
        ['OK!', 'NEXT_STEP'],
        ['我不會', 'STUCK'],
        ['這題怎麼做', 'STUCK'],
        ['我試了用重複，結果一直跑出0', 'DESCRIBES_ATTEMPT'],
        ['為什麼會輸出兩次', 'DESCRIBES_ATTEMPT'],
        ['詢問並等待是什麼意思', 'ASK_CONCEPT'],
        ['先問名字', 'UNKNOWN'],
        ['？？', 'UNKNOWN'],
        ['', 'UNKNOWN']
    ];
    for (const [question, expected] of cases) assert.equal(labelQuestion(question).primary, expected, question);
    const mixed = labelQuestion('我試過了還是不對，可以給我答案嗎');
    assert.ok(mixed.labels.includes('ASK_ANSWER') && mixed.labels.includes('DESCRIBES_ATTEMPT'));
});

test('導師追問之後：簡短的回答算回應追問；被動用語與問概念不算', () => {
    const after = question => labelQuestion(question, {afterFollowup: true});
    assert.equal(after('先問名字').primary, 'ANSWERS_FOLLOWUP');
    assert.equal(after('放在說出裡面').primary, 'ANSWERS_FOLLOWUP');
    assert.ok(after('因為要先知道名字').labels.includes('ANSWERS_FOLLOWUP'));
    for (const passive of ['然後呢', '好', '不知道', '直接給我答案']) {
        assert.equal(after(passive).labels.includes('ANSWERS_FOLLOWUP'), false, passive);
    }
    assert.equal(after('變數是什麼').labels.includes('ANSWERS_FOLLOWUP'), false);
    assert.equal(after('？？').labels.includes('ANSWERS_FOLLOWUP'), false);
});

test('一路只回「然後呢／不會／要答案」→ 提醒；3 次不提醒', () => {
    const result = analyzeDependency(dependentSession(4));
    assert.equal(result.alerts.length, 1);
    const [alert] = result.alerts;
    assert.equal(alert.id, alertIdFor('S01', 'q1'));
    assert.equal(alert.requestCount, 4);
    assert.equal(alert.passiveCount, 4);
    assert.deepEqual(alert.labelCounts, {ASK_ANSWER: 0, NEXT_STEP: 2, STUCK: 2});
    assert.equal(alert.evidenceRecordIds.length, 4);
    assert.equal(Object.keys(result.labels).length, 4);
    assert.equal(analyzeDependency(dependentSession(THRESHOLDS.minRequests - 1)).alerts.length, 0);
});

test('照著導師一步步做（每次都有放積木）但只回「然後呢」，仍然提醒，並註明程式有變動', () => {
    const records = ['怎麼做', '然後呢', '好了然後呢', '下一步', '然後呢'].map((question, i) =>
        ai(question, {program: programWith(`第${i}步`)}));
    const [alert] = analyzeDependency(records).alerts;
    assert.ok(alert, '程式一直在變也要提醒：依賴的樣子是照著步驟做');
    assert.equal(alert.changedGaps, 4);
    assert.equal(alert.gaps, 4);
});

test('只要有一次回應追問或說明想法就不提醒', () => {
    assert.equal(analyzeDependency([...dependentSession(5), ai('先問名字再說出來')]).alerts.length, 0);
    assert.equal(analyzeDependency([...dependentSession(5), ai('我把變數改成答案，結果還是錯誤')]).alerts.length, 0);
});

test('被動提問比例不到 75% 不提醒（問概念、無法判斷不算被動）', () => {
    const records = [ai('不會'), ai('不會', {followup: ''}), ai('什麼是變數', {followup: ''}), ai('？？', {followup: ''})];
    assert.equal(analyzeDependency(records).alerts.length, 0);
});

test('換了學習段落後的第一句不算回應上一段的追問', () => {
    const records = [ai('不會', {sessionId: 'session-aaaaaaaa'}), ai('先問名字', {sessionId: 'session-bbbbbbbb'})];
    const labels = analyzeDependency(records).labels;
    assert.equal(labels[records[1].id].primary, 'UNKNOWN');
    const same = [ai('不會', {sessionId: 'session-aaaaaaaa'}), ai('先問名字', {sessionId: 'session-aaaaaaaa'})];
    assert.equal(analyzeDependency(same).labels[same[1].id].primary, 'ANSWERS_FOLLOWUP');
});

test('求助之間的自行測試與評分只當證據說明，不影響是否提醒', () => {
    const records = [ai('不會'), grade(), ai('然後呢', {selfTestCount: 2}), ai('然後呢'), ai('下一步')];
    const [alert] = analyzeDependency(records).alerts;
    assert.equal(alert.checkedGaps, 1, '評分與自行測試都在第一個間隔');
});

test('模擬提示與失敗的求助不算；不同學生、不同題目分開判斷', () => {
    const mock = dependentSession(4).map(record => ({...record, source: 'mock'}));
    assert.equal(analyzeDependency(mock).alerts.length, 0);
    const failed = dependentSession(4).map(record => ({...record, status: 'failed'}));
    assert.equal(analyzeDependency(failed).alerts.length, 0);
    const split = dependentSession(4).map((record, i) => ({...record, task: {code: `q${i % 2}`, title: ''}}));
    assert.equal(analyzeDependency(split).alerts.length, 0);
    const twoStudents = [...dependentSession(4), ...dependentSession(4).map(r => ({...r, id: `${r.id}-b`, studentId: 'S02'}))];
    assert.deepEqual(analyzeDependency(twoStudents).alerts.map(a => a.studentId).sort(), ['S01', 'S02']);
});

test('舊格式紀錄沒有自行測試次數時註明限制', () => {
    const records = dependentSession(4).map(({selfTestCount, ...rest}) => rest);
    const [alert] = analyzeDependency(records).alerts;
    assert.ok(alert.limitations.some(text => text.includes('沒有自行測試次數')));
});

test('審查紀錄：只新增、以最後一筆為準、重啟後保留；格式錯誤拒絕；警示帶出審查後的新求助數', async t => {
    const dir = await directory(t);
    const store = createReviewStore(dir);
    const alertId = alertIdFor('S01', 'q1');
    await store.save({alertId, status: 'confirmed', note: '已個別談過'});
    const reviewed = await store.save({alertId, status: 'false_positive'});
    const reviews = await createReviewStore(dir).list();
    assert.equal(reviews.get(alertId).status, 'false_positive');
    assert.equal((await fs.readFile(path.join(dir, 'dependency-reviews.jsonl'), 'utf8')).trim().split('\n').length, 2);
    for (const bad of [{alertId, status: 'deleted'}, {alertId: 'x', status: 'open'}, {alertId, status: 'open', note: 'x'.repeat(501)}]) {
        await assert.rejects(store.save(bad), /INVALID_REVIEW/);
    }
    const later = [...dependentSession(4).map(r => ({...r, timestamp: '2026-01-01T00:00:00.000Z'})),
        ai('不會', {timestamp: new Date(Date.parse(reviewed.reviewedAt) + 1000).toISOString()})];
    const [alert] = analyzeDependency(later, reviews).alerts;
    assert.equal(alert.review.status, 'false_positive');
    assert.equal(alert.newSinceReview, 1);
});

test('HTTP：紀錄 API 帶出依賴分析；審查 API 需要教師登入、同來源，區網一律拒絕', async t => {
    const dir = await directory(t);
    const recordStore = createRecordStore(dir), reviewStore = createReviewStore(dir);
    for (const record of dependentSession(4)) {
        const {timestamp, ...input} = record;
        await recordStore.save(input);
    }
    const teacherSettings = await createTeacherSettings(path.join(dir, 'teacher-settings.json'));
    await teacherSettings.save({password: 'teacher-password-123'});
    const server = createTutorServer({recordStore, reviewStore, teacherSettings, lan: {address: '127.0.0.1'}});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => server.lanServer.listen(0, '127.0.0.1', resolve));
    t.after(() => Promise.all([server, server.lanServer].map(s => new Promise(resolve => {
        s.closeAllConnections(); s.close(resolve);
    }))));
    const base = `http://127.0.0.1:${server.address().port}`;
    const lanBase = `http://127.0.0.1:${server.lanServer.address().port}`;
    const post = (url, body, headers = {}) => fetch(url, {method: 'POST',
        headers: {'Origin': new URL(url).origin, 'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
    const alertId = alertIdFor('S01', 'q1');
    assert.equal((await post(`${base}/api/teacher/dependency-review`, {alertId, status: 'confirmed'})).status, 401);
    assert.equal((await post(`${lanBase}/api/teacher/dependency-review`, {alertId, status: 'confirmed'})).status, 403);
    const login = await post(`${base}/api/teacher/login`, {password: 'teacher-password-123'});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await post(`${base}/api/teacher/dependency-review`, {alertId, status: 'confirmed'},
        {Cookie: cookie, Origin: 'http://evil.invalid'})).status, 403);
    assert.equal((await post(`${base}/api/teacher/dependency-review`, {alertId, status: 'bad'}, {Cookie: cookie})).status, 400);
    assert.equal((await post(`${base}/api/teacher/dependency-review`, {alertId, status: 'confirmed'}, {Cookie: cookie})).status, 200);
    const body = await (await fetch(`${base}/api/records`, {headers: {Cookie: cookie}})).json();
    assert.equal(body.dependency.alerts.length, 1);
    assert.equal(body.dependency.alerts[0].review.status, 'confirmed');
    assert.equal(Object.keys(body.dependency.labels).length, 4);
    assert.equal(body.records.length, 4, '原始紀錄不受審查影響');
});
