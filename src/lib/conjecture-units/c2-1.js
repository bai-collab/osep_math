/* eslint-disable import/no-commonjs */
/**
 * 單元 ②-1「百數表倍數的個位規律」（來源：四單元臆測任務—臆測五階段教學設計，第 7～12 頁）。
 *
 * 這個檔案會打包進學生端，所以**只能放學生可以看的內容**：任務說明、檢核點、引導提問、
 * 卡片與虛擬組員資料。教師層的答案、出題意圖與目標結論一律不放這裡。
 *
 * 自學改編（計畫書第 6、15 節）：
 * - 學生固定拿第 1 組的卡（2、10）；其他三組以「虛擬組員」登場，只在學生交出猜想之後才看得到。
 * - 猜想池只標「誰提的」，真假一律「待檢驗」；EX、CG 階段不展示。
 * - 效化的反例要由學生自己挑數、先預測再驗算；程式掃描只當輔助。
 */

const UNIT_CODE = 'C2-1';

const STUDENT_CARDS = [2, 10];

// 虛擬組員：卡片與他們造出的「原始例子」。不附整理好的個位集合，讓學生自己看、自己算。
const VIRTUAL_GROUPS = [
    {id: 'g2', name: '小明組', cards: [3, 10]},
    {id: 'g3', name: '小華組', cards: [4, 5]},
    {id: 'g4', name: '小英組', cards: [6, 5]}
];

const multiplesOf = (card, count = 12) => Array.from({length: count}, (_, i) => card * (i + 1));

// 猜想池：來自投影片「學生會提出的猜想」三類；這裡刻意打散順序、不標類別與真假。
const CONJECTURE_POOL = [
    {id: 'pool-1', by: '小華組', text: '只要個位是 0、2、4、6、8，就是 4 的倍數。'},
    {id: 'pool-2', by: '小英組', text: '只要個位是 0 或 5，就是 5 的倍數。'},
    {id: 'pool-3', by: '小明組', text: '看一個數的個位，就能判斷它是不是某個數的倍數。'},
    {id: 'pool-4', by: '小英組', text: '只要個位對了，就是 6 的倍數。'},
    {id: 'pool-5', by: '小明組', text: '倍數的個位會照固定的順序一直重複。'}
];

// 一般化時讓學生逐一標記的除數：只用本單元卡片上出現過的數（計畫書 15.2 縮小範圍）。
const CANDIDATE_DIVISORS = [2, 3, 4, 5, 6, 10];

// 半成品專案中的清單名稱（P5d 產生 sb3 時必須使用同樣的名稱）。
const LISTS = {
    multiples: card => `${card}的倍數`,
    ones: card => `${card}的倍數的個位`,
    myConjecture: '我的猜想',
    groupData: group => `${group.name}的資料`,
    counterexamples: '反例'
};

