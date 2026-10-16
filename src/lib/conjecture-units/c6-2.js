/* eslint-disable import/no-commonjs */
/**
 * 單元 ⑥-2「連除的簡化性質」（來源：四單元臆測任務—臆測五階段教學設計，第 32～37 頁）。
 *
 * 這個檔案會打包進學生端，所以**只能放學生可以看的內容**。教師層的答案、出題意圖與目標結論一律不放這裡。
 *
 * 自學改編（比照 ②-1）：
 * - 學生固定拿第 1 組的卡 A（84 顆球）；其他三組以「虛擬組員」帶著卡 B、C、D 的情境登場。
 * - 造例是「分類型」：例子是連除的各種寫法（可以附答案），學生分成「換寫法後答案不變／答案變了」。
 * - 程式的「連除機」只照學生輸入的順序算 a÷b÷c，不會自動列出各種改寫法。
 * - 證實用長方形切分：先切成幾條、每條再切幾段。
 */
const {GOALS, TITLES, CHECKLISTS, FINISH, cgSteps, vaSteps, geSteps, juSteps, makeToCourse} = require('./shared.js');

const UNIT_CODE = 'C6-2';
const STUDENT_CARD = '卡 A：84 顆球，先平分成 4 份，每一份再平分成 7 份';

const VIRTUAL_GROUPS = [
    {id: 'g2', name: '小明組', cardLabel: '卡 B', lines: ['120 個布丁，每 3 個裝一盒，每 4 盒裝一箱']},
    {id: 'g3', name: '小華組', cardLabel: '卡 C', lines: ['600 顆桃子，每 25 顆裝一盒，每 4 盒裝一箱']},
    {id: 'g4', name: '小英組', cardLabel: '卡 D', lines: ['24 顆糖，每 6 顆裝一袋，每 2 袋裝一盒']}
];
const groupDataLines = group => group.lines;

// 猜想池：來自投影片「學生會提出的猜想」；打散順序、不標類別與真假，也不放本單元的結論句。
const CONJECTURE_POOL = [
    {id: 'pool-1', by: '小華組', text: '連除可以改成先除後乘：a÷b÷c＝a÷b×c。'},
    {id: 'pool-2', by: '小英組', text: '除法也可以隨便加括號，a÷(b÷c) 和連除一樣。'},
    {id: 'pool-3', by: '小明組', text: '除法也可以交換：a÷b＝b÷a。'},
    {id: 'pool-4', by: '小英組', text: '連除兩個數時，兩個除數對調，答案一樣。'}
];

const GE_ITEMS = [{id: 'A', label: '卡 A（我的）'}, ...VIRTUAL_GROUPS.map(g => ({id: g.cardLabel.replace('卡 ', ''),
    label: `${g.cardLabel}（${g.name}）`}))];

const LISTS = {
    examples: '連除例子',
    myConjecture: '我的猜想',
    groupData: group => `${group.name}的資料`
};

const EX_MODE = 'sort';
const EX = {
    groups: [{id: 'expr',
        label: '連除的算式（可以附答案）',
        placeholder: '例如 84÷4÷7＝3',
        programList: LISTS.examples,
        invalidHint: '請寫出含有「÷」的算式，可以加括號或「＝答案」，例如 84÷4÷7＝3。'}],
    categories: [
        {id: 'same', label: '換寫法後答案不變'},
        {id: 'changed', label: '換寫法後答案變了'}
    ],
    sortHint: '每個算式都按一下分類：和原本的算法比，答案不變，還是變了。'
};
// 只能有數字、÷、×、括號，可以在最後接「＝答案」；而且至少要有一個 ÷。
const EXAMPLE_PATTERN = /^[\d÷×()]{3,40}(?:＝\d{1,6}(?:\.\d{1,4})?)?$/;
const validExample = (group, value) => group === 'expr' && EXAMPLE_PATTERN.test(String(value)) &&
    String(value).includes('÷');
const CHECK_LABELS = {'examples-valid': '例子都寫成含有「÷」的算式'};

const VA_INPUT = 'text';
const VA_PLACEHOLDER = '例如 120÷3÷4＝10，再用另一種寫法算算看';
const GE_HINT = '這些卡的資料，你檢驗過了嗎？沒檢驗過的就標「還不知道」。';
const JU = {
    representationLabel: '我在長方形上操作了什麼？（例如：先切成 3 條，每條再切 4 段）',
    enumerationHint: '你好像是在列例子。例子列不完，換個方式想：先切成幾條、每條再切幾段，一共切成幾小塊？'
};

