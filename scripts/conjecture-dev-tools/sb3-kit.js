// 產生 Scratch 3 project.json 的小工具（osep_math 半成品專案用）。
//
// 與 osep-judge 的 hand-author-builder.js 不同：這裡要做的是「學生會打開來改」的半成品，
// 需要舞台層級的清單／變數、多個角色、造型資產、自訂積木、註解與滑桿監視器。
// 輸出可重現：同樣的輸入每次產生相同的 project.json 與資產雜湊。
const crypto = require('crypto');

const md5 = text => crypto.createHash('md5').update(text)
    .digest('hex');

// ---- 輸入槽 ----
const num = value => [1, [4, String(value)]];
const txt = value => [1, [10, String(value)]];
// 放入 reporter 積木，保留可回填的空白數字槽（學生把積木拖走後槽位還在）。
const rep = (id, kind = 'num') => [3, id, kind === 'num' ? [4, ''] : [10, '']];
const bool = id => [2, id];
const sub = id => [2, id];

const createTarget = ({name, isStage = false}) => {
    let counter = 0;
    const prefix = isStage ? 'st' : name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'sp';
    const target = {
        name,
        isStage,
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100
    };
    const id = () => `${prefix}_${++counter}`;
    const api = {target, id};

    api.block = (opcode, {inputs = {}, fields = {}, mutation = null, shadow = false} = {}) => {
        const bid = id();
        target.blocks[bid] = {opcode, next: null, parent: null, inputs, fields, shadow, topLevel: false};
        if (mutation) target.blocks[bid].mutation = mutation;
        return bid;
    };
    // 把 statement 串起來；第一個若是 hat 或獨立堆疊，放在指定位置。
    api.stack = (ids, x, y) => {
        const list = ids.filter(Boolean);
        for (let i = 0; i < list.length - 1; i++) target.blocks[list[i]].next = list[i + 1];
        if (typeof x === 'number') {
            Object.assign(target.blocks[list[0]], {topLevel: true, x, y});
        }
        return list[0];
    };
    api.comment = (blockId, text, x, y, width = 260, height = 140) => {
        const cid = id();
        target.comments[cid] = {blockId: blockId || null, x, y, width, height, minimized: false, text};
        if (blockId) target.blocks[blockId].comment = cid;
        return cid;
    };
    // 設定所有被引用積木的 parent（輸入槽與 next）。產生完一個角色後呼叫一次。
    api.finalize = () => {
        for (const [bid, block] of Object.entries(target.blocks)) {
            if (block.next) target.blocks[block.next].parent = bid;
            for (const value of Object.values(block.inputs)) {
                const ref = value[1];
                if (typeof ref === 'string' && target.blocks[ref]) target.blocks[ref].parent = bid;
            }
        }
        return target;
    };
    return api;
};

// 變數與清單一律建在舞台（全域），角色積木用同一個 id 引用；注入程式只找舞台清單。
const createProject = () => {
    const stage = createTarget({name: 'Stage', isStage: true});
    const sprites = [];
    const assets = new Map();
    const monitors = [];
    const vars = {};
    const lists = {};
    const project = {
        stage,
        sprites,
        assets,
        monitors,
        variable (name, value = 0) {
            const vid = `var_${md5(`v:${name}`).slice(0, 10)}`;
            stage.target.variables[vid] = [name, value];
            vars[name] = vid;
            return vid;
        },
        list (name, values = []) {
            const lid = `list_${md5(`l:${name}`).slice(0, 10)}`;
            stage.target.lists[lid] = [name, values];
            lists[name] = lid;
            return lid;
        },
        varField: name => ({VARIABLE: [name, vars[name]]}),
        listField: name => ({LIST: [name, lists[name]]}),
        costume (target, name, svg, {cx, cy}) {
            const assetId = md5(svg);
            assets.set(`${assetId}.svg`, svg);
            target.target.costumes.push({assetId,
                name,
                md5ext: `${assetId}.svg`,
                dataFormat: 'svg',
                bitmapResolution: 1,
                rotationCenterX: cx,
                rotationCenterY: cy});
        },
        sprite (name, props = {}) {
            const sprite = createTarget({name});
            Object.assign(sprite.target, {visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around',
                layerOrder: sprites.length + 1}, props);
            sprites.push(sprite);
            return sprite;
        },
        sliderMonitor (name, {x, y, min, max}) {
            const vid = vars[name];
            monitors.push({id: vid,
                mode: 'slider',
                opcode: 'data_variable',
                params: {VARIABLE: name},
                spriteName: null,
                value: stage.target.variables[vid][1],
                width: 0,
                height: 0,
                x,
                y,
                visible: true,
                sliderMin: min,
                sliderMax: max,
                isDiscrete: true});
        },
        toJSON (agent) {
            stage.finalize();
            sprites.forEach(s => s.finalize());
            stage.target.layerOrder = 0;
            return {
                targets: [stage.target, ...sprites.map(s => s.target)],
                monitors,
                extensions: ['pen'],
                meta: {semver: '3.0.0', vm: '0.2.0', agent}
            };
        }
    };
    return project;
};

