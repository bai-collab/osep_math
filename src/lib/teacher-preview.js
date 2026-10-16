/* eslint-disable import/no-commonjs */
/**
 * 教師預覽：教師在同一台電腦的瀏覽器登入教師頁後，學生頁五個階段全部解鎖，方便預覽。
 *
 * - 是否預覽只問本機服務 GET ./api/teacher/preview（伺服器核對教師登入；區網一律 403）。
 * - 預覽中不送出任何學習紀錄（作品、過關、接觸、開專案、評分、導師對話），也不寫入學生的本機進度。
 * - 第一次查詢完成前，紀錄先等一下（最多 PREVIEW_WAIT_MS），避免載入時搶先送出；查不到一律當作學生模式。
 * - 視窗重新取得焦點時再查一次：教師登出或登入過期就回到學生模式。
 */
const {useEffect, useState} = require('react');

const PREVIEW_WAIT_MS = 1500;

let preview = false;
let settled = false;
let request = null;
let settleWaiters = [];
const listeners = new Set();

const isServicePage = () => typeof window !== 'undefined' && Boolean(window.location) &&
    window.location.protocol === 'http:' && Boolean(window.location.hostname);

const settle = value => {
    const changed = value !== preview || !settled;
    preview = value;
    settled = true;
    settleWaiters.forEach(resolve => resolve());
    settleWaiters = [];
    if (changed) listeners.forEach(listener => listener());
};

const refreshPreview = () => {
    if (!isServicePage() || typeof fetch !== 'function') {
        settle(false);
        return Promise.resolve(preview);
    }
    if (request) return request;
    // 服務沒回應時不讓畫面卡住：逾時先當作學生模式，之後回應到了再更新。
    if (!settled) {
        setTimeout(() => {
            if (!settled) settle(false);
        }, PREVIEW_WAIT_MS);
    }
    request = fetch('./api/teacher/preview', {credentials: 'same-origin'})
        .then(response => (response.ok ? response.json() : {preview: false}))
        .then(body => settle(Boolean(body) && body.preview === true))
        .catch(() => settle(false))
        .then(() => {
            request = null;
            return preview;
        });
    return request;
};

// 送紀錄前呼叫：第一次查詢完成（或逾時）後才回來。逾時只代表「還不知道」，不會把預覽當成真。
const whenPreviewSettled = () => {
    if (settled) return Promise.resolve();
    if (!request) refreshPreview();
    return new Promise(resolve => {
        const timer = setTimeout(resolve, PREVIEW_WAIT_MS);
        settleWaiters.push(() => {
            clearTimeout(timer);
            resolve();
        });
    });
};

const isPreview = () => preview;
const isPreviewSettled = () => settled;

// 回傳 {preview, settled}：settled 為 false 時還不知道是否預覽，畫面先不要讀寫進度或送紀錄。
const useTeacherPreview = () => {
    const [value, setValue] = useState(() => ({preview, settled}));
    useEffect(() => {
        const listener = () => setValue({preview, settled});
        listeners.add(listener);
        listener();
        refreshPreview();
        const onFocus = () => refreshPreview();
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('focus', onFocus);
        }
        return () => {
            listeners.delete(listener);
            if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('focus', onFocus);
            }
        };
    }, []);
    return value;
};

// 測試用：回到初始狀態。
const resetPreviewForTest = () => {
    preview = false;
    settled = false;
    request = null;
    settleWaiters = [];
};
// 測試用：直接定案（模擬 fetch 的導師測試先定為學生模式，避免多出預覽查詢）。
const settlePreviewForTest = value => settle(value === true);

module.exports = {useTeacherPreview,
    refreshPreview,
    whenPreviewSettled,
    isPreview,
    isPreviewSettled,
    resetPreviewForTest,
    settlePreviewForTest,
    PREVIEW_WAIT_MS};
