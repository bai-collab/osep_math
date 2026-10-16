// 教師預覽：伺服器只在「已完成教師設定＋有效教師登入」時回 preview=true；學生頁預覽時不送任何紀錄。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createTeacherSettings} from './teacher-settings.mjs';
import {createTutorServer} from './server.mjs';
import {createRecordStore} from './record-store.mjs';

const require = createRequire(import.meta.url);
const scratch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../workspace/osep-math/teacher-preview-01');
const password = 'test-only-teacher-password';

async function dirFor (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'preview-'));
    t.after(async () => {
        if (!dir.startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}
async function serverFor (t, options) {
    const server = createTutorServer(options);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections();
        server.close(resolve);
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const preview = (cookie = '', init = {}) => fetch(`${base}/api/teacher/preview`,
        {...init, headers: {Cookie: cookie, ...(init.headers || {})}});
    const post = (endpoint, body, cookie = '') => fetch(base + endpoint, {method: 'POST',
        headers: {'Origin': base, 'Content-Type': 'application/json', 'Cookie': cookie}, body: JSON.stringify(body)});
    return {base, preview, post};
}
const value = async response => (await response.json()).preview;
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

test('沒有教師設定（舊版本機試用）時，任何 cookie 都不是預覽', async t => {
    const {preview} = await serverFor(t, {});
    assert.equal(await value(await preview(`osepTeacher=${'a'.repeat(48)}`)), false);
});

test('教師設定尚未完成時不是預覽；完成設定並登入後才是；偽造、登出、改設定後都回到 false', async t => {
    const dir = await dirFor(t);
    const teacherSettings = await createTeacherSettings(path.join(dir, 'teacher-settings.json'));
    const recordStore = createRecordStore(dir, {syncScope: 'offline'});
    const {preview, post} = await serverFor(t, {teacherSettings, recordStore});
    assert.equal(await value(await preview()), false);
    const cookie = cookieOf(await post('/api/teacher/settings', {password}));
    const res = await preview(cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {preview: true});
    assert.equal(res.headers.get('set-cookie'), null, '預覽查詢不發 cookie');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await value(await preview(`osepTeacher=${'b'.repeat(48)}`)), false, '偽造的 token');
    assert.equal(await value(await preview()), false, '沒有 cookie');
    // 只接受 GET、同來源。
    assert.equal((await preview(cookie, {method: 'POST'})).status, 405);
    assert.equal((await preview(cookie, {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
    assert.equal((await preview(cookie, {headers: {'Sec-Fetch-Site': 'same-site'}})).status, 403);
    assert.equal(await value(await preview(cookie, {headers: {'Sec-Fetch-Site': 'same-origin'}})), true);
    // 改設定會清掉所有 session；舊 cookie 不再是預覽。
    const newCookie = cookieOf(await post('/api/teacher/settings', {password: 'new-test-only-password'}, cookie));
    assert.equal(await value(await preview(cookie)), false);
    assert.equal(await value(await preview(newCookie)), true);
    assert.equal((await post('/api/teacher/logout', {}, newCookie)).status, 200);
    assert.equal(await value(await preview(newCookie)), false, '登出後');
});

test('教師登入過期後不是預覽', async t => {
    const dir = await dirFor(t);
    const teacherSettings = await createTeacherSettings(path.join(dir, 'teacher-settings.json'));
    const {preview, post} = await serverFor(t, {teacherSettings, recordStore: createRecordStore(dir, {syncScope: 'offline'})});
    const cookie = cookieOf(await post('/api/teacher/settings', {password}));
    assert.equal(await value(await preview(cookie)), true);
    const realNow = Date.now;
    Date.now = () => realNow() + 3600001;
    try {
        assert.equal(await value(await preview(cookie)), false);
    } finally {
        Date.now = realNow;
    }
});

// ---- 學生頁：預覽時不送紀錄 ----
const previewLib = require('../../src/lib/teacher-preview.js');
const records = require('../../src/lib/learning-records.js');
const PREVIEW_TEXT = '教師預覽中：這筆紀錄沒有保存。';

test('學生頁：預覽中所有紀錄都不送出；第一次確認前先等候；教師登出後回到學生模式', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
        previewLib.resetPreviewForTest();
    });
    globalThis.window = {location: {protocol: 'http:', hostname: '127.0.0.1'}};
    let previewAnswer = true;
    const posted = [];
    let releasePreview = () => {};
    globalThis.fetch = async url => {
        if (url === './api/teacher/preview') {
            await new Promise(resolve => {
                releasePreview = resolve;
            });
            return new Response(JSON.stringify({preview: previewAnswer}));
        }
        posted.push(url);
        return new Response(JSON.stringify({recording: {status: 'saved_local'}}));
    };
    previewLib.resetPreviewForTest();
    // 送紀錄時還沒確認：先等，確認是預覽後就不送。
    const pending = records.postStageRecord({type: 'exposure'});
    const pendingResult = records.postStageRecordResult({type: 'artifact'});
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(posted, []);
    releasePreview();
    assert.equal(await pending, PREVIEW_TEXT);
    assert.deepEqual(await pendingResult, {saved: false, text: PREVIEW_TEXT});
    assert.equal(await records.postGradeRecord({type: 'grade'}), PREVIEW_TEXT);
    assert.deepEqual(posted, []);
    // 教師登出：重新確認後回到學生模式，紀錄照常送出。
    previewAnswer = false;
    const again = previewLib.refreshPreview();
    await new Promise(resolve => setTimeout(resolve, 0));
    releasePreview();
    await again;
    assert.equal(previewLib.isPreview(), false);
    await records.postOpenRecord({type: 'open'});
    assert.deepEqual(posted, ['./api/records']);
});

test('學生頁：服務一直沒回應時，逾時後當作學生模式，不會卡住', async t => {
    const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
    t.after(() => {
        globalThis.window = oldWindow;
        globalThis.fetch = oldFetch;
        previewLib.resetPreviewForTest();
    });
    globalThis.window = {location: {protocol: 'http:', hostname: '127.0.0.1'}};
    const posted = [];
    globalThis.fetch = url => {
        if (url === './api/teacher/preview') return new Promise(() => {});
        posted.push(url);
        return Promise.resolve(new Response(JSON.stringify({recording: {status: 'saved_local'}})));
    };
    previewLib.resetPreviewForTest();
    const started = Date.now();
    await records.postOpenRecord({type: 'open'});
    assert.ok(Date.now() - started >= previewLib.PREVIEW_WAIT_MS - 50);
    assert.equal(previewLib.isPreview(), false);
    assert.deepEqual(posted, ['./api/records']);
});
