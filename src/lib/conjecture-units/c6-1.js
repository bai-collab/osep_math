/* eslint-disable import/no-commonjs */
/**
 * 單元 ⑥-1「兩堆乘法相加，能合起來算嗎」（來源：四單元臆測任務—臆測五階段教學設計，第 25～31 頁）。
 * 學生看到的標題刻意不寫性質的名稱（投影片：名稱留到一般化之後才給）。
 *
 * 這個檔案會打包進學生端，所以**只能放學生可以看的內容**。教師層的答案、出題意圖與目標結論一律不放這裡。
 *
 * 自學改編（比照 ②-1）：
 * - 學生固定拿第 1 組的卡 A（鈕扣與木頭）；其他三組以「虛擬組員」帶著卡 B、C、D 登場。
 *   投影片說「卡上只有點陣圖、不印算式」，所以虛擬組員的資料只給情境描述，算式由學生自己寫。
 * - 造例是「分類型」：例子是「兩堆乘法相加」的算式，學生分成「可以合起來算／合不起來」。
 * - 證實用點陣圖：滑桿改每排紅點、每排藍點與排數。
 */
const {GOALS, TITLES, CHECKLISTS, FINISH, cgSteps, vaSteps, geSteps, juSteps, makeToCourse} = require('./shared.js');

const UNIT_CODE = 'C6-1';
const STUDENT_CARD = '卡 A：鈕扣一包 6 顆、木頭一包 4 顆，各買 5 包';

const VIRTUAL_GROUPS = [
    {id: 'g2', name: '小明組', cardLabel: '卡 B', lines: ['紅貼紙每排 5 張，貼了 4 排', '綠貼紙每排 5 張，貼了 3 排']},
    {id: 'g3', name: '小華組', cardLabel: '卡 C', lines: ['果汁一箱 18 瓶，買了 5 箱', '汽水一箱 12 瓶，買了 5 箱']},
    {id: 'g4', name: '小英組', cardLabel: '卡 D', lines: ['蘋果一箱 6 顆，買了 5 箱', '橘子一箱 4 顆，買了 3 箱']}
];
const groupDataLines = group => group.lines;

// 猜想池：來自投影片「學生會提出的猜想」；打散順序、不標類別與真假，也不放本單元的結論句。
const CONJECTURE_POOL = [
    {id: 'pool-1', by: '小英組', text: '任何兩個乘法相加，都能合起來再乘一次。'},
    {id: 'pool-2', by: '小明組', text: '一定要乘數相同，才能合起來算。'},
    {id: 'pool-3', by: '小華組', text: '6×5＋4×5 可以直接寫成 6＋4×5，不用加括號。'},
    {id: 'pool-4', by: '小明組', text: '兩堆乘法相減，也可以用同樣的方法合起來。'}
];

const GE_ITEMS = [{id: 'A', label: '卡 A（我的）'}, ...VIRTUAL_GROUPS.map(g => ({id: g.cardLabel.replace('卡 ', ''),
    label: `${g.cardLabel}（${g.name}）`}))];

const LISTS = {
    examples: '點陣圖例子',
    myConjecture: '我的猜想',
    groupData: group => `${group.name}的資料`
};

const EX_MODE = 'sort';
const EX = {
    groups: [{id: 'expr',
        label: '兩堆乘法相加的算式',
        placeholder: '例如 6×5＋4×5',
        programList: LISTS.examples,
        invalidHint: '請寫成「□×□＋□×□」或「□×□－□×□」的樣子，例如 6×5＋4×5。'}],
    categories: [
        {id: 'combine', label: '可以合起來算'},
        {id: 'separate', label: '合不起來'}
    ],
    sortHint: '每個算式都按一下分類：可以合起來用一個乘法算，還是合不起來。可以用舞台的點陣圖排排看。'
};
// 兩堆乘法相加或相減：□×□＋□×□（數字 1～3 位）。
const EXAMPLE_PATTERN = /^\d{1,3}×\d{1,3}[＋－]\d{1,3}×\d{1,3}$/;
const validExample = (group, value) => group === 'expr' && EXAMPLE_PATTERN.test(String(value));
const CHECK_LABELS = {'examples-valid': '例子都寫成「兩堆乘法相加」的算式'};

const VA_INPUT = 'text';
const VA_PLACEHOLDER = '例如 5×4＋5×3＝35，再用另一種算法算算看';
const GE_HINT = '這些卡的資料，你檢驗過了嗎？沒檢驗過的就標「還不知道」。';
const JU = {
    representationLabel: '我在點陣圖上操作了什麼？（例如：每排 6 個紅點、4 個藍點，排了 5 排）',
    enumerationHint: '你好像是在列例子。例子列不完，換個方式想：紅點和藍點排在一起時，每一排有幾個點？一共有幾排？'
};

