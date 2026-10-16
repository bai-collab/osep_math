/* eslint-disable import/no-commonjs */
/**
 * 單元 ④-1「公倍數與最小公倍數的關係」（來源：四單元臆測任務—臆測五階段教學設計，第 13～18 頁）。
 *
 * 這個檔案會打包進學生端，所以**只能放學生可以看的內容**。教師層的答案、出題意圖與目標結論一律不放這裡。
 *
 * 自學改編（比照 ②-1）：
 * - 學生固定拿第 1 組的數對卡（4、5）；其他三組以「虛擬組員」登場，只在學生交出猜想之後才看得到。
 * - 造例是「分類型」：把 4 的倍數、5 的倍數寫出來，再把每個數分成「只是 4 的倍數／只是 5 的倍數／兩個都是」。
 * - 證實用數線上兩隻青蛙的落點；原投影片第 18 頁的說理少了一步（計畫書 15.5 第 3 點），
 *   這裡在證實任務中多問學生一個問題，補上那一步的思考（待教師確認）。
 */
const {GOALS, TITLES, CHECKLISTS, FINISH, cgSteps, vaSteps, geSteps, juSteps, makeToCourse} = require('./shared.js');

const UNIT_CODE = 'C4-1';
const STUDENT_CARDS = [4, 5];
const [A, B] = STUDENT_CARDS;

const VIRTUAL_GROUPS = [
    {id: 'g2', name: '小明組', cards: [3, 6]},
    {id: 'g3', name: '小華組', cards: [4, 6]},
    {id: 'g4', name: '小英組', cards: [6, 9]}
];

const multiplesOf = (card, count = 12) => Array.from({length: count}, (_, i) => card * (i + 1));
const groupDataLines = group => group.cards.map(card => `${card} 的倍數：${multiplesOf(card, 12).join('、')}`);

// 猜想池：來自投影片「學生會提出的猜想」；打散順序、不標類別與真假，也不放本單元的結論句。
const CONJECTURE_POOL = [
    {id: 'pool-1', by: '小華組', text: '兩個數的最小公倍數，就是把兩個數相乘。'},
    {id: 'pool-2', by: '小明組', text: '兩個數的最小公倍數，就是比較大的那個數。'},
    {id: 'pool-3', by: '小英組', text: '兩個數也有一個最大的公倍數。'},
    {id: 'pool-4', by: '小華組', text: '公倍數會一直有，沒有最後一個。'}
];

// 一般化時逐一標記的資料：自己的數對和三組虛擬組員的數對。
const GE_ITEMS = [[A, B], ...VIRTUAL_GROUPS.map(g => g.cards)]
    .map(([x, y]) => ({id: `${x}-${y}`, label: `${x} 和 ${y}`}));

const LISTS = {
    multiples: card => `${card}的倍數`,
    myConjecture: '我的猜想',
    groupData: group => `${group.name}的資料`
};

const EX_MODE = 'sort';
const EX = {
    groups: STUDENT_CARDS.map(card => ({id: String(card),
        label: `${card} 的倍數`,
        placeholder: `寫一個 ${card} 的倍數`,
        programList: LISTS.multiples(card),
        invalidHint: `這個數不是 ${card} 的倍數，再算一次。`})),
    categories: [
        {id: 'only-a', label: `只是 ${A} 的倍數`},
        {id: 'only-b', label: `只是 ${B} 的倍數`},
        {id: 'both', label: '兩個都是'}
    ],
    sortHint: `每個數都按一下分類：只是 ${A} 的倍數、只是 ${B} 的倍數，還是兩個都是。`
};
const validExample = (group, value) => {
    if (!/^\d{1,6}$/.test(String(value))) return false;
    const n = Number(value);
    return STUDENT_CARDS.map(String).includes(group) && n > 0 && n % Number(group) === 0;
};
const CHECK_LABELS = {'examples-valid': `例子都是 ${A} 或 ${B} 的倍數`};

