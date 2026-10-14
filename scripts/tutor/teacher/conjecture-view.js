/* eslint func-style: ["error", "declaration", {"allowArrowFunctions": true}] */
// osep_math 教師頁「臆測進度」的資料整理（純函式；瀏覽器與 Node 測試共用）。
//
// 只根據學生紀錄與老師的說理確認整理，不重新判定學生作品：
// - 階段狀態取「最後一次過關判定」；同時間以保存順序較後者為準。
// - 證實的說理狀態：老師確認 > 最後一次過關判定的狀態（待補／導師認為可能符合）。
export const STAGES = ['EX', 'CG', 'VA', 'GE', 'JU'];
export const STAGE_LABELS = {EX: '造例', CG: '提出猜想', VA: '效化', GE: '一般化', JU: '證實'};
export const REASONING_LABELS = {
    pending: '說理待補',
    possible: '導師認為可能符合',
    teacher_confirmed: '老師確認',
    needs_work: '老師請學生再說明',
    not_applicable: '—'
};
export const EXPOSURE_LABELS = {
    'virtual-data': '看到其他組資料',
    'challenge-card': '看到挑戰卡',
    'conjecture-pool': '打開猜想池',
    'tutor-hint': '看到導師提示'
};

const later = (a, b) => !b || a.timestamp.localeCompare(b.timestamp) > 0 ||
    (a.timestamp === b.timestamp && a.index > b.index);

/**
 * 整理每位學生在每個單元的五階段進度與作品。
 * @param {Array<object>} records 學生紀錄。
 * @param {object} reviews 老師的說理確認（以作品紀錄 id 為鍵）。
 * @returns {Array<object>} 依單元分組的學生列。
 */
export function buildConjectureView (records = [], reviews = {}) {
    const units = new Map();
    (Array.isArray(records) ? records : []).forEach((record, index) => {
        if (!record || typeof record.unit !== 'string' || !STAGES.includes(record.stage) ||
            typeof record.studentId !== 'string') return;
        const item = {...record, index};
        if (!units.has(record.unit)) units.set(record.unit, new Map());
        const students = units.get(record.unit);
        if (!students.has(record.studentId)) {
            students.set(record.studentId, {studentId: record.studentId,
                stages: Object.fromEntries(STAGES.map(stage =>
                    [stage, {gate: null, artifact: null, aiHelp: 0, leaks: 0, records: 0}])),
                exposures: []});
        }
        const row = students.get(record.studentId);
        const cell = row.stages[record.stage];
        cell.records++;
        if (record.type === 'gate' && later(item, cell.gate)) cell.gate = item;
        if (record.type === 'artifact' && later(item, cell.artifact)) cell.artifact = item;
        if (record.type === 'ai') {
            cell.aiHelp++;
            if (record.errorCode === 'LEAK_FILTERED') cell.leaks++;
        }
        if (record.type === 'exposure') row.exposures.push(item);
    });
    return [...units.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unit, students]) => ({
        unit,
        students: [...students.values()].sort((a, b) => a.studentId.localeCompare(b.studentId, 'zh-TW')).map(row => {
            const stages = {};
            for (const stage of STAGES) {
                const cell = row.stages[stage];
                let status = 'none';
                if (cell.gate && cell.gate.gate && cell.gate.gate.activityDone) status = 'done';
                else if (cell.records) status = 'working';
                let reasoning = null;
                if (stage === 'JU' && cell.artifact) {
                    const review = reviews[cell.artifact.id];
                    const gateStatus = cell.gate && cell.gate.gate && cell.gate.gate.reasoningStatus;
                    reasoning = review ? review.status : gateStatus || 'pending';
                }
                stages[stage] = {status,
                    reasoning,
                    aiHelp: cell.aiHelp,
                    leaks: cell.leaks,
                    artifact: cell.artifact,
                    review: cell.artifact ? reviews[cell.artifact.id] || null : null};
            }
            const exposures = row.exposures.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.index - b.index);
            return {studentId: row.studentId,
                stages,
                exposures,
                leaks: STAGES.reduce((sum, stage) => sum + row.stages[stage].leaks, 0)};
        })
    }));
}

const PREDICTION = {support: '支持', refute: '推翻', unsure: '不確定'};
const VERDICT = {supports: '支持', refutes: '推翻', unclear: '還不確定'};

/**
 * 把一份階段作品轉成老師讀得懂的幾行文字（不加評語）。
 * @param {string} stage 階段代碼。
 * @param {object} artifact 已清理的作品。
 * @returns {Array<string>} 每行一個重點。
 */
export function describeArtifact (stage, artifact) {
    if (!artifact) return ['（沒有作品）'];
    if (stage === 'EX') {
        const own = artifact.examples.filter(e => e.source === 'student').map(e => e.value);
        const program = artifact.examples.filter(e => e.source === 'program').map(e => e.value);
        return [`卡片：${artifact.cards.join('、')}`,
            `自己寫的例子：${own.join('、') || '無'}`,
            `程式找到的例子：${program.length ? `${program.slice(0, 20).join('、')}${program.length > 20 ? '…' : ''}` : '無'}`,
            ...artifact.classification.map(c =>
                `卡${c.card} 的個位：出現 ${c.appeared.join(',') || '無'}；沒出現 ${c.notAppeared.join(',') || '無'}`),
            ...(artifact.trace ? [`追蹤：${artifact.trace}`] : [])];
    }
    if (stage === 'CG') {
        return [`猜想：${artifact.conjecture.text}`,
            `句型：${{'if-then': '只要…就…', 'all': '所有…都…', 'free': '自己的話'}[artifact.conjecture.template]}`,
            `選做程式條件區：${artifact.programCondition ? '有改' : '沒有改'}`];
    }
    if (stage === 'VA') {
        return [...artifact.tests.map(t => `${t.number}（${t.dataFrom || '未註明'}${t.source === 'scan' ? '，程式掃描' : ''}）→「${
            t.conjectureText}」：先預測${PREDICTION[t.prediction]}，算式「${t.computation || '未寫'}」，結果${VERDICT[t.verdict]}`),
        `猜想池：${artifact.poolOpened ? '打開過' : '沒有打開'}`];
    }
    if (stage === 'GE') {
        return [`原本：${artifact.revision.before || '（空白）'}`, `修改後：${artifact.revision.after}`,
            `理由：${artifact.revision.reason || '（空白）'}`,
            `檢驗過的除數：${artifact.checkedDivisors.join('、') || '無'}；還不知道：${artifact.unknownDivisors.join('、') || '無'}`];
    }
    return [`操作的表徵：${artifact.justification.representation || '（空白）'}`, `理由：${artifact.justification.text}`];
}
