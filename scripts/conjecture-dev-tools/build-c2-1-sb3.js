// 產生單元 ②-1「百數表倍數的個位規律」五個階段的半成品專案（.sb3）。
//
// 用法：node scripts/conjecture-dev-tools/build-c2-1-sb3.js
// 輸出：static/judge-content/conjecture/C2-1/C2-1-{EX,CG,VA,GE,JU}.sb3（路徑與單元定義的 sb3Path 一致）
//
// 設計原則（計畫書第 15 節）：
// - 學生會迴圈、不會清單：清單積木都已放好示範，學生只改 1～3 塊；需要補的地方附註解。
// - 清單一律建在舞台，名稱取自單元定義 LISTS，面板載入後會把前階段作品寫進去。
// - 程式只產生證據（倍數、驗算、反例掃描、位值表徵），不判斷猜想真假，也不說出結論。
const fs = require('fs');
const path = require('path');
const JSZip = require('@turbowarp/jszip');
const unit = require('../../src/lib/conjecture-units/c2-1.js');
const {num, txt, rep, bool, createProject, blocks} = require('./sb3-kit.js');

const OUT_DIR = path.join(__dirname, '../../static/judge-content');
const AGENT = 'osep_math/build-c2-1-sb3';
const [CARD_A, CARD_B] = unit.STUDENT_CARDS;
const L = unit.LISTS;

// ---- 造型與背景 ----
const hundredChart = () => {
    const cells = [];
    for (let n = 1; n <= 100; n++) {
        const col = (n - 1) % 10;
        const row = Math.floor((n - 1) / 10);
        cells.push(`<rect x="${col * 48}" y="${row * 36}" width="48" height="36" fill="#ffffff" stroke="#b8c4d6"/>` +
            `<text x="${(col * 48) + 24}" y="${(row * 36) + 24}" text-anchor="middle" font-family="Sans Serif" ` +
            `font-size="15" fill="#33415c">${n}</text>`);
    }
    const head = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">';
    return `${head}${cells.join('')}</svg>`;
};
const MARK_A = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32" viewBox="0 0 40 32">' +
    '<rect x="2" y="2" width="36" height="28" rx="8" fill="#ff9f1c" fill-opacity="0.45"/></svg>';
const MARK_B = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32" viewBox="0 0 40 32">' +
    '<rect x="3" y="3" width="34" height="26" rx="8" fill="none" stroke="#2457a7" stroke-width="4"/></svg>';
