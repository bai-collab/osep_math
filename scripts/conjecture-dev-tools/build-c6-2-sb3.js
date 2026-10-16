// 產生單元 ⑥-2「連除的簡化性質」五個階段的半成品專案（.sb3）。
//
// 用法：node scripts/conjecture-dev-tools/build-c6-2-sb3.js
// 輸出：static/judge-content/conjecture/C6-2/C6-2-{EX,CG,VA,GE,JU}.sb3
//
// 設計：造例到一般化共用「連除機」：只照學生輸入的順序算 a÷b÷c（答案取到小數第 2 位），
// 不會自動列出各種改寫法；造例的綠旗那段最後少一塊「加入 (算式) 到 連除例子」。
// 證實用長方形：先切成幾條、每條再切幾段，程式請學生自己數一共幾小塊，再預測對調後會不會變，最後才說出。
const unit = require('../../src/lib/conjecture-units/c6-2.js');
const {num, txt, rep, createProject, blocks} = require('./sb3-kit.js');
const {NOTE_X, SPEAKER, BLANK, toolArea, runCli} = require('./sb3-units-common.js');

const AGENT = 'osep_math/build-c6-2-sb3';
const L = unit.LISTS;

const speakerSprite = p => {
    const s = p.sprite('連除機', {x: 200, y: -160});
    p.costume(s, '說話', SPEAKER, {cx: 2, cy: 2});
    return s;
};
const join = (b, parts) => parts.reduceRight((acc, part) => rep(b.join(part, acc), 'txt'));

const machineProject = ({flagNote, recordGap = false}) => {
    const p = createProject();
    p.costume(p.stage, '白板', BLANK, {cx: 240, cy: 180});
    p.list(L.examples);
    p.list(L.myConjecture);
    unit.VIRTUAL_GROUPS.forEach(group => p.list(L.groupData(group)));
    ['被除數', '第一個除數', '第二個除數', '答案', '算式'].forEach(name => p.variable(name, 0));
    const s = speakerSprite(p);
    const b = blocks(p, s);
    const tool = toolArea(s);
    const machine = b.procedure('連除機', null, {warp: false});
    const quotient = s.block('operator_round', {inputs: {NUM: rep(b.mul(rep(b.divide(rep(b.divide(
        rep(b.getVar('被除數')), rep(b.getVar('第一個除數')))), rep(b.getVar('第二個除數')))), num(100)))}});
    // 詢問時先藏起來，問題才會印在輸入框上方，不會被輸入框蓋住；說答案前再現身。
    s.stack([machine.define, b.costume('說話'),
        b.hide(),
        b.ask(txt('被除數是多少？')),
        b.setVar('被除數', rep(b.answer(), 'txt')),
        b.ask(txt('先除以多少？')),
        b.setVar('第一個除數', rep(b.answer(), 'txt')),
        b.ask(txt('再除以多少？')),
        b.setVar('第二個除數', rep(b.answer(), 'txt')),
        b.show(),
        b.setVar('答案', rep(b.divide(rep(quotient), num(100)))),
        b.setVar('算式', join(b, [rep(b.getVar('被除數'), 'txt'), txt('÷'), rep(b.getVar('第一個除數'), 'txt'), txt('÷'),
            rep(b.getVar('第二個除數'), 'txt'), txt('＝'), rep(b.getVar('答案'), 'txt')])),
        b.say(rep(b.getVar('算式'), 'txt'))]);
    // 造例的綠旗那段最後少一塊「加入 (算式) 到 連除例子」，學生自己補。
    const hat = s.stack([b.whenFlag(), machine.call()], 40, 40);
    s.comment(hat, flagNote, NOTE_X, 30, 280, 100);
    if (recordGap) {
        s.comment(null, `步驟 3 在這裡改：上面那段最後少了一塊！從「變數」分類拖一塊「加入 … 到 ${L.examples}」` +
            '貼緊接在「連除機」那塊下面（放開時會吸在一起；只放在旁邊沒接上不會記），把『算式』變數放進空格，再按綠旗算一次，就會記下來。', NOTE_X, 160, 300, 130);
    }
    tool(machine.define, '依序問被除數、先除以多少、再除以多少，照這個順序算出答案（取到小數第 2 位），把算式和答案放進變數『算式』。', 90);
    return p;
};

const buildEX = () => machineProject({recordGap: true,
    flagNote: '步驟 2：按綠旗使用連除機：依序輸入被除數和兩個除數，看看答案。換個順序再算一次。'});
const buildCG = () => machineProject({flagNote: '步驟 1：按綠旗用連除機再算幾題，看看你分好類的算式。'});
const buildVA = () => machineProject({flagNote: '步驟 1：看右邊「其他組帶來的資料」，按綠旗用連除機算算別組的題目。'});
const buildGE = () => machineProject({flagNote: '步驟 1（選做）：想再確認的話，按綠旗用連除機多算幾題。'});