const STAGES = [
    {
        stage: 'EX',
        title: '① 造例：造出很多例子',
        sb3Path: 'conjecture/C2-1/C2-1-EX.sb3',
        goal: '自己造出足夠多、不同的例子，並開始整理。',
        task: '你拿到兩張卡：2 和 10。先自己寫出至少 3 個 2 的倍數，再改程式讓小貓在百數表上幫你找出更多。' +
            '接著把「個位」整理成「出現的」和「沒出現的」。10 也做一次。',
        checklist: ['至少 3 個不同的例子（先自己寫）', '有把例子的個位分類：出現的／沒出現的'],
        prompt: '再多圈幾個，把個位整理成「出現的／沒出現的」看看？'
    },
    {
        stage: 'CG',
        title: '② 提出猜想：說成一句話',
        sb3Path: 'conjecture/C2-1/C2-1-CG.sb3',
        goal: '把觀察說成一句「有範圍」的猜想。對不對先不管。',
        task: '看看你整理好的個位，寫一句猜想。要說清楚「對誰成立」（所有…都…）或「什麼條件下」（只要…就…）。',
        checklist: ['說出一句猜想', '有講對誰成立，或什麼條件下成立'],
        prompt: '你說的規律，對哪些倍數成立？用「所有…都…」或「只要…就…」說清楚。'
    },
    {
        stage: 'VA',
        title: '③ 效化：拿別組的資料來檢驗',
        sb3Path: 'conjecture/C2-1/C2-1-VA.sb3',
        goal: '用新例子或反例，檢驗猜想到底對不對。',
        task: '其他組的同學也帶著他們的卡片和例子來了。挑一個數，先預測它會支持還是推翻某一句猜想，再算算看。',
        checklist: ['拿新例子或反例來檢驗', '有寫出驗算，不只是把猜想再說一次'],
        prompt: '別重述，找一個個位符合、卻不是那個倍數的數，算算看？'
    },
    {
        stage: 'GE',
        title: '④ 一般化：修訂成更完整的說法',
        sb3Path: 'conjecture/C2-1/C2-1-GE.sb3',
        goal: '把留下來的猜想推廣到更廣的範圍，並補上條件。',
        task: '把原本的猜想和修改後的猜想並排寫下來，說明為什麼要這樣改。逐一標記每個除數你是否檢驗過。',
        checklist: ['把範圍推到更廣（所有／任何）', '補上適用條件'],
        prompt: '真的每個數都能看個位嗎？想想要加什麼條件。'
    },
    {
        stage: 'JU',
        title: '⑤ 證實：說出為什麼一定成立',
        sb3Path: 'conjecture/C2-1/C2-1-JU.sb3',
        goal: '說出「為什麼每一個都一定成立」，不只是舉例。',
        task: '操作舞台上的「十包和零散」表徵：改改包數，看看結果會不會變。然後用「因為…所以…」寫出你的理由。',
        checklist: ['至少一個講道理的理由（不是列很多例子）', '把理由連到結論'],
        prompt: '例子列不完，你要怎麼說服別人每一個都對？'
    }
];

// 前階段作品要寫進下一階段專案的哪些清單／變數（P5c 載入 sb3 後套用）。
// progress.artifacts[stage] 是已清理過的作品（conjecture-artifact.js 格式）。
const injections = (stage, progress) => {
    const artifacts = (progress && progress.artifacts) || {};
    const lists = {};
    const ex = artifacts.EX;
    if (ex && stage !== 'EX') {
        for (const card of ex.cards) {
            const values = ex.examples.filter(e => e.card === card).map(e => e.value)
                .sort((a, b) => a - b);
            lists[LISTS.multiples(card)] = values;
            lists[LISTS.ones(card)] = values.map(v => v % 10);
        }
    }
    const cg = artifacts.CG;
    if (cg && ['VA', 'GE', 'JU'].includes(stage)) lists[LISTS.myConjecture] = [cg.conjecture.text];
    if (stage === 'VA') {
        for (const group of VIRTUAL_GROUPS) {
            lists[LISTS.groupData(group)] = group.cards.flatMap(card => multiplesOf(card, 10));
        }
        lists[LISTS.counterexamples] = [];
    }
    return {lists};
};

const toCourse = () => ({
    code: UNIT_CODE,
    title: '②-1 百數表倍數的個位規律',
    kind: 'conjecture',
    tasks: STAGES.map(s => ({
        id: s.stage,
        code: `${UNIT_CODE}-${s.stage}`,
        title: s.title,
        kind: 'conjecture',
        unit: UNIT_CODE,
        stage: s.stage,
        sb3Path: s.sb3Path,
        // 導師與面板共用的學生可見說明（provider 會取 description 當任務脈絡）。
        description: `${s.goal}\n${s.task}`,
        goal: s.goal,
        taskText: s.task,
        checklist: s.checklist,
        prompt: s.prompt,
        examples: [],
        testCases: []
    }))
});

module.exports = {
    UNIT_CODE,
    STUDENT_CARDS,
    VIRTUAL_GROUPS,
    CONJECTURE_POOL,
    CANDIDATE_DIVISORS,
    LISTS,
    STAGES,
    multiplesOf,
    injections,
    toCourse
};
