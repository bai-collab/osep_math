// 產生單元 ④-1「公倍數與最小公倍數的關係」五個階段的半成品專案（.sb3）。
//
// 用法：node scripts/conjecture-dev-tools/build-c4-1-sb3.js
// 輸出：static/judge-content/conjecture/C4-1/C4-1-{EX,CG,VA,GE,JU}.sb3
//
// 設計：造例比照 ②-1（卡片 4 完整示範、卡片 5 少一塊「加入清單」）；證實用數線上兩隻青蛙的落點，
// 程式先請學生自己找第一次一起落地的位置、再預測下一次，最後才在數線上圈出一起落地的地方。
const unit = require('../../src/lib/conjecture-units/c4-1.js');
const {num, txt, rep, bool, createProject, blocks} = require('./sb3-kit.js');
const {NOTE_X, TOOL_Y, hundredChart, MARK_A, MARK_B, SPEAKER, toolArea, defineMark, MARK_NOTE, defineRedraw,
    defineDivisionMachine, MACHINE_NOTE, runCli} = require('./sb3-units-common.js');

const AGENT = 'osep_math/build-c4-1-sb3';
const [CARD_A, CARD_B] = unit.STUDENT_CARDS;
const L = unit.LISTS;

const chartProject = () => {
    const p = createProject();
    p.costume(p.stage, '百數表', hundredChart(), {cx: 240, cy: 180});
    for (const card of unit.STUDENT_CARDS) p.list(L.multiples(card));
    return p;
};
const markerSprite = p => {
    const s = p.sprite('記號筆', {x: 216, y: -162});
    p.costume(s, `${CARD_A}卡`, MARK_A, {cx: 20, cy: 16});
    p.costume(s, `${CARD_B}卡`, MARK_B, {cx: 20, cy: 16});
    return s;
};
const redrawCards = unit.STUDENT_CARDS.map(card => ({list: L.multiples(card), costume: `${card}卡`}));
const REDRAW_NOTE = `依序圈出清單「${L.multiples(CARD_A)}」「${L.multiples(CARD_B)}」裡的數。`;

const buildEX = () => {
    const p = chartProject();
    ['卡片', '第幾個', '數'].forEach(name => p.variable(name, 0));
    const s = markerSprite(p);
    const b = blocks(p, s);
    const tool = toolArea(s, TOOL_Y, '工具區：下面的積木已經做好，不用改。\n上面的程式會用到「準備卡片」和「標記」。');
    const prep = card => {
        const proc = b.procedure(`準備卡片 ${card}`);
        s.stack([proc.define, ...(card === CARD_A ? [b.penClear()] : []), b.clearList(L.multiples(card)),
            b.setVar('卡片', num(card)), b.setVar('第幾個', num(0)), b.costume(`${card}卡`)]);
        tool(proc.define, card === CARD_A ? `清空百數表和清單「${L.multiples(card)}」，從第 0 個開始。` :
            `清空清單「${L.multiples(card)}」，從第 0 個開始（百數表上 ${CARD_A} 的記號會留著）。`);
        return proc;
    };
    const prepA = prep(CARD_A);
    const prepB = prep(CARD_B);
    const mark = defineMark(p, s, b);
    tool(mark.define, MARK_NOTE);
    const loopA = b.repeat(num(3), s.stack([
        b.changeVar('第幾個', num(1)),
        b.setVar('數', rep(b.mul(rep(b.getVar('卡片')), rep(b.getVar('第幾個'))))),
        b.addTo(L.multiples(CARD_A), rep(b.getVar('數'), 'txt')),
        mark.call(rep(b.getVar('數')))
    ]));
    const hatA = s.stack([b.whenFlag(), prepA.call(), loopA], 40, 40);
    s.comment(hatA, `卡片 ${CARD_A}：按綠旗執行。\n步驟 1 先在右邊面板「自己寫」2 個 ${CARD_A} 的倍數，再回來做步驟 2。`,
        NOTE_X, 30, 280, 90);
    s.comment(loopA, '步驟 2 在這裡改：重複 3 次只會找到 3 個倍數。改成更多次，再按綠旗，看看百數表上圈出了哪些數。',
        NOTE_X, 150, 280, 110);
    // 卡片 5：少一塊（沒有把數加進清單），迴圈次數也要改。
    const loopB = b.repeat(num(1), s.stack([
        b.changeVar('第幾個', num(1)),
        b.setVar('數', rep(b.mul(rep(b.getVar('卡片')), rep(b.getVar('第幾個'))))),
        mark.call(rep(b.getVar('數')))
    ]));
    const hatB = s.stack([b.whenKey('space'), prepB.call(), loopB], 40, 460);
    s.comment(hatB, `卡片 ${CARD_B}：按空白鍵執行（步驟 5）。`, NOTE_X, 450, 260, 60);
    s.comment(loopB, `步驟 5 在這裡改：這段少了一塊！${CARD_A} 那段有把數加進清單，這段沒有。\n` +
        `從「變數」分類拖一塊「加入 … 到 ${L.multiples(CARD_B)}」放進迴圈，把『數』放進空格。迴圈次數也記得改，再按空白鍵。`,
    NOTE_X, 530, 300, 150);
    return p;
};