const TEN_BAR = (() => {
    const squares = Array.from({length: 10}, (_, i) =>
        `<rect x="1" y="${1 + (i * 13)}" width="16" height="12" fill="#7cc4ff" stroke="#2457a7"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="132" viewBox="0 0 18 132">${squares}</svg>`;
})();
const ONE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="14" viewBox="0 0 18 14">' +
    '<rect x="1" y="1" width="16" height="12" fill="#ffd166" stroke="#9a6700"/></svg>';
// 透明的小點：角色停在角落說話時不會多畫出一個方塊。
const SPEAKER = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4">' +
    '<rect width="4" height="4" fill="#ffffff" fill-opacity="0"/></svg>';
// 版面：腳本在左欄、註解在右欄（工作區座標），避免互相蓋住。
const NOTE_X = 820;
const MARK_Y = 1500;
const PLACE_VALUE_BACKDROP = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
    '<rect width="480" height="360" fill="#f7f9fc"/>' +
    '<text x="300" y="70" text-anchor="middle" font-family="Sans Serif" font-size="18" fill="#2457a7">' +
    '十包（每包 10 個）</text>' +
    '<text x="300" y="275" text-anchor="middle" font-family="Sans Serif" font-size="18" fill="#9a6700">零散</text>' +
    '<line x1="170" y1="250" x2="470" y2="250" stroke="#cfd8e3" stroke-dasharray="6 4"/></svg>';

// ---- 共用片段 ----
const baseProject = ({chart = true} = {}) => {
    const p = createProject();
    if (chart) p.costume(p.stage, '百數表', hundredChart(), {cx: 240, cy: 180});
    else p.costume(p.stage, '位值', PLACE_VALUE_BACKDROP, {cx: 240, cy: 180});
    return p;
};
const addCardLists = p => {
    for (const card of unit.STUDENT_CARDS) {
        p.list(L.multiples(card));
        p.list(L.ones(card));
    }
};
const markerSprite = p => {
    const s = p.sprite('記號筆', {x: 216, y: -162});
    p.costume(s, `${CARD_A}卡`, MARK_A, {cx: 20, cy: 16});
    p.costume(s, `${CARD_B}卡`, MARK_B, {cx: 20, cy: 16});
    return s;
};
// 自訂積木「標記 (數)」：在百數表上把這個數圈起來（1～100 以外不畫）。
const defineMark = (p, s, b) => {
    const proc = b.procedure('標記', '數');
    const cellX = b.add(num(-216), rep(b.mul(rep(b.mod(rep(b.subtract(rep(proc.arg()), num(1))), num(10))), num(48))));
    const cellY = b.subtract(num(162), rep(b.mul(rep(b.floor(rep(b.divide(rep(b.subtract(rep(proc.arg()), num(1))),
        num(10))))), num(36))));
    const inRange = s.block('operator_and', {inputs: {
        OPERAND1: bool(b.cmp('gt', rep(proc.arg()), num(0))),
        OPERAND2: bool(b.cmp('lt', rep(proc.arg()), num(101)))}});
    const body = s.stack([b.gotoXY(rep(cellX), rep(cellY)), b.stamp()]);
    s.stack([proc.define, b.if(inRange, body)], 40, MARK_Y);
    s.comment(proc.define, '「標記」會把一個數在百數表上圈起來。這段不用改。', 40, MARK_Y - 110, 260, 80);
    return proc;
};
// 依序標記某張卡的清單內容（前階段帶進來的例子）。
const markList = (p, s, b, proc, list, costume) => [
    b.costume(costume),
    b.setVar('第幾個', num(0)),
    b.repeat(rep(b.lengthOf(list)), s.stack([
        b.changeVar('第幾個', num(1)),
        proc.call(rep(b.itemOf(list, rep(b.getVar('第幾個')))))
    ]))
];
const divisionMachine = (p, s, b, x, y) => {
    const expr = b.join(rep(b.getVar('被除數'), 'txt'), rep(b.join(txt(' ÷ '), rep(b.join(rep(b.getVar('除以'), 'txt'),
        rep(b.join(txt(' ＝ '), rep(b.join(rep(b.floor(rep(b.divide(rep(b.getVar('被除數')), rep(b.getVar('除以'))))), 'txt'),
            rep(b.join(txt(' … '), rep(b.mod(rep(b.getVar('被除數')), rep(b.getVar('除以'))), 'txt')), 'txt')), 'txt')),
        'txt')), 'txt')), 'txt'));
    const hat = s.stack([
        b.whenKey('space'),
        b.ask(txt('要驗算哪個數？')),
        b.setVar('被除數', rep(b.answer(), 'txt')),
        b.ask(txt('要除以多少？')),
        b.setVar('除以', rep(b.answer(), 'txt')),
        b.say(rep(expr, 'txt'))
    ], x, y);
    s.comment(hat, '驗算機：按空白鍵。先在右邊面板寫下你的「預測」，再用驗算機算，最後把算式抄到面板上。',
        NOTE_X, y, 280, 100);
};

// ---- 五個階段 ----
const buildEX = () => {
    const p = baseProject();
    addCardLists(p);
    ['卡片', '第幾個', '數'].forEach(name => p.variable(name, 0));
    const s = markerSprite(p);
    const b = blocks(p, s);
    const proc = defineMark(p, s, b);
    // 卡片 2：完整示範（迴圈次數留給學生改）。
    const loopA = b.repeat(num(3), s.stack([
        b.changeVar('第幾個', num(1)),
        b.setVar('數', rep(b.mul(rep(b.getVar('卡片')), rep(b.getVar('第幾個'))))),
        b.addTo(L.multiples(CARD_A), rep(b.getVar('數'), 'txt')),
        b.addTo(L.ones(CARD_A), rep(b.mod(rep(b.getVar('數')), num(10)), 'txt')),
        proc.call(rep(b.getVar('數')))
    ]));
    const hatA = s.stack([b.whenFlag(), b.penClear(), b.clearList(L.multiples(CARD_A)), b.clearList(L.ones(CARD_A)),
        b.setVar('卡片', num(CARD_A)), b.setVar('第幾個', num(0)), b.costume(`${CARD_A}卡`), loopA], 40, 40);
    s.comment(hatA, `卡片 ${CARD_A}：按綠旗執行。\n先在右邊面板「自己寫」至少 3 個 ${CARD_A} 的倍數，再回來改程式。`, NOTE_X, 30, 260, 90);
    s.comment(loopA, '① 在這裡改：重複 3 次只會找到 3 個倍數。改成更多次，看看百數表上出現了哪些數。\n' +
        '「加入 … 到 清單」會在清單最後多寫一列，就像在表格多記一筆。', NOTE_X, 330, 280, 130);
    // 卡片 10：少一塊（個位沒有記進清單），迴圈次數也要改。
    const loopB = b.repeat(num(1), s.stack([
        b.changeVar('第幾個', num(1)),
        b.setVar('數', rep(b.mul(rep(b.getVar('卡片')), rep(b.getVar('第幾個'))))),
        b.addTo(L.multiples(CARD_B), rep(b.getVar('數'), 'txt')),
        proc.call(rep(b.getVar('數')))
    ]));
    const hatB = s.stack([b.whenKey('space'), b.clearList(L.multiples(CARD_B)), b.clearList(L.ones(CARD_B)),
        b.setVar('卡片', num(CARD_B)), b.setVar('第幾個', num(0)), b.costume(`${CARD_B}卡`), loopB], 40, 820);
    s.comment(hatB, `卡片 ${CARD_B}：按空白鍵執行。`, NOTE_X, 810, 220, 60);
    s.comment(loopB, `② 在這裡改：這段少了一塊！${CARD_A} 那段有把「個位」加進清單，這段沒有。\n` +
        `從「變數」分類拖一塊「加入 … 到 ${L.ones(CARD_B)}」放進迴圈。迴圈次數也記得改。`, NOTE_X, 1100, 300, 130);
    return p;
};

const buildCG = () => {
    const p = baseProject();
    addCardLists(p);
    ['第幾個', '數'].forEach(name => p.variable(name, 0));
    const s = markerSprite(p);
    const b = blocks(p, s);
    const proc = defineMark(p, s, b);
    const hat = s.stack([b.whenFlag(), b.penClear(),
        ...markList(p, s, b, proc, L.multiples(CARD_A), `${CARD_A}卡`),
        ...markList(p, s, b, proc, L.multiples(CARD_B), `${CARD_B}卡`)], 40, 40);
    s.comment(hat, '按綠旗：把你在「造例」做出的例子畫回百數表。清單裡的資料是從上一階段自動帶進來的。',
        NOTE_X, 30, 260, 90);
    // 選做：猜想條件區（右邊空格留給學生）。
    const condition = b.cmp('equals', rep(b.mod(rep(b.getVar('數')), num(10))), txt(''));
    const check = b.ifElse(condition,
        s.stack([b.say(rep(b.join(rep(b.getVar('數'), 'txt'), txt(' 符合我的猜想條件')), 'txt'))]),
        s.stack([b.say(rep(b.join(rep(b.getVar('數'), 'txt'), txt(' 不符合我的猜想條件')), 'txt'))]));
    s.stack([b.whenKey('space'), b.ask(txt('輸入一個數，看看它符不符合你的猜想條件')),
        b.setVar('數', rep(b.answer(), 'txt')), check], 40, 720);
    s.comment(check, '（選做）猜想條件區：把「＝」右邊的空格改成你猜想裡的條件。\n' +
        '條件不只一個時，可以用「運算」分類的「或」把它們接起來。改好後按空白鍵試試。', NOTE_X, 820, 280, 130);
    return p;
};

const buildVA = () => {
    const p = baseProject();
    addCardLists(p);
    p.list(L.myConjecture);
    unit.VIRTUAL_GROUPS.forEach(group => p.list(L.groupData(group)));
    p.list(L.counterexamples);
    p.variable('第幾個', 0);
    p.variable('數', 0);
    p.variable('被除數', 0);
    p.variable('除以', 1);
    p.variable('除數', 1);
    p.variable('個位條件', 0);
    const s = markerSprite(p);
    const b = blocks(p, s);
    const proc = defineMark(p, s, b);
    const hat = s.stack([b.whenFlag(), b.penClear(),
        ...markList(p, s, b, proc, L.multiples(CARD_A), `${CARD_A}卡`),
        ...markList(p, s, b, proc, L.multiples(CARD_B), `${CARD_B}卡`),
        b.sayFor(txt('按空白鍵用驗算機；按 s 鍵執行反例獵人（輔助）。'), 4)], 40, 40);
    s.comment(hat, '其他組的資料在舞台的清單裡（小明組、小華組、小英組）。挑一個數來檢驗猜想。', NOTE_X, 30, 260, 80);
    divisionMachine(p, s, b, 40, 760);
    // 反例獵人（輔助）：只掃 1～100、只看一個個位數字。
    const hit = s.block('operator_and', {inputs: {
        OPERAND1: bool(b.cmp('equals', rep(b.mod(rep(b.getVar('數')), num(10))), rep(b.getVar('個位條件')))),
        OPERAND2: bool(s.block('operator_not', {inputs: {OPERAND: bool(b.cmp('equals',
            rep(b.mod(rep(b.getVar('數')), rep(b.getVar('除數')))), num(0)))}}))}});
    const hunter = s.stack([b.whenKey('s'), b.clearList(L.counterexamples), b.setVar('數', num(0)),
        b.repeat(num(100), s.stack([b.changeVar('數', num(1)),
            b.if(hit, s.stack([b.addTo(L.counterexamples, rep(b.getVar('數'), 'txt'))]))])),
        b.say(rep(b.join(txt('反例獵人找到 '), rep(b.join(rep(b.lengthOf(L.counterexamples), 'txt'), txt(' 個數')), 'txt')),
            'txt'))], 40, 1100);
    s.comment(hunter, '（輔助）反例獵人：在「變數」設定『個位條件』和『除數』，再按 s 鍵。\n' +
        '它只找 1～100，找到的數一定要自己用驗算機再算一次，寫進面板才算數。', NOTE_X, 1100, 300, 130);
    return p;
};

const buildGE = () => {
    const p = baseProject();
    addCardLists(p);
    p.list(L.myConjecture);
    ['第幾個', '被除數'].forEach(name => p.variable(name, 0));
    p.variable('除以', 1);
    const s = markerSprite(p);
    const b = blocks(p, s);
    const proc = defineMark(p, s, b);
    const hat = s.stack([b.whenFlag(), b.penClear(),
        ...markList(p, s, b, proc, L.multiples(CARD_A), `${CARD_A}卡`),
        ...markList(p, s, b, proc, L.multiples(CARD_B), `${CARD_B}卡`)], 40, 40);
    s.comment(hat, '修訂猜想時，可以再用驗算機（空白鍵）多檢查幾個數。檢驗過的除數才能寫進修訂的說法。',
        NOTE_X, 30, 260, 90);
    divisionMachine(p, s, b, 40, 760);
    return p;
};

const buildJU = () => {
    const p = baseProject({chart: false});
    addCardLists(p);
    p.list(L.myConjecture);
    p.variable('包數', 3);
    p.variable('零散', 4);
    p.variable('除數', CARD_A);
    p.variable('第幾個', 0);
    p.variable('我的預測', 0);
    p.sliderMonitor('包數', {x: 5, y: 5, min: 0, max: 9});
    p.sliderMonitor('零散', {x: 5, y: 60, min: 0, max: 9});
    p.sliderMonitor('除數', {x: 5, y: 115, min: 2, max: 10});
    const s = p.sprite('積木', {x: 0, y: 0});
    p.costume(s, '十包', TEN_BAR, {cx: 9, cy: 66});
    p.costume(s, '一個', ONE, {cx: 9, cy: 7});
    p.costume(s, '說話', SPEAKER, {cx: 2, cy: 2});
    const b = blocks(p, s);
    const total = () => b.add(rep(b.mul(rep(b.getVar('包數')), num(10))), rep(b.getVar('零散')));
    const draw = s.stack([b.whenFlag(), b.penClear(), b.costume('十包'), b.setVar('第幾個', num(0)),
        b.repeat(rep(b.getVar('包數')), s.stack([
            b.gotoXY(rep(b.add(num(-40), rep(b.mul(rep(b.getVar('第幾個')), num(24))))), num(20)),
            b.stamp(), b.changeVar('第幾個', num(1))])),
        b.costume('一個'), b.setVar('第幾個', num(0)),
        b.repeat(rep(b.getVar('零散')), s.stack([
            b.gotoXY(rep(b.add(num(-40), rep(b.mul(rep(b.getVar('第幾個')), num(22))))), num(-120)),
            b.stamp(), b.changeVar('第幾個', num(1))])),
        b.gotoXY(num(200), num(-160)), b.costume('說話'),
        b.say(rep(b.join(txt('這個數是 '), rep(total(), 'txt')), 'txt'))], 40, 40);
    s.comment(draw, '用舞台左上角的滑桿改「包數」和「零散」，再按綠旗把數畫出來。', NOTE_X, 30, 260, 80);
    // 空白鍵：讓學生自己算「每一包剩多少」「零散剩多少」，算對才往下；
    // 最後先請學生預測整個數剩多少，才揭曉。程式不替學生說出每包的餘數。
    const divisorText = () => rep(b.getVar('除數'), 'txt');
    const askUntil = (firstQuestion, retryQuestion, correct) => [
        b.ask(firstQuestion),
        b.repeatUntil(b.cmp('equals', rep(b.answer(), 'txt'), rep(correct())), s.stack([b.ask(retryQuestion)]))
    ];
    const perBag = askUntil(
        rep(b.join(txt('每一包 10 個平分成 '), rep(b.join(divisorText(), txt(' 份，會剩下幾個？')), 'txt')), 'txt'),
        rep(b.join(txt('再算算看：10 ÷ '), rep(b.join(divisorText(), txt(' ＝ ？… ？ 剩下幾個？')), 'txt')), 'txt'),
        () => b.mod(num(10), rep(b.getVar('除數'))));
    const loose = askUntil(
        rep(b.join(txt('零散的 '), rep(b.join(rep(b.getVar('零散'), 'txt'), rep(b.join(txt(' 個平分成 '),
            rep(b.join(divisorText(), txt(' 份，會剩下幾個？')), 'txt')), 'txt')), 'txt')), 'txt'),
        rep(b.join(txt('再算算看：零散的數 ÷ '), rep(b.join(divisorText(), txt(' 剩下幾個？')), 'txt')), 'txt'),
        () => b.mod(rep(b.getVar('零散')), rep(b.getVar('除數'))));
    const split = s.stack([b.whenKey('space'), b.costume('說話'),
        ...perBag,
        b.sayFor(rep(b.join(txt('對！每一包都剩下 '), rep(b.answer(), 'txt')), 'txt'), 2),
        ...loose,
        b.sayFor(rep(b.join(txt('對！零散的剩下 '), rep(b.answer(), 'txt')), 'txt'), 2),
        b.ask(txt('那整個數平分後，你預測會剩下幾個？')),
        b.setVar('我的預測', rep(b.answer(), 'txt')),
        b.say(rep(b.join(txt('你預測 '), rep(b.join(rep(b.getVar('我的預測'), 'txt'),
            rep(b.join(txt('；整個數平分後剩下 '), rep(b.mod(rep(total()), rep(b.getVar('除數'))), 'txt')), 'txt')),
        'txt')), 'txt'))], 40, 1150);
    s.comment(split, '按空白鍵：自己算每一包剩多少、零散剩多少，算對才會往下。\n' +
        '最後先預測整個數剩多少再看答案。改改包數再試一次：剩下的會不會變？為什麼？把理由寫在右邊面板。',
    NOTE_X, 1150, 300, 130);
    return p;
};

const BUILDERS = {EX: buildEX, CG: buildCG, VA: buildVA, GE: buildGE, JU: buildJU};

const writeSb3 = async stage => {
    const p = BUILDERS[stage]();
    const projectJson = p.toJSON(AGENT);
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(projectJson));
    for (const [name, svg] of [...p.assets.entries()].sort()) zip.file(name, svg);
    // 固定日期，讓同樣輸入每次產生相同位元組（方便比對雜湊）。
    const date = new Date('2026-10-14T00:00:00Z');
    Object.values(zip.files).forEach(file => {
        file.date = date;
    });
    const buffer = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    const spec = unit.STAGES.find(s => s.stage === stage);
    const out = path.join(OUT_DIR, spec.sb3Path);
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, buffer);
    return {stage, out, size: buffer.length, projectJson};
};

module.exports = {BUILDERS, writeSb3};

if (require.main === module) {
    (async () => {
        for (const stage of Object.keys(BUILDERS)) {
            const {out, size} = await writeSb3(stage);
            console.log(`[OK] ${stage} -> ${path.relative(process.cwd(), out)}（${size} bytes）`);
        }
    })().catch(error => {
        console.error(error);
        process.exit(1);
    });
}
