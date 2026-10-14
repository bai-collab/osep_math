// 教師確認「證實」階段的說理（osep_math）。
//
// 學生端只能把說理標成「待補／可能符合」，導師也只給建議；「教師確認」只能由登入的老師在教師頁送出，
// 存在本機 local-data/reasoning-reviews.jsonl（附加寫入、保留歷史，同一份作品以最後一筆為準）。
// 不上傳試算表：這是老師的判斷，不是學生的學習事件。
import fs from 'node:fs/promises';
import path from 'node:path';

export const REASONING_REVIEW_STATUSES = ['teacher_confirmed', 'needs_work'];

/**
 * 只有存在、而且是「證實」階段作品的紀錄可以被確認。
 * @param {Array<object>} records 本機紀錄。
 * @param {string} artifactId 作品紀錄 id。
 * @returns {object|null} 對應的作品紀錄。
 */
export const findJustificationArtifact = (records, artifactId) =>
    records.find(record => record.id === artifactId && record.type === 'artifact' && record.stage === 'JU') || null;

export const createReasoningReviewStore = directory => {
    const file = path.join(directory, 'reasoning-reviews.jsonl');
    let tail = Promise.resolve();
    const list = async () => {
        let content;
        try {
            content = await fs.readFile(file, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') return {};
            throw error;
        }
        const reviews = {};
        for (const line of content.split('\n').filter(Boolean)) {
            const review = JSON.parse(line);
            reviews[review.artifactId] = review;
        }
        return reviews;
    };
    const save = input => {
        if (!input || typeof input.artifactId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.artifactId) ||
            !REASONING_REVIEW_STATUSES.includes(input.status) ||
            (input.note !== null && typeof input.note !== 'undefined' &&
                (typeof input.note !== 'string' || input.note.length > 500))) {
            return Promise.reject(new Error('INVALID_REVIEW'));
        }
        const review = {artifactId: input.artifactId,
            status: input.status,
            note: (input.note || '').trim(),
            reviewedAt: new Date().toISOString()};
        const pending = tail.then(async () => {
            await fs.mkdir(directory, {recursive: true});
            await fs.appendFile(file, `${JSON.stringify(review)}\n`);
            return review;
        });
        tail = pending.catch(() => {});
        return pending;
    };
    return {list, save};
};