// ---- 證實：長方形先切成幾條、每條再切幾段 ----
const RECT = {left: -60, right: 180, bottom: -90, top: 90};
const buildJU = () => {
    const p = createProject();
    p.costume(p.stage, '白板', BLANK, {cx: 240, cy: 180});
    p.list(L.examples);
    p.list(L.myConjecture);
    p.variable('條數', 3);
    p.variable('段數', 4);
    ['第幾條', '我的預測'].forEach(name => p.variable(name, 0));
    p.sliderMonitor('條數', {x: 5, y: 5, min: 2, max: 6});
    p.sliderMonitor('段數', {x: 5, y: 60, min: 2, max: 6});
    const s = p.sprite('刀子', {x: 0, y: 0});
    p.costume(s, '說話', SPEAKER, {cx: 2, cy: 2});
    const b = blocks(p, s);
    const tool = toolArea(s);
    const penDown = () => s.block('pen_penDown');
    const penUp = () => s.block('pen_penUp');
    const width = RECT.right - RECT.left;
    const height = RECT.top - RECT.bottom;
    const lineAcross = (countVar, isVertical) => [
        b.setVar('第幾條', num(0)),
        b.repeat(rep(b.add(rep(b.getVar(countVar)), num(1))), s.stack([
            ...(isVertical ? [
                b.gotoXY(rep(b.add(num(RECT.left), rep(b.mul(rep(b.getVar('第幾條')),
                    rep(b.divide(num(width), rep(b.getVar(countVar)))))))), num(RECT.bottom)),
                penDown(),
                b.gotoXY(rep(b.add(num(RECT.left), rep(b.mul(rep(b.getVar('第幾條')),
                    rep(b.divide(num(width), rep(b.getVar(countVar)))))))), num(RECT.top))
            ] : [
                b.gotoXY(num(RECT.left), rep(b.add(num(RECT.bottom), rep(b.mul(rep(b.getVar('第幾條')),
                    rep(b.divide(num(height), rep(b.getVar(countVar))))))))),
                penDown(),
                b.gotoXY(num(RECT.right), rep(b.add(num(RECT.bottom), rep(b.mul(rep(b.getVar('第幾條')),
                    rep(b.divide(num(height), rep(b.getVar(countVar)))))))))
            ]),
            penUp(),
            b.changeVar('第幾條', num(1))
        ]))
    ];
    const cut = b.procedure('切長方形');
    s.stack([cut.define, b.penClear(), penUp(), ...lineAcross('條數', true), ...lineAcross('段數', false),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(txt('先直著切成幾條，每一條再橫著切成幾段。'))]);
    const askUntil = (question, retry, correct) => [
        b.ask(question),
        b.repeatUntil(b.cmp('equals', rep(b.answer(), 'txt'), rep(correct())), s.stack([b.ask(txt(retry))]))
    ];
    const pieces = () => b.mul(rep(b.getVar('條數')), rep(b.getVar('段數')));
    const count = b.procedure('數一數', null, {warp: false});
    s.stack([count.define, b.costume('說話'),
        b.hide(),
        ...askUntil(txt('一共切成幾小塊？'), '再數一次：一條有幾段？有幾條？一共幾小塊？', pieces),
        b.show(),
        b.sayFor(txt('對！'), 1),
        b.hide(),
        b.ask(join(b, [txt('如果改成先切成 '), rep(b.getVar('段數'), 'txt'), txt(' 條，每條再切 '),
            rep(b.getVar('條數'), 'txt'), txt(' 段，你預測一共幾小塊？')])),
        b.setVar('我的預測', rep(b.answer(), 'txt')),
        b.show(),
        b.say(join(b, [txt('你預測 '), rep(b.getVar('我的預測'), 'txt'), txt('；換個切法，一共 '),
            rep(b.mul(rep(b.getVar('段數')), rep(b.getVar('條數'))), 'txt'), txt(' 小塊')]))]);
    const flag = s.stack([b.whenFlag(), cut.call()], 40, 40);
    s.comment(flag, '步驟 1：用舞台左上角的滑桿改「條數」和「段數」，按綠旗把長方形切出來。', NOTE_X, 30, 280, 80);
    const key = s.stack([b.whenKey('space'), count.call()], 40, 200);
    s.comment(key, '步驟 2：按空白鍵：自己數一共切成幾小塊，再預測換個切法會不會變。\n' +
        '步驟 3：把兩個數對調再切一次：小塊的數量會不會變？為什麼？把理由寫在右邊面板。', NOTE_X, 200, 300, 150);
    tool(cut.define, '依滑桿先直著畫出『條數』條、再橫著畫出『段數』段的切線。', 80);
    tool(count.define, '先問一共切成幾小塊，答對才往下；再請你預測換個切法會有幾小塊，最後才說出來。', 90);
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