const sb3 = stage => `conjecture/${UNIT_CODE}/${UNIT_CODE}-${stage}.sb3`;
const STAGES = [
    {
        stage: 'EX',
        title: TITLES.EX,
        sb3Path: sb3('EX'),
        goal: GOALS.EX,
        task: `你拿到${STUDENT_CARD}。先自己寫出「兩堆乘法相加」的算式（至少 3 個不同的），` +
            '再用舞台的點陣圖排排看：兩堆能不能合起來，用一個乘法算出全部？把每個算式分成「可以合起來算」和「合不起來」。',
        checklist: ['至少 3 個不同的例子（先自己寫）', '有把例子分成「可以合起來算／合不起來」'],
        prompt: '再多造幾個算式，看看哪些可以合起來算、哪些不行？',
        steps: [
            {id: 'write',
                where: '右邊面板',
                text: '自己寫 3 個「兩堆乘法相加」的算式，例如卡 A 的買法，每寫一個按「加入」。',
                done: {type: 'studentExamples', group: 'expr', min: 3}},
            {id: 'draw',
                where: '程式區「步驟 2」',
                text: '用舞台左上角的滑桿排出卡 A 的點陣圖，按綠旗畫出來。',
                done: {type: 'manual'}},
            {id: 'record',
                where: '程式區「步驟 3」',
                text: `空白鍵那段少一塊：把「加入 (算式) 到 ${LISTS.examples}」放進去，再按空白鍵記下這個例子。`,
                done: {type: 'programList', list: LISTS.examples, min: 1, valid: {kind: 'expression'}}},
            {id: 'read',
                where: '右邊面板',
                text: `按「讀取程式清單『${LISTS.examples}』」，把程式記下的算式拿進來。`,
                done: {type: 'programExamples', group: 'expr', min: 1}},
            {id: 'sort',
                where: '右邊面板',
                text: '把每個算式分類：可以合起來算，還是合不起來。',
                done: {type: 'check', ids: ['examples-sorted']}},
            FINISH
        ]
    },
    {
        stage: 'CG',
        title: TITLES.CG,
        sb3Path: sb3('CG'),
        goal: GOALS.CG,
        task: '看看你分好類的算式，寫一句猜想：什麼時候兩堆乘法相加可以合起來，用一個乘法算？要說清楚對誰成立或什麼條件下成立。',
        checklist: CHECKLISTS.CG,
        prompt: '你說的方法，對哪些算式成立？用「只要…就…」說清楚。',
        steps: cgSteps('用滑桿把你分好類的算式排成點陣圖，按綠旗再看一次。')
    },
    {
        stage: 'VA',
        title: TITLES.VA,
        sb3Path: sb3('VA'),
        goal: GOALS.VA,
        task: '其他組的同學也帶著他們的卡來了。從別組的卡寫出算式，先預測它會支持還是推翻某一句猜想，再分開算、合起來算，比比看。',
        checklist: CHECKLISTS.VA,
        prompt: '別只是同意，從別組的卡寫一個算式，分開算和合起來算，看看一樣嗎？',
        steps: vaSteps({toolText: '看右邊「其他組帶來的資料」，用滑桿把別組的卡排成點陣圖，按綠旗畫出來。',
            testText: '從其他組的卡寫出一個算式，先預測它會支持還是推翻你的猜想；分開算和合起來算都寫進「驗算」，按「記下這次檢驗」。'})
    },
    {
        stage: 'GE',
        title: TITLES.GE,
        sb3Path: sb3('GE'),
        goal: GOALS.GE,
        task: '把原本的猜想和修改後的說法並排寫下來，說明為什麼要這樣改。逐一標記每張卡的資料你有沒有檢驗過。',
        checklist: CHECKLISTS.GE,
        prompt: '換成任意的數還成立嗎？想想要加什麼限制條件。',
        steps: geSteps({toolText: '想再確認的話，用滑桿排出別的點陣圖看看；也可以點開右邊「回顧效化時的檢驗」。',
            items: GE_ITEMS})
    },
    {
        stage: 'JU',
        title: TITLES.JU,
        sb3Path: sb3('JU'),
        goal: GOALS.JU,
        task: '操作舞台上的點陣圖：用滑桿改「每排紅點」「每排藍點」「排數」，看兩堆點怎麼排在一起。然後用「因為…所以…」寫出為什麼一定成立。',
        checklist: CHECKLISTS.JU,
        prompt: '例子列不完，你要怎麼說服別人每一個都對？',
        steps: juSteps({drawText: '用舞台左上角的滑桿改「每排紅點」「每排藍點」「排數」，按綠旗把點陣圖畫出來。',
            askText: '按空白鍵：自己數一排有幾個點、有幾排，再預測全部有幾個點。',
            varyText: '換不同的數再試一次：紅點和藍點排在一起的樣子，會不會變？'})
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

const toCourse = makeToCourse(UNIT_CODE, '⑥-1 兩堆乘法相加，能合起來算嗎', STAGES);

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
