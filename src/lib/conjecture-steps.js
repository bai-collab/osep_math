/* eslint-disable import/no-commonjs */
/**
 * 階段步驟卡：依草稿、專案清單、檢核點與完成狀態，判斷每一步做完沒有、目前該做哪一步。
 *
 * 只做引導、不擋完成（完成條件仍是 conjecture-progress.js 的檢核點）。
 * 步驟可以不照順序做完；「目前這一步」是第一個還沒做完、而且不是選做的步驟。
 *
 * done 條件種類：
 * - studentExamples／programExamples／classified：造例的例子與個位分類
 * - programList：專案清單裡「內容合理」的項目數（達成後記入草稿 stepsSeen，重新載入半成品不會被打回）。
 *   valid 指定內容規則：{kind: 'digit'} 只能是 0～9；{kind: 'multipleOf', of: N} 只能是 N 的正整數倍；
 *   {kind: 'expression'} 要有數字和運算符號。沒寫 valid 時只算長度。
 * - check：沿用檢核點結果（ids 全部達成）
 * - field：草稿某欄位文字長度
 * - flag：草稿某欄位為 true
 * - allMarked：草稿某物件把指定的每一個 key 都標了值
 * - manual：程式本身看不出來的操作（例如按空白鍵試試），學生按「這步做好了」記入 stepsSeen
 * - stageDone：本階段已完成
 * 步驟加 optional: true 表示選做：顯示在清單裡，但不會成為目前步驟。
 */

const distinctCount = values => new Set(values).size;

// 專案清單的一個項目合不合這一步的內容規則（補錯積木時，例如把文字 thing 加進清單，不能算做好了）。
const validListValue = (valid, value) => {
    if (!valid) return true;
    const text = String(value === null || typeof value === 'undefined' ? '' : value).trim();
    if (valid.kind === 'digit') return /^[0-9]$/.test(text);
    if (valid.kind === 'multipleOf') {
        return /^[0-9]+$/.test(text) && Number(text) > 0 && Number(text) % valid.of === 0;
    }
    if (valid.kind === 'expression') return /[0-9]/.test(text) && /[×÷＋+\-－*/]/.test(text);
    return false;
};
const listValues = (done, programLists) => (programLists && programLists[done.list]) || [];
const validCount = (done, programLists) => listValues(done, programLists)
    .filter(value => validListValue(done.valid, value)).length;

const isDone = (done, {draft, programLists, stageDone, checks}) => {
    const d = draft || {};
    const examples = Array.isArray(d.examples) ? d.examples : [];
    if (!done) return false;
    if (done.type === 'studentExamples' || done.type === 'programExamples') {
        const source = done.type === 'studentExamples' ? 'student' : 'program';
        // ②-1 的例子屬於某張卡（card）；第二批單元的例子屬於某個組別（group）。
        const inGroup = e => (typeof done.group === 'undefined' ? e.card === done.card : e.group === done.group);
        return distinctCount(examples.filter(e => e && inGroup(e) && e.source === source)
            .map(e => e.value)) >= done.min;
    }
    if (done.type === 'programList') {
        return validCount(done, programLists) >= done.min;
    }
    if (done.type === 'classified') {
        const c = d.classification && d.classification[done.card];
        return Boolean(c) && distinctCount([...(c.appeared || []), ...(c.notAppeared || [])]) === 10;
    }
    if (done.type === 'check') {
        const met = checks || {};
        return Array.isArray(done.ids) && done.ids.length > 0 && done.ids.every(id => met[id] === true);
    }
    if (done.type === 'field') return String(d[done.field] || '').trim().length >= (done.min || 1);
    if (done.type === 'flag') return d[done.field] === true;
    if (done.type === 'allMarked') {
        const marks = d[done.field] || {};
        return Array.isArray(done.keys) && done.keys.length > 0 && done.keys.every(key => Boolean(marks[key]));
    }
    if (done.type === 'stageDone') return stageDone === true;
    return false;
};

// 已記住的步驟（存在草稿 stepsSeen）：只對 programList 與 manual 兩種步驟有效。
const REMEMBERED = ['programList', 'manual'];
const seenIds = draft => (draft && Array.isArray(draft.stepsSeen) ? draft.stepsSeen : []);
const remembered = (step, seen) => Boolean(step.done) && REMEMBERED.includes(step.done.type) && seen.includes(step.id);

// 清單已經有東西、卻有不合規則的項目（多半是積木補錯）：步驟卡要提醒學生檢查補上的那一塊。
const listProblem = (step, programLists) => Boolean(step.done) && step.done.type === 'programList' &&
    listValues(step.done, programLists).some(value => !validListValue(step.done.valid, value));

// 回傳 [{id, where, text, done, current, optional, manual, listProblem}]；全部完成時沒有 current。
const evaluateSteps = (steps, state) => {
    const s = state || {};
    const seen = seenIds(s.draft);
    const evaluated = (steps || []).map(step => ({id: step.id,
        where: step.where,
        text: step.text,
        done: isDone(step.done, s) || remembered(step, seen),
        current: false,
        optional: step.optional === true,
        manual: Boolean(step.done) && step.done.type === 'manual',
        listProblem: false}));
    evaluated.forEach((item, i) => {
        if (!item.done) item.listProblem = listProblem(steps[i], s.programLists);
    });
    const current = evaluated.find(step => !step.done && !step.optional);
    if (current) current.current = true;
    return evaluated;
};

// 步驟卡需要從專案讀哪些清單。
const programListNames = steps => [...new Set((steps || [])
    .filter(step => step.done && step.done.type === 'programList')
    .map(step => step.done.list))];

// 這次從專案清單看到達成、但還沒記進 stepsSeen 的步驟 id。
const newlySeen = (steps, state) => {
    const s = state || {};
    const seen = seenIds(s.draft);
    return (steps || []).filter(step => step.done && step.done.type === 'programList' &&
        !seen.includes(step.id) && isDone(step.done, s)).map(step => step.id);
};

// 學生按「這步做好了」時可以記住的步驟（只限 manual，避免拿來跳過要檢查的步驟）。
const manualIds = steps => (steps || []).filter(step => step.done && step.done.type === 'manual').map(step => step.id);

module.exports = {evaluateSteps, programListNames, newlySeen, manualIds};