// ---- 常用積木（ s 是 createTarget 回傳的 api，p 是 project） ----
const blocks = (p, s) => {
    const b = {};
    b.whenFlag = () => s.block('event_whenflagclicked');
    b.whenKey = key => s.block('event_whenkeypressed', {fields: {KEY_OPTION: [key, null]}});
    b.whenClicked = () => s.block('event_whenthisspriteclicked');
    b.setVar = (name, input) => s.block('data_setvariableto', {inputs: {VALUE: input}, fields: p.varField(name)});
    b.changeVar = (name, input) => s.block('data_changevariableby', {inputs: {VALUE: input}, fields: p.varField(name)});
    b.getVar = name => s.block('data_variable', {fields: p.varField(name)});
    b.addTo = (list, input) => s.block('data_addtolist', {inputs: {ITEM: input}, fields: p.listField(list)});
    b.clearList = list => s.block('data_deletealloflist', {fields: p.listField(list)});
    b.itemOf = (list, input) => s.block('data_itemoflist', {inputs: {INDEX: input}, fields: p.listField(list)});
    b.lengthOf = list => s.block('data_lengthoflist', {fields: p.listField(list)});
    b.op = (opcode, a, c) => s.block(`operator_${opcode}`, {inputs: {NUM1: a, NUM2: c}});
    b.mod = (a, c) => b.op('mod', a, c);
    b.mul = (a, c) => b.op('multiply', a, c);
    b.add = (a, c) => b.op('add', a, c);
    b.subtract = (a, c) => b.op('subtract', a, c);
    b.divide = (a, c) => b.op('divide', a, c);
    b.floor = input => s.block('operator_mathop', {inputs: {NUM: input}, fields: {OPERATOR: ['floor', null]}});
    b.cmp = (opcode, a, c) => s.block(`operator_${opcode}`, {inputs: {OPERAND1: a, OPERAND2: c}});
    b.join = (a, c) => s.block('operator_join', {inputs: {STRING1: a, STRING2: c}});
    b.repeat = (times, body) => s.block('control_repeat', {inputs: {TIMES: times,
        ...(body ? {SUBSTACK: sub(body)} : {})}});
    b.if = (cond, body) => s.block('control_if', {inputs: {CONDITION: bool(cond),
        ...(body ? {SUBSTACK: sub(body)} : {})}});
    b.ifElse = (cond, a, c) => s.block('control_if_else', {inputs: {
        CONDITION: bool(cond),
        ...(a ? {SUBSTACK: sub(a)} : {}),
        ...(c ? {SUBSTACK2: sub(c)} : {})}});
    b.say = input => s.block('looks_say', {inputs: {MESSAGE: input}});
    b.sayFor = (input, secs) => s.block('looks_sayforsecs', {inputs: {MESSAGE: input, SECS: num(secs)}});
    b.ask = input => s.block('sensing_askandwait', {inputs: {QUESTION: input}});
    b.answer = () => s.block('sensing_answer');
    b.gotoXY = (x, y) => s.block('motion_gotoxy', {inputs: {X: x, Y: y}});
    b.costume = name => {
        const menu = s.block('looks_costume', {fields: {COSTUME: [name, null]}, shadow: true});
        return s.block('looks_switchcostumeto', {inputs: {COSTUME: [1, menu]}});
    };
    b.show = () => s.block('looks_show');
    b.hide = () => s.block('looks_hide');
    b.penClear = () => s.block('pen_clear');
    b.stamp = () => s.block('pen_stamp');
    // 自訂積木（一個數字參數）。回傳 {define, call(input)}；定義的本體由呼叫端用 stack 接在 define 後面。
    b.procedure = (proccode, argName) => {
        const argId = `${proccode}_arg`;
        const reporter = s.block('argument_reporter_string_number', {fields: {VALUE: [argName, null]}, shadow: true});
        const proto = s.block('procedures_prototype', {inputs: {[argId]: [1, reporter]},
            shadow: true,
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: `${proccode} %s`,
                argumentids: JSON.stringify([argId]),
                argumentnames: JSON.stringify([argName]),
                argumentdefaults: JSON.stringify(['']),
                warp: 'true'}});
        const define = s.block('procedures_definition', {inputs: {custom_block: [1, proto]}});
        const arg = () => s.block('argument_reporter_string_number', {fields: {VALUE: [argName, null]}});
        const call = input => s.block('procedures_call', {inputs: {[argId]: input},
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: `${proccode} %s`,
                argumentids: JSON.stringify([argId]),
                warp: 'true'}});
        return {define, call, arg};
    };
    return b;
};

module.exports = {md5, num, txt, rep, bool, sub, createProject, blocks};
