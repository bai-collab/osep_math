/* eslint-disable import/no-commonjs */
/**
 * 第二批單元（④-1、⑥-1、⑥-2）共用的小工具：課程格式轉換與標準步驟卡。
 *
 * 這個檔案會打包進學生端，只放學生可見的流程文字；不放任何單元的結論。
 * 步驟卡的程式區編號（「步驟 N」）必須和各單元 sb3 註解一致（測試會檢查）。
 */

const GOALS = {
    EX: '自己造出足夠多、不同的例子，並開始整理。',
    CG: '把觀察說成一句「有範圍」的猜想。對不對先不管。',
    VA: '用新例子或反例，檢驗猜想到底對不對。',
    GE: '把留下來的猜想推廣到更廣的範圍，並補上條件。',
    JU: '說出「為什麼每一個都一定成立」，不只是舉例。'
};
const TITLES = {
    EX: '① 造例：造出很多例子',
    CG: '② 提出猜想：說成一句話',
    VA: '③ 效化：拿別組的資料來檢驗',
    GE: '④ 一般化：修訂成更完整的說法',
    JU: '⑤ 證實：說出為什麼一定成立'
};
const CHECKLISTS = {
    CG: ['說出一句猜想', '有講對誰成立，或什麼條件下成立'],
    VA: ['拿新例子或反例來檢驗', '有寫出驗算，不只是把猜想再說一次'],
    GE: ['把範圍推到更廣（所有／任何）', '補上適用條件'],
    JU: ['至少一個講道理的理由（不是列很多例子）', '把理由連到結論']
};

const FINISH = {id: 'finish',
    where: '右邊面板最下面',
    text: '檢核點都打勾後，按「完成本階段」。',
    done: {type: 'stageDone'}};

const cgSteps = toolText => [
    {id: 'look', where: '程式區「步驟 1」', text: toolText, done: {type: 'manual'}},
    {id: 'write',
        where: '右邊面板',
        text: '選一種句型（只要…就…／所有…都…／用自己的話），把你看到的規律寫成一句猜想。',
        done: {type: 'check', ids: ['has-conjecture']}},
    {id: 'scope',
        where: '右邊面板',
        text: '檢查這句話有沒有說清楚「對誰成立」或「什麼條件下成立」。對不對先不用管。',
        done: {type: 'check', ids: ['has-scope-or-condition']}},
    FINISH
];

const vaSteps = ({toolText, testText}) => [
    {id: 'look', where: '程式區「步驟 1」', text: toolText, done: {type: 'manual'}},
    {id: 'test-own',
        where: '右邊面板',
        text: testText,
        done: {type: 'check', ids: ['tested-with-new-data', 'has-computation']}},
    {id: 'open-pool', where: '右邊面板', text: '按「打開猜想池」，看看其他組提出的猜想。', done: {type: 'flag', field: 'poolOpened'}},
    {id: 'test-pool',
        where: '右邊面板',
        text: '從猜想池挑一句，用同樣的方法（挑例子、預測、驗算）檢驗它，再記下來。',
        done: {type: 'check', ids: ['tested-pool-conjecture']}},
    FINISH
];

const geSteps = ({toolText, items}) => [
    {id: 'recheck', where: '程式區「步驟 1」（選做）', text: toolText, optional: true, done: {type: 'manual'}},
    {id: 'revise',
        where: '右邊面板',
        text: '寫下修改後的說法：用「所有／任何／只有…」說清楚範圍和條件，要和原本的猜想不一樣。',
        done: {type: 'check', ids: ['revised', 'has-scope-or-condition']}},
    {id: 'reason', where: '右邊面板', text: '寫下為什麼要這樣改：是哪個例子讓你改的？', done: {type: 'check', ids: ['has-reason']}},
    {id: 'marks',
        where: '右邊面板',
        text: '每一組的資料都標一下：你檢驗過的標「檢驗過」，沒檢驗過的標「還不知道」。',
        done: {type: 'allMarked', field: 'itemMarks', keys: items.map(item => item.id)}},
    FINISH
];

const juSteps = ({drawText, askText, varyText}) => [
    {id: 'draw', where: '程式區「步驟 1」', text: drawText, done: {type: 'manual'}},
    {id: 'ask', where: '程式區「步驟 2」', text: askText, done: {type: 'manual'}},
    {id: 'vary', where: '程式區「步驟 3」', text: varyText, done: {type: 'manual'}},
    {id: 'representation',
        where: '右邊面板',
        text: '寫下你在舞台上操作了什麼。',
        done: {type: 'field', field: 'representation', min: 4}},
    {id: 'because',
        where: '右邊面板',
        text: '用「因為…所以…」寫出為什麼一定成立，不要只列例子。',
        done: {type: 'check', ids: ['has-because-so']}},
    FINISH
];

const makeToCourse = (code, title, stages) => () => ({
    code,
    title,
    kind: 'conjecture',
    tasks: stages.map(s => ({
        id: s.stage,
        code: `${code}-${s.stage}`,
        title: s.title,
        kind: 'conjecture',
        unit: code,
        stage: s.stage,
        sb3Path: s.sb3Path,
        // 導師與面板共用的學生可見說明（provider 會取 description 當任務脈絡）。
        description: `${s.goal}\n${s.task}`,
        goal: s.goal,
        taskText: s.task,
        checklist: s.checklist,
        steps: s.steps || [],
        prompt: s.prompt,
        examples: [],
        testCases: []
    }))
});

module.exports = {GOALS, TITLES, CHECKLISTS, FINISH, cgSteps, vaSteps, geSteps, juSteps, makeToCourse};
