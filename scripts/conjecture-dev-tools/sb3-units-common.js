// 第二批單元（④-1、⑥-1、⑥-2）半成品專案共用的片段與輸出。
//
// ②-1 的產生器（build-c2-1-sb3.js）維持原樣；這裡是同樣做法的共用版：
// - 主要程式只留學生要看、要改的積木；固定動作收成自訂積木放到下方工具區，依實際高度由上往下排。
// - 程式只產生證據（例子、驗算、表徵），不判斷猜想真假，也不說出結論。
const fs = require('fs');
const path = require('path');
const JSZip = require('@turbowarp/jszip');
const {num, txt, rep, bool} = require('./sb3-kit.js');

const OUT_DIR = path.join(__dirname, '../../static/judge-content');
// 版面：腳本在左欄、步驟註解在右欄（工作區座標）。
const NOTE_X = 820;
const TOOL_Y = 900;
const TOOL_GAP = 70;

const hundredChart = () => {
    const cells = [];
    for (let n = 1; n <= 100; n++) {
        const col = (n - 1) % 10;
        const row = Math.floor((n - 1) / 10);
        cells.push(`<rect x="${col * 48}" y="${row * 36}" width="48" height="36" fill="#ffffff" stroke="#b8c4d6"/>` +
            `<text x="${(col * 48) + 24}" y="${(row * 36) + 24}" text-anchor="middle" font-family="Sans Serif" ` +
            `font-size="15" fill="#33415c">${n}</text>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">${cells.join('')}</svg>`;
};
const MARK_A = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32" viewBox="0 0 40 32">' +
    '<rect x="2" y="2" width="36" height="28" rx="8" fill="#ff9f1c" fill-opacity="0.45"/></svg>';
const MARK_B = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32" viewBox="0 0 40 32">' +
    '<rect x="3" y="3" width="34" height="26" rx="8" fill="none" stroke="#2457a7" stroke-width="4"/></svg>';
// 透明的小點：角色停在角落說話時不會多畫出一個方塊。
const SPEAKER = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4">' +
    '<rect width="4" height="4" fill="#ffffff" fill-opacity="0"/></svg>';
const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
    '<rect width="480" height="360" fill="#f7f9fc"/></svg>';

// 工具區：說明註解放在各定義正上方（有些定義很寬）。回傳 add(定義積木 id, 說明, 註解高度)。
const toolArea = (s, startY = TOOL_Y, title = '工具區：下面的積木已經做好，不用改。\n上面的程式會用到這些自訂積木。') => {
    s.comment(null, title, 40, startY, 360, 70);
    let y = startY + 110;
    return (top, note, noteHeight = 80) => {
        s.comment(top, note, 40, y, 360, noteHeight);
        s.place(top, 40, y + noteHeight + 20);
        y += noteHeight + 20 + s.height(top) + TOOL_GAP;
    };
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
    s.stack([proc.define, b.if(inRange, s.stack([b.gotoXY(rep(cellX), rep(cellY)), b.stamp()]))]);
    return proc;
};
const MARK_NOTE = '「標記」會把一個數在百數表上圈起來。這段不用改。';
const markList = (p, s, b, proc, list, costume) => [
    b.costume(costume),
    b.setVar('第幾個', num(0)),
    b.repeat(rep(b.lengthOf(list)), s.stack([
        b.changeVar('第幾個', num(1)),
        proc.call(rep(b.itemOf(list, rep(b.getVar('第幾個')))))
    ]))
];
// 「畫回造例的例子」：依序圈出每張卡清單裡的數。cards＝[{list, costume}]。
const defineRedraw = (p, s, b, mark, cards) => {
    const proc = b.procedure('畫回造例的例子');
    s.stack([proc.define, b.penClear(), ...cards.flatMap(card => markList(p, s, b, mark, card.list, card.costume))]);
    return proc;
};
// 驗算機：問被除數與除數，說出「商 … 餘數」。
const defineDivisionMachine = (p, s, b) => {
    const proc = b.procedure('驗算機', null, {warp: false});
    const expr = b.join(rep(b.getVar('被除數'), 'txt'), rep(b.join(txt(' ÷ '), rep(b.join(rep(b.getVar('除以'), 'txt'),
        rep(b.join(txt(' ＝ '), rep(b.join(rep(b.floor(rep(b.divide(rep(b.getVar('被除數')), rep(b.getVar('除以'))))), 'txt'),
            rep(b.join(txt(' … '), rep(b.mod(rep(b.getVar('被除數')), rep(b.getVar('除以'))), 'txt')), 'txt')), 'txt')),
        'txt')), 'txt')), 'txt'));
    // 詢問時先把角色藏起來：Scratch 會把問題印在輸入框上方，不會被輸入框蓋住；說答案前再現身。
    s.stack([proc.define,
        b.hide(),
        b.ask(txt('要驗算哪個數？')),
        b.setVar('被除數', rep(b.answer(), 'txt')),
        b.ask(txt('要除以多少？')),
        b.setVar('除以', rep(b.answer(), 'txt')),
        b.show(),
        b.say(rep(expr, 'txt'))]);
    return proc;
};
const MACHINE_NOTE = '問你要算哪個數、除以多少，再說出「商 … 餘數」。';

// 依單元定義的 sb3Path 輸出；固定日期，同樣輸入每次產生相同位元組。
const writeUnitSb3 = async (unit, builders, agent, stage) => {
    const p = builders[stage]();
    const projectJson = p.toJSON(agent);
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(projectJson));
    for (const [name, svg] of [...p.assets.entries()].sort()) zip.file(name, svg);
    const date = new Date('2026-10-16T00:00:00Z');
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
const runCli = async (unit, builders, agent) => {
    for (const stage of Object.keys(builders)) {
        const {out, size} = await writeUnitSb3(unit, builders, agent, stage);
        console.log(`[OK] ${unit.UNIT_CODE} ${stage} -> ${path.relative(process.cwd(), out)}（${size} bytes）`);
    }
};

module.exports = {NOTE_X,
    TOOL_Y,
    hundredChart,
    MARK_A,
    MARK_B,
    SPEAKER,
    BLANK,
    toolArea,
    defineMark,
    MARK_NOTE,
    markList,
    defineRedraw,
    defineDivisionMachine,
    MACHINE_NOTE,
    writeUnitSb3,
    runCli};
