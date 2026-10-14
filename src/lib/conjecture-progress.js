/* eslint-disable import/no-commonjs */
/**
 * 臆測五階段的進度、草稿、程式檢核與作品組裝（純函式＋localStorage）。
 *
 * - 草稿（draft）是學生在面板上填寫中的內容；按「完成本階段」時才組成作品（artifact），
 *   以 conjecture-artifact.js 清理，再算出過關判定（gate）。
 * - 這裡的檢核只由程式判定看得見的條件（數量、格式、有沒有範圍詞、有沒有驗算）；
 *   說理是否成立不在這裡判定，JU 一律先標「說理待補」，交給導師建議與教師確認。
 * - 解鎖規則：第一階段永遠開放；其他階段要前一階段「活動完成」。
 */
const artifactLib = require('./conjecture-artifact.js');

const {STAGES} = artifactLib;
const STORAGE_PREFIX = 'osepMathProgress:';

const emptyProgress = unit => ({unit, artifacts: {}, gates: {}, drafts: {}, exposures: {}});

const storageKey = (studentId, unit) => `${STORAGE_PREFIX}${studentId || 'anonymous'}:${unit}`;

const loadProgress = (studentId, unit, storage) => {
    try {
        const raw = storage && storage.getItem(storageKey(studentId, unit));
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.unit === unit && typeof parsed.artifacts === 'object') {
            return {...emptyProgress(unit), ...parsed};
        }
    } catch (e) { /* 本機儲存停用或內容損壞時從頭開始，不丟例外。 */ }
    return emptyProgress(unit);
};

const saveProgress = (studentId, progress, storage) => {
    try {
        if (storage) storage.setItem(storageKey(studentId, progress.unit), JSON.stringify(progress));
        return true;
    } catch (e) {
        return false;
    }
};

const isUnlocked = (progress, stage) => {
    const index = STAGES.indexOf(stage);
    if (index <= 0) return index === 0;
    const previous = progress.gates[STAGES[index - 1]];
    return Boolean(previous && previous.activityDone);
};

const SCOPE_WORDS = /(所有|全部|都|任何|每一?個|只要|如果|就是|就會|才)/;
const CAUSE_WORDS = /(因為|由於|所以|因此|於是)/;
const COMPUTATION = /(÷|\/|除|餘|×|\*|乘|=|＝)/;

const distinct = values => [...new Set(values)];
const allDigits = Array.from({length: 10}, (_, i) => i);

// 每個階段的程式檢核；回傳 {checks, activityDone}。checks 的 id 穩定，供紀錄與教師頁使用。
const checkStage = (stage, draft, unit) => {
    const d = draft || {};
    let checks = [];
    if (stage === 'EX') {
        const examples = Array.isArray(d.examples) ? d.examples : [];
        const own = distinct(examples.filter(e => e.source === 'student').map(e => `${e.card}:${e.value}`));
        const valid = examples.length > 0 && examples.every(e => Number.isSafeInteger(e.value) && e.value > 0 &&
            e.value % e.card === 0);
        const classification = d.classification || {};
        const classified = unit.STUDENT_CARDS.every(card => {
            const c = classification[card];
            return c && distinct([...(c.appeared || []), ...(c.notAppeared || [])]).length === 10;
        });
        checks = [
            {id: 'own-examples-3', met: own.length >= 3, by: 'program'},
            {id: 'examples-are-multiples', met: valid, by: 'program'},
            {id: 'ones-classified', met: classified, by: 'program'}
        ];
    } else if (stage === 'CG') {
        const text = String(d.text || '').trim();
        checks = [
            {id: 'has-conjecture', met: text.length >= 6, by: 'program'},
            {id: 'has-scope-or-condition', met: SCOPE_WORDS.test(text), by: 'program'}
        ];
    } else if (stage === 'VA') {
        const tests = Array.isArray(d.tests) ? d.tests : [];
        const studentTests = tests.filter(t => t.source === 'student');
        const groupNames = (unit.VIRTUAL_GROUPS || []).map(group => group.name);
        checks = [
            // 新資料必須來自單元定義的虛擬組員；選「我自己的例子」不算（P6 外審 R3a 第 1 點）。
            {id: 'tested-with-new-data', met: studentTests.some(t => groupNames.includes(t.dataFrom)), by: 'program'},
            {id: 'has-computation',
                met: studentTests.some(t => COMPUTATION.test(String(t.computation || ''))),
                by: 'program'},
            {id: 'tested-pool-conjecture',
                met: studentTests.some(t => String(t.conjectureRef).startsWith('pool-')),
                by: 'program'}
        ];
    } else if (stage === 'GE') {
        const before = String(d.before || '').trim();
        const after = String(d.after || '').trim();
        checks = [
            {id: 'revised', met: after.length >= 6 && after !== before, by: 'program'},
            {id: 'has-scope-or-condition', met: SCOPE_WORDS.test(after), by: 'program'},
            {id: 'has-reason', met: String(d.reason || '').trim().length >= 4, by: 'program'}
        ];
    } else if (stage === 'JU') {
        const text = String(d.text || '').trim();
        checks = [
            {id: 'has-because-so', met: CAUSE_WORDS.test(text) && text.length >= 10, by: 'program'}
        ];
    }
    return {checks, activityDone: checks.length > 0 && checks.every(c => c.met)};
};