const VA_INPUT = 'number';
const VA_PLACEHOLDER = '例如 36 ÷ 9 ＝ 4，36 ÷ 6 ＝ 6';
const GE_HINT = '這些數對的資料，你檢驗過了嗎？沒檢驗過的就標「還不知道」。';
const JU = {
    representationLabel: '我在數線上操作了什麼？（例如：把跳的格數改成 4 和 6）',
    enumerationHint: '你好像是在列例子。例子列不完，換個方式想：兩隻青蛙第一次一起落地以後，接下來的跳法和從 0 出發時一樣嗎？'
};

const sb3 = stage => `conjecture/${UNIT_CODE}/${UNIT_CODE}-${stage}.sb3`;
const STAGES = [
    {
        stage: 'EX',
        title: TITLES.EX,
        sb3Path: sb3('EX'),
        goal: GOALS.EX,
        task: `你拿到數對卡 ${A} 和 ${B}。先自己寫出幾個 ${A} 的倍數和 ${B} 的倍數，再改程式讓小貓在百數表上圈出更多。` +
            `接著把每個數分類：只是 ${A} 的倍數、只是 ${B} 的倍數，還是兩個都是。看看「兩個都是」的數裡，最小的是哪一個。`,
        checklist: ['至少 3 個不同的例子（先自己寫）', `有把例子分類：只是 ${A}／只是 ${B}／兩個都是`],
        prompt: '先把第一個數的倍數圈出來，再圈第二個數的倍數，看看哪些同時出現，最小的是哪個？',
        steps: [
            {id: 'write-a',
                where: '右邊面板',
                text: `在「${A} 的倍數」自己寫 2 個 ${A} 的倍數，每寫一個按「加入」。`,
                done: {type: 'studentExamples', group: String(A), min: 2}},
            {id: 'run-a',
                where: '程式區「步驟 2」',
                text: `把「重複 3 次」的 3 改大一點，再按綠旗，看小貓圈出哪些 ${A} 的倍數。`,
                done: {type: 'programList', list: LISTS.multiples(A), min: 4, valid: {kind: 'multipleOf', of: A}}},
            {id: 'read-a',
                where: '右邊面板',
                text: `按「讀取程式清單『${LISTS.multiples(A)}』」，把程式找到的數拿進來。`,
                done: {type: 'programExamples', group: String(A), min: 1}},
            {id: 'write-b',
                where: '右邊面板',
                text: `換 ${B}：在「${B} 的倍數」自己寫 1 個以上 ${B} 的倍數。`,
                done: {type: 'studentExamples', group: String(B), min: 1}},
            {id: 'run-b',
                where: '程式區「步驟 5」',
                text: `${B} 那段少一塊：把「加入 … 到 ${LISTS.multiples(B)}」放進迴圈，次數改大，再按空白鍵。`,
                done: {type: 'programList', list: LISTS.multiples(B), min: 1, valid: {kind: 'multipleOf', of: B}}},
            {id: 'read-b',
                where: '右邊面板',
                text: `按「讀取程式清單『${LISTS.multiples(B)}』」。`,
                done: {type: 'programExamples', group: String(B), min: 1}},
            {id: 'sort',
                where: '右邊面板',
                text: `把每個數分類：只是 ${A} 的倍數、只是 ${B} 的倍數，還是兩個都是。`,
                done: {type: 'check', ids: ['examples-sorted']}},
            FINISH
        ]
    },
    {
        stage: 'CG',
        title: TITLES.CG,
        sb3Path: sb3('CG'),
        goal: GOALS.CG,
        task: '看看「兩個都是」的那些數，和其中最小的那一個，寫一句它們之間關係的猜想。要說清楚對誰成立或什麼條件下成立。',
        checklist: CHECKLISTS.CG,
        prompt: '它們之間是什麼關係？用一句話把關係說清楚。',
        steps: cgSteps('按綠旗，把你在造例做出的例子畫回百數表，再看一次「兩個都是」的數。')
    },
    {
        stage: 'VA',
        title: TITLES.VA,
        sb3Path: sb3('VA'),
        goal: GOALS.VA,
        task: '其他組的同學也帶著他們的數對卡和例子來了。挑一個數，先預測它會支持還是推翻某一句猜想，再算算看。',
        checklist: CHECKLISTS.VA,
        prompt: '別急著同意，拿別組的數對驗算看看，還成立嗎？',
        steps: vaSteps({toolText: '按綠旗把你的例子畫回百數表，再看右邊「其他組帶來的資料」。按空白鍵可以用驗算機。',
            testText: '從其他組的資料挑一個數，先預測它會支持還是推翻你的猜想；用驗算機或自己算，把算式寫進「驗算」，按「記下這次檢驗」。'})
    },
    {
        stage: 'GE',
        title: TITLES.GE,
        sb3Path: sb3('GE'),
        goal: GOALS.GE,
        task: '把原本的猜想和修改後的說法並排寫下來，說明為什麼要這樣改。逐一標記每一組的資料你有沒有檢驗過。',
        checklist: CHECKLISTS.GE,
        prompt: '這條對所有的兩個數都成立嗎？想想要加什麼條件。',
        steps: geSteps({toolText: '想再確認的話，按空白鍵用驗算機多檢查幾個數；也可以點開右邊「回顧效化時的檢驗」。',
            items: GE_ITEMS})
    },
    {
        stage: 'JU',
        title: TITLES.JU,
        sb3Path: sb3('JU'),
        goal: GOALS.JU,
        task: `操作舞台上的數線：兩隻青蛙從 0 出發，一隻每次跳 ${A} 格、一隻每次跳 ${B} 格。` +
            '改改跳的格數，找出牠們第一次一起落地的地方，再想想：下一次一起落地會在哪裡？中間會不會還有別的一起落地的地方？' +
            '然後用「因為…所以…」寫出你的理由。',
        checklist: CHECKLISTS.JU,
        prompt: '例子列不完，你要怎麼說服別人每一個都對？',
        steps: juSteps({drawText: '用舞台左上角的滑桿改兩隻青蛙每次跳的格數，按綠旗看牠們在數線上的落點。',
            askText: '按空白鍵：先找出第一次一起落地的位置，再預測下一次一起落地在哪裡。',
            varyText: '換一組跳的格數再試一次：第一次一起落地以後，中間會不會還有別的一起落地的地方？'})
    }
];

