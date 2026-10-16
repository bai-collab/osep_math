/* eslint-disable import/no-commonjs */
/**
 * 臆測五階段的「階段作品」資料契約（紀錄格式 v3）。
 *
 * 前端（webpack，require）與本機服務（Node ESM，import default）共用同一份清理規則；
 * Google Apps Script 不能 import，Code.gs 只保存本模組已清理過的物件，不另行改寫。
 *
 * 原則：
 * - 未知欄位一律丟棄；字串超長、陣列超量或型別不符時整個作品無效（INVALID_ARTIFACT）。
 * - 作品只記錄學生做了什麼（例子、分類、猜想原文、驗算、修訂、說理），不記錄目標結論。
 * - 學生端只能把說理狀態標成 pending／possible／not_applicable；「教師確認」只能走教師入口。
 * - summary 由作品決定性地算出，讀回時重算結果相同，避免同步比對衝突。
 */

const STAGES = ['EX', 'CG', 'VA', 'GE', 'JU'];
const STAGE_LABELS = {EX: '造例', CG: '提出猜想', VA: '效化', GE: '一般化', JU: '證實'};
const STUDENT_REASONING_STATUS = ['pending', 'possible', 'not_applicable'];
const EXPOSURE_ITEMS = ['virtual-data', 'challenge-card', 'conjecture-pool', 'tutor-hint'];
const UNIT_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const fail = () => {
    throw new Error('INVALID_ARTIFACT');
};
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max, {optional = false} = {}) => {
    if (typeof value === 'undefined' || value === null) {
        if (optional) return '';
        fail();
    }
    if (typeof value !== 'string' || value.length > max) fail();
    return value.trim();
};
const int = (value, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail();
    return value;
};
const oneOf = (value, allowed) => {
    if (!allowed.includes(value)) fail();
    return value;
};
const list = (value, max, mapItem) => {
    if (!Array.isArray(value) || value.length > max) fail();
    return value.map(mapItem);
};
const digits = value => {
    const result = list(value, 10, item => int(item, 0, 9));
    if (new Set(result).size !== result.length) fail();
    return result;
};
const divisors = value => {
    const result = list(value, 20, item => int(item, 1, 1000));
    if (new Set(result).size !== result.length) fail();
    return result;
};

// 非空短標籤（組別、分類、例子文字）。
const label = (value, max) => {
    const result = text(value, max);
    if (!result) fail();
    return result;
};
const labels = (value, max, itemMax) => {
    const result = list(value, max, item => label(item, itemMax));
    if (new Set(result).size !== result.length) fail();
    return result;
};

// EX（分類型，第二批單元）：例子是短文字（數或算式），各屬一個組別；學生把每個例子分到單元定義的類別。
const cleanEXSort = input => {
    const groups = labels(input.groups, 4, 20);
    const categories = labels(input.categories, 6, 20);
    if (!groups.length || categories.length < 2) fail();
    const examples = list(input.examples, 200, item => {
        if (!plain(item)) fail();
        return {group: oneOf(item.group, groups),
            value: label(item.value, 80),
            source: oneOf(item.source, ['student', 'program'])};
    });
    const keys = new Set(examples.map(e => `${e.group}|${e.value}`));
    const sorting = list(input.sorting || [], 200, item => {
        if (!plain(item)) fail();
        const group = oneOf(item.group, groups);
        const value = label(item.value, 80);
        if (!keys.has(`${group}|${value}`)) fail();
        return {group, value, category: oneOf(item.category, categories)};
    });
    return {kind: 'sort', groups, categories, examples, sorting, trace: text(input.trace, 500, {optional: true})};
};

// EX：學生拿到的卡、造出的例子（標明學生手填或程式產生）、個位分類、一次手動追蹤。
const cleanEX = input => {
    if (input.kind === 'sort') return cleanEXSort(input);
    const cards = list(input.cards, 4, item => int(item, 1, 1000));
    if (!cards.length) fail();
    const examples = list(input.examples, 200, item => {
        if (!plain(item)) fail();
        const card = int(item.card, 1, 1000);
        if (!cards.includes(card)) fail();
        return {card, value: int(item.value, 0, 100000), source: oneOf(item.source, ['student', 'program'])};
    });
    const classification = list(input.classification || [], 4, item => {
        if (!plain(item)) fail();
        const card = int(item.card, 1, 1000);
        if (!cards.includes(card)) fail();
        const appeared = digits(item.appeared);
        const notAppeared = digits(item.notAppeared);
        if (appeared.some(d => notAppeared.includes(d))) fail();
        return {card, appeared, notAppeared};
    });
    return {cards, examples, classification, trace: text(input.trace, 500, {optional: true})};
};

// CG：猜想原文與句型拆解；programCondition 表示學生是否選做了程式條件區。
const cleanCG = input => {
    if (!plain(input.conjecture)) fail();
    const c = input.conjecture;
    const conjecture = {
        text: text(c.text, 300),
        template: oneOf(c.template, ['if-then', 'all', 'free']),
        condition: text(c.condition, 200, {optional: true}),
        conclusion: text(c.conclusion, 200, {optional: true}),
        scope: text(c.scope, 200, {optional: true})
    };
    if (!conjecture.text) fail();
    return {conjecture, programCondition: input.programCondition === true};
};