const sb3 = stage => `conjecture/${UNIT_CODE}/${UNIT_CODE}-${stage}.sb3`;
const STAGES = [
    {
        stage: 'EX',
        title: TITLES.EX,
        sb3Path: sb3('EX'),
        goal: GOALS.EX,
        task: `你拿到${STUDENT_CARD}。先自己寫出幾種算法和答案（至少 3 個不同的算式），再用程式的「連除機」算算看。` +
            '把每個算式分成「換寫法後答案不變」和「答案變了」。',
        checklist: ['至少 3 個不同的例子（先自己寫）', '有把例子分成「答案不變／答案變了」'],
        prompt: '多寫幾題連除，把兩個除數記下來比比看？',
        steps: [
            {id: 'write',
                where: '右邊面板',
                text: '自己寫 3 個連除的算式（可以附答案），每寫一個按「加入」。',
                done: {type: 'studentExamples', group: 'expr', min: 3}},
            {id: 'machine',
                where: '程式區「步驟 2」',
                text: '按綠旗使用連除機：依序輸入被除數和兩個除數，看看答案。換個順序再算一次。',
                done: {type: 'manual'}},
            {id: 'record',
                where: '程式區「步驟 3」',
                text: `連除機最後少一塊：把「加入 (算式) 到 ${LISTS.examples}」拖到「連除機」那塊下面，貼緊接上` +
                    '（放開時會吸在一起）；只放在旁邊沒接上，不會記下來。再按綠旗算一次。',
                done: {type: 'programList', list: LISTS.examples, min: 1, valid: {kind: 'expression'}}},
            {id: 'read',
                where: '右邊面板',
                text: `按「讀取程式清單『${LISTS.examples}』」，把連除機記下的算式拿進來。`,
                done: {type: 'programExamples', group: 'expr', min: 1}},
            {id: 'sort',
                where: '右邊面板',
                text: '把每個算式分類：換寫法後答案不變，還是變了。',
                done: {type: 'check', ids: ['examples-sorted']}},
            FINISH
        ]
    },
    {
        stage: 'CG',
        title: TITLES.CG,
        sb3Path: sb3('CG'),
        goal: GOALS.CG,
        task: '看看你分好類的算式，寫一句猜想：連除的時候，可以怎麼改寫，答案還是一樣？要說清楚對誰成立或什麼條件下成立。',
        checklist: CHECKLISTS.CG,
        prompt: '你說的改法，對哪些算式都成立？用「只要…就…」或「所有…都…」說清楚。',
        steps: cgSteps('按綠旗用連除機再算幾題，看看你分好類的算式。')
    },
    {
        stage: 'VA',
        title: TITLES.VA,
        sb3Path: sb3('VA'),
        goal: GOALS.VA,
        task: '其他組的同學也帶著他們的題目來了。從別組的題目寫出算式，先預測它會支持還是推翻某一句猜想，再算算看。',
        checklist: CHECKLISTS.VA,
        prompt: '算算別組的題目，用你的改法和原本的算法比一比，一樣嗎？',
        steps: vaSteps({toolText: '看右邊「其他組帶來的資料」，按綠旗用連除機算算別組的題目。',
            testText: '從其他組的題目寫出一個算式，先預測它會支持還是推翻你的猜想；把原本的算法和改寫後的算法都寫進「驗算」，按「記下這次檢驗」。'})
    },
    {
        stage: 'GE',
        title: TITLES.GE,
        sb3Path: sb3('GE'),
        goal: GOALS.GE,
        task: '把原本的猜想和修改後的說法並排寫下來，說明為什麼要這樣改。逐一標記每張卡的資料你有沒有檢驗過。',
        checklist: CHECKLISTS.GE,
        prompt: '哪些改法可以、哪些不行？把邊界說清楚。',
        steps: geSteps({toolText: '想再確認的話，按綠旗用連除機多算幾題；也可以點開右邊「回顧效化時的檢驗」。',
            items: GE_ITEMS})
    },
    {
        stage: 'JU',
        title: TITLES.JU,
        sb3Path: sb3('JU'),
        goal: GOALS.JU,
        task: '操作舞台上的長方形：用滑桿改「先切成幾條」「每條再切幾段」，看長方形一共被切成幾小塊。然後用「因為…所以…」寫出為什麼一定成立。',
        checklist: CHECKLISTS.JU,
        prompt: '例子列不完，你要怎麼說服別人每一個都對？',
        steps: juSteps({drawText: '用舞台左上角的滑桿改「先切成幾條」「每條再切幾段」，按綠旗把長方形切出來。',
            askText: '按空白鍵：自己數一共切成幾小塊，再預測換個切法會不會變。',
            varyText: '把兩個數對調再切一次：小塊的數量會不會變？'})
    }
];

const injections = (stage, progress) => {
    const artifacts = (progress && progress.artifacts) || {};
    const lists = {};
    const ex = artifacts.EX;
    if (ex && ex.kind === 'sort' && stage !== 'EX') lists[LISTS.examples] = ex.examples.map(e => e.value);
    const cg = artifacts.CG;
    if (cg && ['VA', 'GE', 'JU'].includes(stage)) lists[LISTS.myConjecture] = [cg.conjecture.text];
    if (stage === 'VA') for (const group of VIRTUAL_GROUPS) lists[LISTS.groupData(group)] = group.lines;
    return {lists};
};

const toCourse = makeToCourse(UNIT_CODE, '⑥-2 連除的簡化性質', STAGES);

module.exports = {
    UNIT_CODE,
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
    groupDataLines,
    validExample,
    injections,
    toCourse
};
