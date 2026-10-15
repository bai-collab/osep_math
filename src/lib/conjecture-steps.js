/* eslint-disable import/no-commonjs */
/**
 * 階段步驟卡：依草稿、專案清單與完成狀態，判斷每一步做完沒有、目前該做哪一步。
 *
 * 只做引導、不擋完成（完成條件仍是 conjecture-progress.js 的檢核點）。
 * 步驟可以不照順序做完；「目前這一步」是第一個還沒做完的步驟。
 */

const distinctCount = values => new Set(values).size;

const isDone = (done, {draft, programLists, stageDone}) => {
    const d = draft || {};
    const examples = Array.isArray(d.examples) ? d.examples : [];
    if (!done) return false;
    if (done.type === 'studentExamples' || done.type === 'programExamples') {
        const source = done.type === 'studentExamples' ? 'student' : 'program';
        return distinctCount(examples.filter(e => e && e.card === done.card && e.source === source)
            .map(e => e.value)) >= done.min;
    }
    if (done.type === 'programList') {
        const values = (programLists && programLists[done.list]) || [];
        return values.length >= done.min;
    }
    if (done.type === 'classified') {
        const c = d.classification && d.classification[done.card];
        return Boolean(c) && distinctCount([...(c.appeared || []), ...(c.notAppeared || [])]) === 10;
    }
    if (done.type === 'stageDone') return stageDone === true;
    return false;
};

// 程式清單步驟曾經達成過的紀錄（存在草稿 stepsSeen）：重新載入半成品後清單會清空，
// 但學生已經做過的步驟不該被打回去。
const seenIds = draft => (draft && Array.isArray(draft.stepsSeen) ? draft.stepsSeen : []);

// 回傳 [{id, where, text, done, current}]；全部完成時沒有 current。
const evaluateSteps = (steps, state) => {
    const s = state || {};
    const seen = seenIds(s.draft);
    const evaluated = (steps || []).map(step => ({id: step.id,
        where: step.where,
        text: step.text,
        done: isDone(step.done, s) ||
            (Boolean(step.done) && step.done.type === 'programList' && seen.includes(step.id)),
        current: false}));
    const current = evaluated.find(step => !step.done);
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

module.exports = {evaluateSteps, programListNames, newlySeen};