// VA：每筆檢驗＝哪一句猜想、用哪個數、先預測、驗算算式、結論；source 區分學生自己挑或程式掃描。
const cleanVA = input => {
    const tests = list(input.tests, 50, item => {
        if (!plain(item)) fail();
        // 用來檢驗的可以是一個數（number），或一個算式等短文字（example，第二批單元）。
        const hasNumber = typeof item.number !== 'undefined' && item.number !== null;
        const example = text(item.example, 80, {optional: true});
        if (!hasNumber && !example) fail();
        return {
            conjectureRef: text(item.conjectureRef, 40),
            conjectureText: text(item.conjectureText, 300),
            ...(hasNumber ? {number: int(item.number, 0, 100000)} : {}),
            ...(example ? {example} : {}),
            dataFrom: text(item.dataFrom, 40, {optional: true}),
            prediction: oneOf(item.prediction, ['support', 'refute', 'unsure']),
            computation: text(item.computation, 200, {optional: true}),
            verdict: oneOf(item.verdict, ['supports', 'refutes', 'unclear']),
            source: oneOf(item.source, ['student', 'scan'])
        };
    });
    return {tests, poolOpened: input.poolOpened === true};
};

// GE：修訂前後並列＋修改理由；只列實際檢驗過的除數，其餘明確標為未知。
const cleanGE = input => {
    if (!plain(input.revision)) fail();
    const revision = {
        before: text(input.revision.before, 300),
        after: text(input.revision.after, 300),
        reason: text(input.revision.reason, 500)
    };
    if (!revision.after) fail();
    const checkedDivisors = divisors(input.checkedDivisors || []);
    const unknownDivisors = divisors(input.unknownDivisors || []);
    if (checkedDivisors.some(d => unknownDivisors.includes(d))) fail();
    // 第二批單元：逐一標記的是各組的資料卡（短文字 id），不是除數。
    if (Array.isArray(input.checkedItems) || Array.isArray(input.unknownItems)) {
        const checkedItems = labels(input.checkedItems || [], 20, 40);
        const unknownItems = labels(input.unknownItems || [], 20, 40);
        if (checkedItems.some(item => unknownItems.includes(item))) fail();
        return {revision, checkedDivisors, unknownDivisors, checkedItems, unknownItems};
    }
    return {revision, checkedDivisors, unknownDivisors};
};

// JU：說理文字與操作過的表徵；程式不判定說理是否成立。
const cleanJU = input => {
    if (!plain(input.justification)) fail();
    const justification = {
        text: text(input.justification.text, 1000),
        representation: text(input.justification.representation, 300, {optional: true})
    };
    if (!justification.text) fail();
    return {justification};
};

const CLEANERS = {EX: cleanEX, CG: cleanCG, VA: cleanVA, GE: cleanGE, JU: cleanJU};

const cleanArtifact = (stage, input) => {
    oneOf(stage, STAGES);
    if (!plain(input)) fail();
    return CLEANERS[stage](input);
};

const clip = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

// 給試算表「作品摘要」欄與教師頁清單用；只依作品內容，不呼叫模型。
const summarizeArtifact = (stage, artifact) => {
    if (stage === 'EX' && artifact.kind === 'sort') {
        const own = artifact.examples.filter(e => e.source === 'student').length;
        return clip(`${artifact.groups.join('、')}｜例子${artifact.examples.length}（自填${own}）｜分類${
            artifact.sorting.length}`, 200);
    }
    if (stage === 'EX') {
        const own = artifact.examples.filter(e => e.source === 'student').length;
        const cards = artifact.cards.join('、');
        return clip(`卡${cards}｜例子${artifact.examples.length}（自填${own}）｜分類${artifact.classification.length}`, 200);
    }
    if (stage === 'CG') return clip(`猜想：${artifact.conjecture.text}`, 200);
    if (stage === 'VA') {
        const refutes = artifact.tests.filter(t => t.verdict === 'refutes').length;
        return clip(`檢驗${artifact.tests.length}筆｜反駁${refutes}｜猜想池${artifact.poolOpened ? '已開' : '未開'}`, 200);
    }
    if (stage === 'GE') return clip(`修訂：${artifact.revision.after}`, 200);
    return clip(`說理：${artifact.justification.text}`, 200);
};

// 過關判定：checks 逐項列出檢核點由誰判定；學生端不能寫入教師確認。
const cleanGate = (stage, input) => {
    oneOf(stage, STAGES);
    if (!plain(input)) fail();
    const checks = list(input.checks, 10, item => {
        if (!plain(item)) fail();
        return {id: text(item.id, 40), met: item.met === true, by: oneOf(item.by, ['program', 'ai', 'student'])};
    });
    return {
        activityDone: input.activityDone === true,
        reasoningStatus: oneOf(input.reasoningStatus, STUDENT_REASONING_STATUS),
        checks
    };
};

const cleanExposure = input => {
    if (!plain(input)) fail();
    return {item: oneOf(input.item, EXPOSURE_ITEMS), ref: text(input.ref, 80, {optional: true})};
};

const cleanStageFields = input => {
    if (!UNIT_PATTERN.test(input.unit || '')) fail();
    return {unit: input.unit, stage: oneOf(input.stage, STAGES)};
};

module.exports = {
    STAGES,
    STAGE_LABELS,
    STUDENT_REASONING_STATUS,
    EXPOSURE_ITEMS,
    cleanArtifact,
    cleanGate,
    cleanExposure,
    cleanStageFields,
    summarizeArtifact
};