// 前階段作品要寫進下一階段專案的清單。
const injections = (stage, progress) => {
    const artifacts = (progress && progress.artifacts) || {};
    const lists = {};
    const ex = artifacts.EX;
    if (ex && ex.kind === 'sort' && stage !== 'EX') {
        for (const card of STUDENT_CARDS) {
            lists[LISTS.multiples(card)] = ex.examples.filter(e => e.group === String(card))
                .map(e => Number(e.value))
                .filter(n => Number.isSafeInteger(n))
                .sort((x, y) => x - y);
        }
    }
    const cg = artifacts.CG;
    if (cg && ['VA', 'GE', 'JU'].includes(stage)) lists[LISTS.myConjecture] = [cg.conjecture.text];
    if (stage === 'VA') {
        for (const group of VIRTUAL_GROUPS) {
            lists[LISTS.groupData(group)] = group.cards.flatMap(card => multiplesOf(card, 12));
        }
    }
    return {lists};
};

const toCourse = makeToCourse(UNIT_CODE, '④-1 公倍數與最小公倍數的關係', STAGES);

module.exports = {
    UNIT_CODE,
    STUDENT_CARDS,
    VIRTUAL_GROUPS,
    CONJECTURE_POOL,
    GE_ITEMS,
    GE_HINT,
    LISTS,
    STAGES,
    EX_MODE,
    EX,
    CHECK_LABELS,
    VA_INPUT,
    VA_PLACEHOLDER,
    JU,
    multiplesOf,
    groupDataLines,
    validExample,
    injections,
    toCourse
};