const redrawStage = ({sayHint, flagNote, machineNote, extraLists = []}) => {
    const p = chartProject();
    extraLists.forEach(name => p.list(name));
    ['第幾個', '被除數'].forEach(name => p.variable(name, 0));
    p.variable('除以', 1);
    const s = markerSprite(p);
    const b = blocks(p, s);
    const tool = toolArea(s);
    const mark = defineMark(p, s, b);
    const redraw = defineRedraw(p, s, b, mark, redrawCards);
    const hat = s.stack([b.whenFlag(), redraw.call(), ...(sayHint ? [b.sayFor(txt(sayHint), 4)] : [])], 40, 40);
    s.comment(hat, flagNote, NOTE_X, 30, 280, 90);
    tool(redraw.define, REDRAW_NOTE);
    if (machineNote) {
        const machine = defineDivisionMachine(p, s, b);
        const key = s.stack([b.whenKey('space'), machine.call()], 40, 260);
        s.comment(key, machineNote, NOTE_X, 260, 280, 110);
        tool(machine.define, MACHINE_NOTE);
    }
    tool(mark.define, MARK_NOTE);
    return p;
};

const buildCG = () => redrawStage({
    flagNote: '步驟 1：按綠旗，把你在「造例」做出的例子畫回百數表，再看一次「兩個都是」的數。清單裡的資料是從上一階段自動帶進來的。'});
const buildVA = () => redrawStage({sayHint: '按空白鍵可以用驗算機。',
    flagNote: '步驟 1：按綠旗把你的例子畫回百數表。其他組的資料在右邊面板和舞台的清單裡（小明組、小華組、小英組）。',
    machineNote: '按空白鍵用驗算機：先在右邊面板寫下你的「預測」，再用驗算機算，最後把算式抄到面板上。',
    extraLists: [L.myConjecture, ...unit.VIRTUAL_GROUPS.map(L.groupData)]});
const buildGE = () => redrawStage({flagNote: '按綠旗可以把例子畫回百數表，方便對照。',
    machineNote: '步驟 1（選做）：按空白鍵用驗算機多檢查幾個數。',
    extraLists: [L.myConjecture]});

// ---- 證實：數線上的兩隻青蛙 ----
const LINE_MAX = 80;
const STEP_X = 5.5;
const lineX = n => -220 + (n * STEP_X);
const svgText = (x, y, anchor, size, color, text) => `<text x="${x}" y="${y}" text-anchor="${anchor}" ` +
    `font-family="Sans Serif" font-size="${size}" fill="${color}">${text}</text>`;
