/* eslint-disable import/no-commonjs */
/**
 * 階段面板與導師之間共用的小型記憶體儲存（不持久化）。
 *
 * - work：學生目前在面板上的作品摘要，求助時附在導師脈絡（context.stageWork），讓導師先指向學生作品。
 * - reasoning：證實階段導師給的說理建議（pending／possible），完成本階段時寫進過關判定，標明 by:'ai'。
 * 兩者都只是參考：服務端會再清理長度，說理建議也不是最後判定。
 */
const works = new Map();
const reasonings = new Map();
const MAX_WORK = 1500;

const clip = value => (value.length > MAX_WORK ? `${value.slice(0, MAX_WORK - 1)}…` : value);

// 把草稿整理成導師看得懂的幾行文字；只放學生自己寫的內容。
const describeDraft = (stage, draft, artifacts = {}) => {
    const d = draft || {};
    const lines = [];
    if (artifacts.CG && stage !== 'CG') lines.push(`我原本的猜想：${artifacts.CG.conjecture.text}`);
    if (stage === 'EX' && Array.isArray(d.examples) && d.examples.some(e => e && typeof e.group !== 'undefined')) {
        // 分類型造例（第二批單元）：例子屬於組別，分類存在 sorting。
        const who = e => (e.source === 'student' ? '自己寫' : '程式找');
        const sorting = d.sorting || {};
        lines.push(`我造的例子：${d.examples.map(e => `${e.value}（${who(e)}${
            sorting[`${e.group}|${e.value}`] ? `，分到「${sorting[`${e.group}|${e.value}`]}」` : '，還沒分類'}）`).join('、')}`);
    } else if (stage === 'EX') {
        const who = e => (e.source === 'student' ? '自己寫' : '程式找');
        const examples = (d.examples || []).map(e => `${e.value}（卡${e.card}，${who(e)}）`);
        lines.push(`我造的例子：${examples.join('、') || '還沒有'}`);
        Object.entries(d.classification || {}).forEach(([card, c]) => {
            const shown = (c.appeared || []).join(',') || '無';
            const hidden = (c.notAppeared || []).join(',') || '無';
            lines.push(`卡${card} 個位分類：出現 ${shown}；沒出現 ${hidden}`);
        });
    } else if (stage === 'CG') {
        lines.push(`我的猜想：${d.text || '還沒寫完'}`);
    } else if (stage === 'VA') {
        (d.tests || []).forEach(t => lines.push(`檢驗：${t.example || t.number}（${t.dataFrom}）對「${t.conjectureText}」，` +
            `預測${t.prediction}，算式「${t.computation || '未寫'}」，結果${t.verdict}`));
        if (!(d.tests || []).length) lines.push('還沒有記下任何檢驗');
    } else if (stage === 'GE') {
        lines.push(`修改後：${d.after || '還沒寫'}`);
        lines.push(`修改理由：${d.reason || '還沒寫'}`);
    } else if (stage === 'JU') {
        lines.push(`我操作了：${d.representation || '還沒寫'}`);
        lines.push(`我的理由：${d.text || '還沒寫'}`);
    }
    return clip(lines.join('\n'));
};

const setWork = (taskCode, text) => works.set(taskCode, clip(String(text || '')));
const getWork = taskCode => works.get(taskCode) || '';
const setReasoning = (taskCode, value) => {
    if (['pending', 'possible'].includes(value)) reasonings.set(taskCode, value);
};
const getReasoning = taskCode => reasonings.get(taskCode) || null;

module.exports = {describeDraft, setWork, getWork, setReasoning, getReasoning};
