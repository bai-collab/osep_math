import fs from 'node:fs/promises';
import path from 'node:path';

// 「全程依賴 AI」偵測：只看學生與導師的對話。
// 導師每輪只給「一小步操作＋一個追問」（見 provider.mjs），不會給完整答案；所以依賴的樣子不是拿到答案，
// 而是一路跟著導師一步步做：每輪只回「然後呢」「不會」，從不回答追問、也不說自己的想法。
// 這是給老師的關心提醒，不是作弊判定；關鍵字與門檻都是起始值，要用人工標註校準後再調整。
export const RULES_VERSION = 'dependency-rules-2';
export const THRESHOLDS = Object.freeze({
    minRequests: 4, // 同一題至少求助幾次才判斷，避免單次求助被標記
    passiveRatio: 0.75 // 「要答案／只要下一步／只說卡住」至少佔多少比例
});

export const QUESTION_LABELS = Object.freeze({
    ASK_ANSWER: '要答案',
    NEXT_STEP: '只要下一步',
    STUCK: '只說卡住',
    DESCRIBES_ATTEMPT: '說明想法或嘗試',
    ANSWERS_FOLLOWUP: '回應追問',
    ASK_CONCEPT: '問概念',
    UNKNOWN: '無法判斷'
});

const KEYWORDS = {
    ASK_ANSWER: ['答案', '解答', '直接告訴', '直接給', '直接說', '幫我寫', '幫我做', '幫我完成', '幫我改', '寫給我',
        '做給我', '給我程式', '給我積木', '程式給我', '積木給我', '完整程式', '整個程式', '全部寫', '全部告訴', '照抄',
        '要放什麼積木', '要用哪些積木', '放哪些積木'],
    NEXT_STEP: ['下一步', '然後呢', '然後勒', '再來呢', '再來勒', '接下來', '之後呢', '繼續', '還要做什麼', '還要放什麼',
        '好了', '放好了', '做好了', '完成了', '弄好了'],
    STUCK: ['不會', '不懂', '看不懂', '不知道', '怎麼做', '怎麼寫', '怎麼辦', '教我', '卡住', '救命', '幫我', '幫幫'],
    DESCRIBES_ATTEMPT: ['我試', '試過', '試了', '我用了', '我放了', '我把', '我改了', '我改成', '我寫了', '我有用', '我有放',
        '我覺得', '我認為', '我猜', '結果', '出現', '跑出', '輸出了', '錯誤', '不對', '怪怪', '為什麼會', '為什麼我',
        '但是', '可是', '卻', '因為', '所以', '應該'],
    ASK_CONCEPT: ['什麼是', '是什麼', '什麼意思', '意思是', '差在哪', '差別', '有什麼不同', '怎麼用', '用法', '作用']
};
// 整句只有這些字時視為「只要下一步」（例如回「好」「嗯」「ok」）。
const PASS_ONLY = new Set(['好', '好的', '嗯', '恩', '喔', '哦', 'ok', 'okay', '了解', '知道了', '收到', '對', '是']);
const PRIORITY = ['ASK_ANSWER', 'NEXT_STEP', 'STUCK', 'DESCRIBES_ATTEMPT', 'ASK_CONCEPT'];
const PASSIVE = new Set(['ASK_ANSWER', 'NEXT_STEP', 'STUCK']);
const ENGAGED = new Set(['DESCRIBES_ATTEMPT', 'ANSWERS_FOLLOWUP']);

/**
 * 依關鍵字標註一次學生提問。可能同時符合多個標籤；primary 依固定優先序挑一個顯示。
 * 導師上一輪有追問時，沒有被動用語的回覆（即使很短，例如「先問名字」）算「回應追問」。
 * @param {string} question 學生提問原文。
 * @param {{afterFollowup: boolean}} context 上一輪導師是否有追問。
 * @returns {{primary: string, labels: string[], matched: string[]}} 標籤代碼與命中的關鍵字。
 */
export function labelQuestion (question, {afterFollowup = false} = {}) {
    const text = typeof question === 'string' ? question.replace(/\s+/g, '') : '';
    const bare = text.replace(/[\p{P}\p{S}~～]/gu, '').toLowerCase();
    const labels = [], matched = [];
    for (const label of PRIORITY) {
        const hits = KEYWORDS[label].filter(word => text.includes(word));
        if (label === 'NEXT_STEP' && PASS_ONLY.has(bare)) hits.push(bare);
        if (hits.length) {
            labels.push(label);
            matched.push(...hits);
        }
    }
    if (afterFollowup && bare && !labels.some(label => PASSIVE.has(label)) && !labels.includes('ASK_CONCEPT')) {
        labels.push('ANSWERS_FOLLOWUP');
    }
    return {primary: labels[0] || 'UNKNOWN', labels, matched: [...new Set(matched)]};
}

// 有說明自己的想法或回應追問，就不算被動，即使同一句也問了下一步。
const isPassive = label => !label.labels.some(code => ENGAGED.has(code)) && label.labels.some(code => PASSIVE.has(code));
const isEngaged = label => label.labels.some(code => ENGAGED.has(code));
// 只採計真模型且成功回覆的求助；模擬提示與失敗不算向 AI 求助。
const countsAsRequest = record => record.type === 'ai' && record.status === 'completed' && record.source === 'nmking';
export const alertIdFor = (studentId, taskCode) => `dependency:${studentId}:${taskCode}`;

/**
 * 依「學生＋題目」分析所有紀錄，回傳每筆求助的標籤與觸發的警示。
 * @param {Array<object>} records 已清理的學習紀錄（依保存順序）。
 * @param {Map<string, object>} reviews 教師審查結果，鍵為 alertId。
 * @returns {object} rulesVersion、thresholds、labels（紀錄 id → 標籤）與 alerts。
 */
