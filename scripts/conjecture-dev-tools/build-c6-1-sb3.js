// 產生單元 ⑥-1「兩堆乘法相加，能合起來算嗎」五個階段的半成品專案（.sb3）。
//
// 用法：node scripts/conjecture-dev-tools/build-c6-1-sb3.js
// 輸出：static/judge-content/conjecture/C6-1/C6-1-{EX,CG,VA,GE,JU}.sb3
//
// 設計：造例到一般化共用「點陣圖」工具（紅點 a 個一包×c 包、藍點 b 個一包×d 包），學生用滑桿排；
// 造例的空白鍵那段少一塊「加入 (算式) 到 點陣圖例子」。證實改成紅藍同一排（排數共用），
// 程式請學生自己數一排幾個、幾排，再預測全部，最後才說出總數。程式不說「可以合」或「不能合」。
const unit = require('../../src/lib/conjecture-units/c6-1.js');
const {num, txt, rep, createProject, blocks} = require('./sb3-kit.js');
const {NOTE_X, SPEAKER, BLANK, toolArea, runCli} = require('./sb3-units-common.js');

const AGENT = 'osep_math/build-c6-1-sb3';
const L = unit.LISTS;
const RED = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">' +
    '<circle cx="6" cy="6" r="5" fill="#e4572e"/></svg>';
const BLUE = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">' +
    '<circle cx="6" cy="6" r="5" fill="#2457a7"/></svg>';
const DOT_GAP = 14;
const ROW_GAP = 20;
// 從滑桿右側開始畫（滑桿佔舞台左邊約 120 像素），9＋9 欄也不會超出舞台。
const LEFT = -70;
const TOP = 140;

const dotSprite = p => {
    const s = p.sprite('點點', {x: 0, y: 0});
    p.costume(s, '紅', RED, {cx: 6, cy: 6});
    p.costume(s, '藍', BLUE, {cx: 6, cy: 6});
    p.costume(s, '說話', SPEAKER, {cx: 2, cy: 2});
    return s;
};
// 一塊點陣：rows 排、每排 cols 個，從 (startX, TOP) 開始。
const block = (s, b, costume, colsVar, rowsVar, startX) => [
    b.costume(costume),
    b.setVar('第幾排', num(0)),
    b.repeat(rep(b.getVar(rowsVar)), s.stack([
        b.setVar('第幾個', num(0)),
        b.repeat(rep(b.getVar(colsVar)), s.stack([
            b.gotoXY(rep(b.add(startX(), rep(b.mul(rep(b.getVar('第幾個')), num(DOT_GAP))))),
                rep(b.subtract(num(TOP), rep(b.mul(rep(b.getVar('第幾排')), num(ROW_GAP)))))),
            b.stamp(),
            b.changeVar('第幾個', num(1))
        ])),
        b.changeVar('第幾排', num(1))
    ]))
];
const exprOf = b => b.join(rep(b.getVar('紅每包'), 'txt'), rep(b.join(txt('×'), rep(b.join(rep(b.getVar('紅包數'), 'txt'),
    rep(b.join(txt('＋'), rep(b.join(rep(b.getVar('藍每包'), 'txt'), rep(b.join(txt('×'),
        rep(b.getVar('藍包數'), 'txt')), 'txt')), 'txt')), 'txt')), 'txt')), 'txt'));

// 點陣圖工具（造例～一般化）：兩堆分開排，紅在左、藍在右。
const dotToolProject = ({flagNote, recordGap = false}) => {
    const p = createProject();
    p.costume(p.stage, '白板', BLANK, {cx: 240, cy: 180});
    p.list(L.examples);
    p.list(L.myConjecture);
    unit.VIRTUAL_GROUPS.forEach(group => p.list(L.groupData(group)));
    p.variable('紅每包', 6);
    p.variable('紅包數', 5);
    p.variable('藍每包', 4);
    p.variable('藍包數', 5);
    ['第幾排', '第幾個', '算式'].forEach(name => p.variable(name, 0));
    p.sliderMonitor('紅每包', {x: 5, y: 5, min: 1, max: 9});
    p.sliderMonitor('紅包數', {x: 5, y: 60, min: 1, max: 9});
    p.sliderMonitor('藍每包', {x: 5, y: 115, min: 1, max: 9});
    p.sliderMonitor('藍包數', {x: 5, y: 170, min: 1, max: 9});
    const s = dotSprite(p);
    const b = blocks(p, s);
    const tool = toolArea(s);
    const draw = b.procedure('畫點陣圖');
    const blueStart = () => rep(b.add(num(LEFT + 24), rep(b.mul(rep(b.getVar('紅每包')), num(DOT_GAP)))));
    s.stack([draw.define, b.penClear(),
        ...block(s, b, '紅', '紅每包', '紅包數', () => num(LEFT)),
        ...block(s, b, '藍', '藍每包', '藍包數', blueStart),
        b.setVar('算式', rep(exprOf(b), 'txt')),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(rep(b.join(txt('紅點和藍點：'), rep(b.getVar('算式'), 'txt')), 'txt'))]);
    const hat = s.stack([b.whenFlag(), draw.call()], 40, 40);
    s.comment(hat, flagNote, NOTE_X, 30, 280, 100);
    if (recordGap) {
        // 造例：空白鍵要記下目前的算式，但少一塊「加入 (算式) 到 點陣圖例子」，學生自己補。
        const record = s.stack([b.whenKey('space'),
            b.sayFor(rep(b.join(txt('要記下這個例子：'), rep(b.getVar('算式'), 'txt')), 'txt'), 2)], 40, 200);
        s.comment(record, `步驟 3 在這裡改：這段少了一塊！從「變數」分類拖一塊「加入 … 到 ${L.examples}」放進來，` +
            '把『算式』變數放進空格，再按空白鍵。按一次記一個例子。', NOTE_X, 200, 300, 130);
    }
    tool(draw.define, '依四個滑桿蓋出紅點（每包幾顆×幾包）和藍點，並把算式放進變數『算式』。', 80);
    return p;
};