// 證實階段的列舉提醒：只用來提示學生「是不是只列了例子」，不當作過關或不過關的依據。
const looksLikeEnumeration = text => {
    const value = String(text || '');
    const numbers = value.match(/\d+/g) || [];
    return numbers.length >= 3 && /(試|舉|算了|都對|都是|都成立)/.test(value) && !/(每一?包|不管|任何|無論)/.test(value);
};

// 由草稿組成作品（未清理）；呼叫端再交給 cleanArtifact，失敗代表草稿格式還不完整。
const buildArtifact = (stage, draft, unit) => {
    const d = draft || {};
    if (stage === 'EX') {
        const classification = unit.STUDENT_CARDS
            .filter(card => d.classification && d.classification[card])
            .map(card => ({card,
                appeared: distinct(d.classification[card].appeared || []).sort((a, b) => a - b),
                notAppeared: distinct(d.classification[card].notAppeared || []).sort((a, b) => a - b)}));
        return {cards: unit.STUDENT_CARDS, examples: d.examples || [], classification, trace: d.trace || ''};
    }
    if (stage === 'CG') {
        return {conjecture: {text: d.text || '',
            template: d.template || 'free',
            condition: d.condition || '',
            conclusion: d.conclusion || '',
            scope: d.scope || ''},
        programCondition: d.programCondition === true};
    }
    if (stage === 'VA') return {tests: d.tests || [], poolOpened: d.poolOpened === true};
    if (stage === 'GE') {
        const marks = d.divisorMarks || {};
        const pick = mark => unit.CANDIDATE_DIVISORS.filter(n => marks[n] === mark);
        return {revision: {before: d.before || '', after: d.after || '', reason: d.reason || ''},
            checkedDivisors: pick('checked'),
            unknownDivisors: pick('unknown')};
    }
    return {justification: {text: d.text || '', representation: d.representation || ''}};
};

// 完成本階段：組作品、清理、算判定。成功回傳 {artifact, gate}；格式不完整回傳 {error}。
// options.aiReasoning：證實階段導師最近一次的說理建議（pending／possible）；只當建議，記為 by:'ai'。
const completeStage = (stage, draft, unit, options = {}) => {
    const programResult = checkStage(stage, draft, unit);
    const activityDone = programResult.activityDone;
    const checks = [...programResult.checks];
    const aiReasoning = stage === 'JU' && ['pending', 'possible'].includes(options.aiReasoning) ?
        options.aiReasoning : null;
    if (aiReasoning) checks.push({id: 'ai-reasoning-suggestion', met: aiReasoning === 'possible', by: 'ai'});
    let artifact;
    try {
        artifact = artifactLib.cleanArtifact(stage, buildArtifact(stage, draft, unit));
    } catch (e) {
        return {error: 'INCOMPLETE', checks, activityDone: false};
    }
    const gate = artifactLib.cleanGate(stage, {
        activityDone,
        reasoningStatus: stage === 'JU' ? (aiReasoning || 'pending') : 'not_applicable',
        checks
    });
    return {artifact, gate};
};

const applyCompletion = (progress, stage, result) => ({
    ...progress,
    artifacts: {...progress.artifacts, [stage]: result.artifact},
    gates: {...progress.gates, [stage]: result.gate}
});

const CHECK_LABELS = {
    'own-examples-3': '自己寫了至少 3 個不同的例子',
    'examples-are-multiples': '例子都是卡片上那個數的倍數',
    'ones-classified': '兩張卡的個位都分成了「出現的／沒出現的」',
    'has-conjecture': '寫出一句猜想',
    'has-scope-or-condition': '有說清楚對誰成立或什麼條件下成立',
    'tested-with-new-data': '用別組的資料檢驗過',
    'has-computation': '寫出驗算過程',
    'tested-pool-conjecture': '也檢驗了猜想池裡的一句',
    'revised': '寫出修改後、和原本不同的說法',
    'has-reason': '寫出修改的理由',
    'has-because-so': '用「因為…所以…」寫出理由',
    'ai-reasoning-suggestion': '導師建議：理由可能符合（老師最後確認）'
};

module.exports = {
    STORAGE_PREFIX,
    CHECK_LABELS,
    emptyProgress,
    storageKey,
    loadProgress,
    saveProgress,
    isUnlocked,
    checkStage,
    looksLikeEnumeration,
    buildArtifact,
    completeStage,
    applyCompletion,
    allDigits
};