export function analyzeDependency (records, reviews = new Map()) {
    const labels = {};
    const groups = new Map();
    // 同一時間戳記時以保存順序為準（與教師頁一致）。
    const ordered = records.map((record, index) => ({record, index}))
        .sort((a, b) => a.record.timestamp.localeCompare(b.record.timestamp) || a.index - b.index)
        .map(item => item.record);
    for (const record of ordered) {
        const key = JSON.stringify([record.studentId, record.task.code]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
    }
    const alerts = [];
    for (const group of groups.values()) {
        // 學生看到的上一輪導師回覆（模擬提示也會顯示追問）；換了學習段落就不算接著回答。
        let previousTurn = null;
        for (const record of group) {
            if (!['ai', 'reflection'].includes(record.type) || record.skipped) continue;
            if (record.type === 'reflection') {
                if (record.status === 'completed') previousTurn = record;
                continue;
            }
            const afterFollowup = Boolean(previousTurn && previousTurn.followup &&
                !(previousTurn.sessionId && record.sessionId && previousTurn.sessionId !== record.sessionId));
            labels[record.id] = labelQuestion(record.question, {afterFollowup});
            if (record.status === 'completed') previousTurn = record;
        }
        const requests = group.filter(countsAsRequest);
        if (requests.length < THRESHOLDS.minRequests) continue;
        const passive = requests.filter(record => isPassive(labels[record.id]));
        if (requests.some(record => isEngaged(labels[record.id])) ||
            passive.length < requests.length * THRESHOLDS.passiveRatio) continue;
        // 兩次求助之間的樣子只當證據說明，不影響是否提醒：照著做（程式有改）或原地等（沒改）。
        let gaps = 0, changedGaps = 0, checkedGaps = 0, selfTestUnknown = false;
        for (let i = 1; i < requests.length; i++) {
            const previous = requests[i - 1], current = requests[i];
            const between = group.slice(group.indexOf(previous) + 1, group.indexOf(current) + 1);
            if (!Number.isInteger(current.selfTestCount)) selfTestUnknown = true;
            gaps++;
            if (JSON.stringify(previous.program) !== JSON.stringify(current.program)) changedGaps++;
            if (between.some(record => record.type === 'grade' || record.selfTestCount > 0)) checkedGaps++;
        }
        const count = code => requests.filter(record => labels[record.id].labels.includes(code)).length;
        // 評分後的解題想法只列為證據，由老師閱讀判斷，不自動取消提醒。
        const reflections = group.filter(record => record.type === 'reflection').map(record => ({id: record.id,
            timestamp: record.timestamp, skipped: record.skipped === true, text: record.skipped ? '' : record.question,
            feedback: record.guidance || '', followup: record.followup || ''}));
        const [first] = group;
        const id = alertIdFor(first.studentId, first.task.code);
        const review = reviews.get(id) || null;
        alerts.push({id, type: 'AI_DEPENDENCY', rulesVersion: RULES_VERSION, studentId: first.studentId, task: first.task,
            requestCount: requests.length, passiveCount: passive.length,
            labelCounts: {ASK_ANSWER: count('ASK_ANSWER'), NEXT_STEP: count('NEXT_STEP'), STUCK: count('STUCK')},
            gaps, changedGaps, checkedGaps, reflections,
            from: requests[0].timestamp, to: requests.at(-1).timestamp, evidenceRecordIds: requests.map(record => record.id),
            limitations: [
                '學生代號由學生自填，可能不是本人。',
                '關鍵字規則可能誤判小學生的口語；請閱讀原始對話再判斷。',
                ...(selfTestUnknown ? ['部分紀錄是舊格式，沒有自行測試次數。'] : [])
            ],
            review, newSinceReview: review ? requests.filter(record => record.timestamp > review.reviewedAt).length : 0});
    }
    return {rulesVersion: RULES_VERSION, thresholds: THRESHOLDS, labels, alerts};
}

export const REVIEW_STATUSES = ['open', 'confirmed', 'false_positive'];

/**
 * 教師審查結果：只新增不覆寫，同一警示以最後一筆為準；不修改任何學習紀錄。
 * @param {string} directory 本機資料目錄。
 * @returns {object} list 與 save。
 */
export function createReviewStore (directory) {
    const file = path.join(directory, 'dependency-reviews.jsonl');
    let tail = Promise.resolve();
    const list = async () => {
        let content;
        try { content = await fs.readFile(file, 'utf8'); } catch (error) {
            if (error.code === 'ENOENT') return new Map();
            throw error;
        }
        const reviews = new Map();
        for (const line of content.split('\n').filter(Boolean)) {
            const review = JSON.parse(line);
            reviews.set(review.alertId, review);
        }
        return reviews;
    };
    const save = input => {
        if (!input || typeof input.alertId !== 'string' || !/^dependency:[\p{L}\p{N}_-]{1,40}:.{1,120}$/u.test(input.alertId) ||
            !REVIEW_STATUSES.includes(input.status) ||
            (input.note != null && (typeof input.note !== 'string' || input.note.length > 500))) {
            return Promise.reject(new Error('INVALID_REVIEW'));
        }
        const review = {alertId: input.alertId, status: input.status, note: (input.note || '').trim(),
            rulesVersion: RULES_VERSION, reviewedAt: new Date().toISOString()};
        const pending = tail.then(async () => {
            await fs.mkdir(directory, {recursive: true});
            await fs.appendFile(file, `${JSON.stringify(review)}\n`);
            return review;
        });
        tail = pending.catch(() => {});
        return pending;
    };
    return {list, save};
}