const numberLine = () => {
    const ticks = [];
    for (let n = 0; n <= LINE_MAX; n++) {
        const x = 240 + lineX(n);
        const big = n % 10 === 0;
        ticks.push(`<line x1="${x}" y1="${big ? 170 : 175}" x2="${x}" y2="${big ? 190 : 185}" ` +
            'stroke="#7a869a" stroke-width="1"/>');
        if (big) ticks.push(svgText(x, 208, 'middle', 12, '#33415c', n));
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
        '<rect width="480" height="360" fill="#f7f9fc"/>' +
        `<line x1="20" y1="180" x2="460" y2="180" stroke="#33415c" stroke-width="2"/>${ticks.join('')}` +
        `${svgText(460, 120, 'end', 13, '#9a6700', '青蛙 A 的落點')}` +
        `${svgText(460, 250, 'end', 13, '#2457a7', '青蛙 B 的落點')}</svg>`;
};
const DOT_A = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">' +
    '<circle cx="5" cy="5" r="4" fill="#ff9f1c"/></svg>';
const DOT_B = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">' +
    '<circle cx="5" cy="5" r="3.5" fill="none" stroke="#2457a7" stroke-width="2"/></svg>';
const TOGETHER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="6.5" fill="none" stroke="#1a7f37" stroke-width="3"/></svg>';

const buildJU = () => {
    const p = createProject();
    p.costume(p.stage, '數線', numberLine(), {cx: 240, cy: 180});
    // 前階段的例子會注入這兩個清單（舞台的清單監視器看得到），證實時可以回頭對照。
    for (const card of unit.STUDENT_CARDS) p.list(L.multiples(card));
    p.list(L.myConjecture);
    p.variable('跳A', CARD_A);
    p.variable('跳B', CARD_B);
    ['位置', '第一次', '我的預測'].forEach(name => p.variable(name, 0));
    p.sliderMonitor('跳A', {x: 5, y: 5, min: 2, max: 6});
    p.sliderMonitor('跳B', {x: 5, y: 60, min: 2, max: 6});
    const s = p.sprite('青蛙', {x: 0, y: 0});
    p.costume(s, 'A', DOT_A, {cx: 5, cy: 5});
    p.costume(s, 'B', DOT_B, {cx: 5, cy: 5});
    p.costume(s, '一起', TOGETHER, {cx: 8, cy: 8});
    p.costume(s, '說話', SPEAKER, {cx: 2, cy: 2});
    const b = blocks(p, s);
    const tool = toolArea(s);
    const x = () => rep(b.add(num(-220), rep(b.mul(rep(b.getVar('位置')), num(STEP_X)))));
    const jumpRow = (name, y) => [
        b.costume(name),
        b.setVar('位置', num(0)),
        b.repeatUntil(b.cmp('gt', rep(b.add(rep(b.getVar('位置')), rep(b.getVar(`跳${name}`)))), num(LINE_MAX)), s.stack([
            b.changeVar('位置', rep(b.getVar(`跳${name}`))),
            b.gotoXY(x(), num(y)),
            b.stamp()
        ]))
    ];
    const drawProc = b.procedure('畫出落點');
    s.stack([drawProc.define, b.penClear(), ...jumpRow('A', 40), ...jumpRow('B', -40),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(txt('上面是青蛙 A 的落點，下面是青蛙 B 的落點。'))]);
    const both = () => s.block('operator_and', {inputs: {
        OPERAND1: bool(b.cmp('equals', rep(b.mod(rep(b.getVar('位置')), rep(b.getVar('跳A')))), num(0))),
        OPERAND2: bool(b.cmp('equals', rep(b.mod(rep(b.getVar('位置')), rep(b.getVar('跳B')))), num(0)))}});
    // 一起落地了嗎：學生先找第一次一起落地的位置（答對才往下），再預測下一次，最後才在數線上圈出來。
    const togetherProc = b.procedure('一起落地了嗎', null, {warp: false});
    s.stack([togetherProc.define, b.costume('說話'),
        b.setVar('位置', num(1)),
        b.repeatUntil(both(), s.stack([b.changeVar('位置', num(1))])),
        b.setVar('第一次', rep(b.getVar('位置'))),
        // 詢問時先藏起來，問題才會印在輸入框上方；說話或蓋章前再現身。
        b.hide(),
        b.ask(txt('兩隻青蛙第一次一起落地，在哪個數？')),
        b.repeatUntil(b.cmp('equals', rep(b.answer(), 'txt'), rep(b.getVar('第一次'))),
            s.stack([b.ask(txt('再看看數線：上下兩排都有記號的地方，最小的是哪個數？'))])),
        b.show(),
        b.sayFor(txt('對！'), 1),
        b.hide(),
        b.ask(txt('那下一次一起落地，你預測在哪個數？中間會不會還有別的地方？')),
        b.setVar('我的預測', rep(b.answer(), 'txt')),
        b.show(),
        b.costume('一起'),
        b.setVar('位置', num(0)),
        b.repeat(num(LINE_MAX), s.stack([
            b.changeVar('位置', num(1)),
            b.if(both(), s.stack([b.gotoXY(x(), num(0)), b.stamp()]))
        ])),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(rep(b.join(txt('你預測 '), rep(b.join(rep(b.getVar('我的預測'), 'txt'),
            txt('。數線上的綠圈是兩隻一起落地的地方，看看和你想的一樣嗎？')), 'txt')), 'txt'))]);
    const draw = s.stack([b.whenFlag(), drawProc.call()], 40, 40);
    s.comment(draw, '步驟 1：用舞台左上角的滑桿改兩隻青蛙每次跳的格數，再按綠旗看牠們在數線上的落點。', NOTE_X, 30, 280, 80);
    const ask = s.stack([b.whenKey('space'), togetherProc.call()], 40, 200);
    s.comment(ask, '步驟 2：按空白鍵：先找出第一次一起落地的位置，再預測下一次一起落地在哪裡。\n' +
        '步驟 3：換一組跳的格數再試一次：第一次一起落地以後，中間會不會還有別的一起落地的地方？為什麼？把理由寫在右邊面板。',
    NOTE_X, 200, 300, 150);
    tool(drawProc.define, '依兩個滑桿的格數，在數線上方蓋出青蛙 A 的落點、下方蓋出青蛙 B 的落點（到 80 為止）。');
    tool(togetherProc.define, '先請你找第一次一起落地的位置，答對才往下；再請你預測下一次，最後才在數線上用綠圈標出一起落地的地方。', 90);
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