const buildEX = () => dotToolProject({recordGap: true,
    flagNote: '步驟 2：用舞台左上角的滑桿排出卡 A 的點陣圖（紅＝鈕扣、藍＝木頭），按綠旗畫出來。'});
const buildCG = () => dotToolProject({flagNote: '步驟 1：用滑桿把你分好類的算式排成點陣圖，按綠旗再看一次。'});
const buildVA = () => dotToolProject({flagNote: '步驟 1：看右邊「其他組帶來的資料」，用滑桿把別組的卡排成點陣圖，按綠旗畫出來。'});
const buildGE = () => dotToolProject({flagNote: '步驟 1（選做）：想再確認的話，用滑桿排出別的點陣圖，按綠旗看看。'});

// 證實：紅藍排在同一排，排數共用。
const buildJU = () => {
    const p = createProject();
    p.costume(p.stage, '白板', BLANK, {cx: 240, cy: 180});
    p.list(L.examples);
    p.list(L.myConjecture);
    p.variable('紅每排', 6);
    p.variable('藍每排', 4);
    p.variable('排數', 5);
    ['第幾排', '第幾個', '我的預測'].forEach(name => p.variable(name, 0));
    p.sliderMonitor('紅每排', {x: 5, y: 5, min: 1, max: 9});
    p.sliderMonitor('藍每排', {x: 5, y: 60, min: 1, max: 9});
    p.sliderMonitor('排數', {x: 5, y: 115, min: 1, max: 9});
    const s = dotSprite(p);
    const b = blocks(p, s);
    const tool = toolArea(s);
    const draw = b.procedure('畫同一排的點');
    const blueStart = () => rep(b.add(num(LEFT + 6), rep(b.mul(rep(b.getVar('紅每排')), num(DOT_GAP)))));
    s.stack([draw.define, b.penClear(),
        ...block(s, b, '紅', '紅每排', '排數', () => num(LEFT)),
        ...block(s, b, '藍', '藍每排', '排數', blueStart),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(txt('每一排先排紅點，再接著排藍點。'))]);
    const askUntil = (question, retry, correct) => [
        b.ask(txt(question)),
        b.repeatUntil(b.cmp('equals', rep(b.answer(), 'txt'), rep(correct())), s.stack([b.ask(txt(retry))]))
    ];
    const count = b.procedure('數數看', null, {warp: false});
    const perRow = () => b.add(rep(b.getVar('紅每排')), rep(b.getVar('藍每排')));
    // 詢問時先藏起來，問題才會印在輸入框上方；說答案前再現身。
    s.stack([count.define, b.costume('說話'),
        b.hide(),
        ...askUntil('一排有幾個點？', '再數一次：一排裡紅點和藍點一共幾個？', perRow),
        ...askUntil('有幾排？', '再數一次：一共有幾排？', () => b.getVar('排數')),
        b.ask(txt('那全部有幾個點？你預測：')),
        b.setVar('我的預測', rep(b.answer(), 'txt')),
        b.show(),
        b.say(rep(b.join(txt('你預測 '), rep(b.join(rep(b.getVar('我的預測'), 'txt'), rep(b.join(txt('；全部有 '),
            rep(b.join(rep(b.mul(rep(perRow()), rep(b.getVar('排數'))), 'txt'), txt(' 個點')), 'txt')), 'txt')), 'txt')),
        'txt'))]);
    const flag = s.stack([b.whenFlag(), draw.call()], 40, 40);
    s.comment(flag, '步驟 1：用舞台左上角的滑桿改「紅每排」「藍每排」「排數」，按綠旗把點陣圖畫出來。', NOTE_X, 30, 280, 80);
    const key = s.stack([b.whenKey('space'), count.call()], 40, 200);
    s.comment(key, '步驟 2：按空白鍵：自己數一排有幾個點、有幾排，再預測全部有幾個點。\n' +
        '步驟 3：換不同的數再試一次：紅點和藍點排在一起的樣子，會不會變？為什麼？把理由寫在右邊面板。', NOTE_X, 200, 300, 150);
    tool(draw.define, '依滑桿蓋出點陣圖：每一排先蓋紅點、再接著蓋藍點，一共蓋『排數』排。', 80);
    tool(count.define, '先問一排有幾個點、有幾排，答對才往下；最後先請你預測全部，再說出全部有幾個點。', 90);
    return p;
};

const BUILDERS = {EX: buildEX, CG: buildCG, VA: buildVA, GE: buildGE, JU: buildJU};
module.exports = {BUILDERS};

if (require.main === module) {
    runCli(unit, BUILDERS, AGENT).catch(error => {
        console.error(error);
        process.exit(1);
    });
}
