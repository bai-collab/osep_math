/* eslint-disable import/no-commonjs */
const React = require('react');
const {whenPreviewSettled, isPreview} = require('./teacher-preview.js');
const listeners = new Set();
let studentId = '';
try {
    studentId = window.localStorage.getItem('osepStudentCode') || '';
} catch (e) { /* 本機儲存可能停用。 */ }
const validStudentId = value => /^[\p{L}\p{N}_-]{1,40}$/u.test(value);
// crypto.randomUUID 只在安全來源（https、localhost）提供；區網 http 頁面不是安全來源，
// 改用各情境都有的 crypto.getRandomValues 組出同格式的 RFC 4122 第 4 版 UUID。
const createRecordId = cryptoImpl => {
    if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
    if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
        throw new Error('此瀏覽器無法產生紀錄編號；本次未記錄。');
    }
    const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // 版本 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 變體
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const newRecordId = () => createRecordId(typeof crypto === 'undefined' ? null : crypto);
// 學習段落：同一個分頁閒置超過 20 分鐘就換新的 sessionId（分析時再依學生＋題目分組）。
// 存在 sessionStorage，關閉分頁即結束；無法使用時退回本頁記憶體。
const SESSION_IDLE_MS = 20 * 60 * 1000;
const SESSION_KEY = 'osepLearningSession';
let memorySession = null;
const readSession = () => {
    try {
        const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
        if (stored && typeof stored.id === 'string' && Number.isFinite(stored.lastActive)) return stored;
    } catch (e) { /* 分頁儲存可能停用。 */ }
    return memorySession;
};
const touchSession = (now = Date.now()) => {
    const current = readSession();
    const session = current && now - current.lastActive <= SESSION_IDLE_MS && now >= current.lastActive ?
        {id: current.id, lastActive: now} : {id: newRecordId(), lastActive: now};
    memorySession = session;
    try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) { /* 仍保留本頁記憶體。 */ }
    return session.id;
};
// 自行測試只記次數：各題累計到下一筆求助／評分紀錄時一併送出並歸零。
const selfTestCounts = new Map();
const countSelfTest = taskCode => {
    if (taskCode) selfTestCounts.set(taskCode, (selfTestCounts.get(taskCode) || 0) + 1);
};
const takeSelfTestCount = taskCode => {
    const count = selfTestCounts.get(taskCode) || 0;
    selfTestCounts.delete(taskCode);
    return count;
};
// 開啟專案通知：檔案上傳與還原點元件不知道學生代號與目前題目，只負責通知；由評分面板決定是否記錄。
// source：'file'（從電腦開啟）或 'restore'（載入還原點）。
const projectOpenListeners = new Set();
const notifyProjectOpened = source => {
    projectOpenListeners.forEach(listener => {
        try {
            listener(source);
        } catch (e) { /* 記錄失敗不影響開啟專案。 */ }
    });
};
const onProjectOpened = listener => {
    projectOpenListeners.add(listener);
    return () => projectOpenListeners.delete(listener);
};
// 評分後的解題想法每位學生每題只問到說出一次為止；記在本機瀏覽器（跳過不算說過）。
const REFLECTED_KEY = 'osepReflectedTasks';
const memoryReflected = new Set();
const reflectionKey = (studentIdValue, taskCode) => `${studentIdValue}|${taskCode}`;
const readReflected = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(REFLECTED_KEY) || '[]');
        if (Array.isArray(stored)) return new Set([...stored, ...memoryReflected]);
    } catch (e) { /* 本機儲存可能停用。 */ }
    return new Set(memoryReflected);
};
const hasReflected = (studentIdValue, taskCode) => readReflected().has(reflectionKey(studentIdValue, taskCode));
const markReflected = (studentIdValue, taskCode) => {
    const key = reflectionKey(studentIdValue, taskCode);
    memoryReflected.add(key);
    try {
        window.localStorage.setItem(REFLECTED_KEY, JSON.stringify([...readReflected(), key].slice(-500)));
    } catch (e) { /* 仍保留本頁記憶體。 */ }
};
// 紀錄格式 v3 的共同欄位（v2 欄位＋osep_math 階段紀錄）；clientTime 只供排序參考，正式時間由伺服器決定。
const recordContext = (taskCode, now = Date.now()) => ({
    schemaVersion: 3,
    sessionId: touchSession(now),
    clientTime: new Date(now).toISOString(),
    selfTestCount: takeSelfTestCount(taskCode)
});
const setStudentId = value => {
    studentId = value;
    try {
        window.localStorage.setItem('osepStudentCode', value);
    } catch (e) { /* 仍保留本頁。 */ }
    listeners.forEach(listener => listener(value));
};
const useStudentIdentity = () => {
    const [value, setValue] = React.useState(studentId);
    React.useEffect(() => {
        listeners.add(setValue);
        setValue(studentId);
        return () => listeners.delete(setValue);
    }, []);
    return {studentId: value, setStudentId};
};
// 保存學生程式結構；執行中的變數值、資產及題庫資料不在此快照。
const captureProgram = vm => {
    const project = JSON.parse(vm.toJSON());
    const targets = (project.targets || []).map(target => ({
        name: target.name || '',
        isStage: target.isStage === true,
        variables: Object.fromEntries(Object.entries(target.variables || {}).map(([id, value]) => [id, [value[0], 0]])),
        lists: Object.fromEntries(Object.entries(target.lists || {}).map(([id, value]) => [id, [value[0], []]])),
        blocks: Object.fromEntries(Object.entries(target.blocks || {}).map(([id, block]) => {
            if (Array.isArray(block)) return [id, block];
            const copy = {};
            ['opcode', 'next', 'parent', 'inputs', 'fields', 'shadow', 'topLevel', 'x', 'y'].forEach(key => {
                if (typeof block[key] !== 'undefined') copy[key] = block[key];
            });
            return [id, copy];
        }))
    }));
    const program = {targets};
    if (JSON.stringify(program).length > 120000) throw new Error('程式超過記錄容量；本次程式未記錄。');
    return program;
};
const safeProgram = (vm, apiKey) => {
    const program = captureProgram(vm);
    if (apiKey && JSON.stringify(program).includes(apiKey)) throw new Error('程式文字含有 API 金鑰；請移除後再記錄。');
    return program;
};
const recordingText = recording => {
    if (!recording || recording.status === 'skipped') return '未記錄：請先填寫有效的學生代號。';
    if (recording.status === 'failed') return '記錄失敗；本次結果仍可查看，請回報教師。';
    return '已保存本機紀錄；試算表同步狀態請看教師頁。';
};
// 教師預覽中（教師在這台電腦登入教師頁）不保存任何學習紀錄；第一次確認前先等一下。
const PREVIEW_TEXT = '教師預覽中：這筆紀錄沒有保存。';
const postRecord = async (record, failure) => {
    await whenPreviewSettled();
    if (isPreview()) return PREVIEW_TEXT;
    try {
        const response = await fetch('./api/records', {method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(record)});
        if (!response.ok) return failure;
        return recordingText((await response.json()).recording);
    } catch (e) {
        return failure;
    }
};
const postGradeRecord = record => postRecord(record, '記錄失敗；評分結果仍可查看，請回報教師。');
const postDemoRecord = record => postRecord(record, '載入範例的紀錄沒有保存；範例仍可查看，請回報教師。');
const postSkipReflection = record => postRecord(record, '「下次再說」沒有記錄成功，請回報教師。');
const postOpenRecord = record => postRecord(record, '開啟專案的紀錄沒有保存；專案已開啟，請回報教師。');
// 臆測階段紀錄：作品（artifact）、過關判定（gate）、接觸虛擬資料／挑戰卡／猜想池（exposure）。
const STAGE_FAILURES = {
    artifact: '作品沒有保存成功；畫面上的作品仍在，請回報教師。',
    gate: '過關紀錄沒有保存成功；可以繼續下一階段，請回報教師。',
    exposure: '接觸紀錄沒有保存成功；不影響操作。'
};
const postStageRecord = record => postRecord(record, STAGE_FAILURES[record.type] || '紀錄沒有保存成功，請回報教師。');
// 需要知道「伺服器真的保存了」的呼叫端用這個版本（例如先確認作品存在，才記下查老師回饋用的 id）。
const postStageRecordResult = async record => {
    const failure = STAGE_FAILURES[record.type] || '紀錄沒有保存成功，請回報教師。';
    await whenPreviewSettled();
    if (isPreview()) return {saved: false, text: PREVIEW_TEXT};
    try {
        const response = await fetch('./api/records', {method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(record)});
        if (!response.ok) return {saved: false, text: failure};
        const recording = (await response.json()).recording;
        return {saved: Boolean(recording && recording.status === 'saved_local'), text: recordingText(recording)};
    } catch (e) {
        return {saved: false, text: failure};
    }
};
module.exports = {useStudentIdentity,
    setStudentId,
    validStudentId,
    newRecordId,
    createRecordId,
    captureProgram,
    safeProgram,
    recordingText,
    postGradeRecord,
    postDemoRecord,
    postOpenRecord,
    postSkipReflection,
    postStageRecord,
    postStageRecordResult,
    hasReflected,
    markReflected,
    notifyProjectOpened,
    onProjectOpened,
    touchSession,
    countSelfTest,
    takeSelfTestCount,
    recordContext,
    SESSION_IDLE_MS};
