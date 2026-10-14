// 手寫原生Scratch積木樹的小工具庫。
//
// 背景：xml-to-scratch.js只能自動轉換BlocklyYdws實際會用到的Blockly積木子集，遇到迴圈
// （controls_for/controls_repeat_ext）等它不支援的積木類型會直接丟錯。使用者2026-08-09決定：
// 遇到這種情況不要硬擴充轉換器去湊，而是直接用「官方Scratch平台真的有的積木」手寫一份對應
// 的示範解答（題目本身、測資都跟BlocklyYdws共用，只有示範解答分開寫）。
//
// 這個工具庫產生的block JSON格式跟xml-to-scratch.js輸出的{variables, blocks}完全相容，
// 可以直接餵給build-m0-course-sb3.js的buildTaskSb3()。
//
// 用法範例見 hand-authored-answers/JSB00/*.build.js。

function createBuilder() {
    let counter = 1;
    const blocks = {};
    const variables = {};
    const lists = {};
    return {
        blocks,
        variables,
        lists,
        nextId: () => `h${counter++}`,
        addVariable(id, name) {
            variables[id] = [name, ''];
            return id;
        },
        addList(id, name) {
            lists[id] = [name, []];
            return id;
        }
    };
}

const numShadow = n => [1, [4, String(n)]];
const textShadow = s => [1, [10, String(s)]];
const blockRef = id => [2, id];

// 把一串「statement積木id」串成next鏈，回傳第一個id（可以直接當某個SUBSTACK的值）。
function chain(b, ids) {
    const filtered = ids.filter(Boolean);
    for (let i = 0; i < filtered.length - 1; i++) {
        b.blocks[filtered[i]].next = filtered[i + 1];
    }
    for (let i = 1; i < filtered.length; i++) {
        b.blocks[filtered[i]].parent = filtered[i - 1];
    }
    return filtered[0] || null;
}

function whenFlagClicked(b) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'event_whenflagclicked', next: null, parent: null,
        inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40
    };
    return id;
}

function askAndWait(b, parent, questionInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'sensing_askandwait', next: null, parent,
        inputs: {QUESTION: questionInput}, fields: {}, shadow: false, topLevel: false
    };
    return id;
}

function answer(b, parent) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'sensing_answer', next: null, parent,
        inputs: {}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function say(b, parent, messageInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'looks_say', next: null, parent,
        inputs: {MESSAGE: messageInput}, fields: {}, shadow: false, topLevel: false
    };
    return id;
}

function setVar(b, parent, varId, varName, valueInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_setvariableto', next: null, parent,
        inputs: {VALUE: valueInput}, fields: {VARIABLE: [varName, varId]}, shadow: false, topLevel: false
    };
    return id;
}

function getVar(b, parent, varId, varName) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_variable', next: null, parent,
        inputs: {}, fields: {VARIABLE: [varName, varId]}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function arithmetic(b, parent, opcode, aInput, bInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode, next: null, parent,
        inputs: {NUM1: aInput, NUM2: bInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}
const add = (b, parent, a, bb) => arithmetic(b, parent, 'operator_add', a, bb);
const sub = (b, parent, a, bb) => arithmetic(b, parent, 'operator_subtract', a, bb);
const mul = (b, parent, a, bb) => arithmetic(b, parent, 'operator_multiply', a, bb);
const div = (b, parent, a, bb) => arithmetic(b, parent, 'operator_divide', a, bb);

function mathop(b, parent, operatorName, numInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_mathop', next: null, parent,
        inputs: {NUM: numInput}, fields: {OPERATOR: [operatorName, null]}, shadow: false, topLevel: false
    };
    return blockRef(id);
}
const floor_ = (b, parent, numInput) => mathop(b, parent, 'floor', numInput);
const abs_ = (b, parent, numInput) => mathop(b, parent, 'abs', numInput);

function round(b, parent, numInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_round', next: null, parent,
        inputs: {NUM: numInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function compare(b, parent, opcode, aInput, bInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode, next: null, parent,
        inputs: {OPERAND1: aInput, OPERAND2: bInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}
const gt = (b, parent, a, bb) => compare(b, parent, 'operator_gt', a, bb);
const lt = (b, parent, a, bb) => compare(b, parent, 'operator_lt', a, bb);

function and_(b, parent, aInput, bInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_and', next: null, parent,
        inputs: {OPERAND1: aInput, OPERAND2: bInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}
function or_(b, parent, aInput, bInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_or', next: null, parent,
        inputs: {OPERAND1: aInput, OPERAND2: bInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function not_(b, parent, operandInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_not', next: null, parent,
        inputs: {OPERAND: operandInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

// ---- 清單（原生Scratch list，跟Blockly轉換器完全無關，直接對應官方積木盤「新增清單」）----

function addToList(b, parent, listId, listName, itemInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_addtolist', next: null, parent,
        inputs: {ITEM: itemInput}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return id;
}

// 每次測資都用同一個VM/角色跑（見verify-m0-course.js對同一支.sb3循環跑所有testCases），
// 清單是角色的持久狀態，不會因為「當綠旗被點擊」重新觸發就自動清空——一定要在腳本開頭
// 主動清空，不然第二筆以後的測資會讀到前一筆殘留的資料，算出離奇的錯誤答案。
function deleteAllOfList(b, parent, listId, listName) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_deletealloflist', next: null, parent,
        inputs: {}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return id;
}

function lengthOfList(b, parent, listId, listName) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_lengthoflist', next: null, parent,
        inputs: {}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function deleteItemOfList(b, parent, listId, listName, indexInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_deleteoflist', next: null, parent,
        inputs: {INDEX: indexInput}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return id;
}

function itemOfList(b, parent, listId, listName, indexInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_itemoflist', next: null, parent,
        inputs: {INDEX: indexInput}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function replaceItemOfList(b, parent, listId, listName, indexInput, itemInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'data_replaceitemoflist', next: null, parent,
        inputs: {INDEX: indexInput, ITEM: itemInput}, fields: {LIST: [listName, listId]}, shadow: false, topLevel: false
    };
    return id;
}

function join(b, parent, s1Input, s2Input) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_join', next: null, parent,
        inputs: {STRING1: s1Input, STRING2: s2Input}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function mod_(b, parent, aInput, bInput) {
    return arithmetic(b, parent, 'operator_mod', aInput, bInput);
}

function equals(b, parent, aInput, bInput) {
    return compare(b, parent, 'operator_equals', aInput, bInput);
}

function length_(b, parent, stringInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_length', next: null, parent,
        inputs: {STRING: stringInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

function letterOf(b, parent, indexInput, stringInput) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'operator_letter_of', next: null, parent,
        inputs: {LETTER: indexInput, STRING: stringInput}, fields: {}, shadow: false, topLevel: false
    };
    return blockRef(id);
}

// repeat N times { ...body }。timesInputBuilder(id)/bodyBuilder(id)都拿得到這個repeat
// 積木自己的id，可以正確設定巢狀reporter/statement的parent。
function repeat(b, parent, timesInputBuilder, bodyBuilder) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'control_repeat', next: null, parent,
        inputs: {}, fields: {}, shadow: false, topLevel: false
    };
    b.blocks[id].inputs.TIMES = timesInputBuilder(id);
    const bodyIds = bodyBuilder(id);
    const firstBody = chain(b, bodyIds);
    if (firstBody) b.blocks[id].inputs.SUBSTACK = blockRef(firstBody);
    return id;
}

// repeat until <condition> { ...body }（原生Scratch的while迴圈寫法）。
function repeatUntil(b, parent, conditionInputBuilder, bodyBuilder) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'control_repeat_until', next: null, parent,
        inputs: {}, fields: {}, shadow: false, topLevel: false
    };
    b.blocks[id].inputs.CONDITION = conditionInputBuilder(id);
    const bodyIds = bodyBuilder(id);
    const firstBody = chain(b, bodyIds);
    if (firstBody) b.blocks[id].inputs.SUBSTACK = blockRef(firstBody);
    return id;
}

// 只有if、沒有else的版本（用control_if，不是control_if_else）。
function if_(b, parent, conditionInputBuilder, thenBuilder) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'control_if', next: null, parent,
        inputs: {}, fields: {}, shadow: false, topLevel: false
    };
    b.blocks[id].inputs.CONDITION = conditionInputBuilder(id);
    const thenIds = thenBuilder(id);
    const thenFirst = chain(b, thenIds);
    if (thenFirst) b.blocks[id].inputs.SUBSTACK = blockRef(thenFirst);
    return id;
}

function ifElse(b, parent, conditionInputBuilder, thenBuilder, elseBuilder) {
    const id = b.nextId();
    b.blocks[id] = {
        opcode: 'control_if_else', next: null, parent,
        inputs: {}, fields: {}, shadow: false, topLevel: false
    };
    b.blocks[id].inputs.CONDITION = conditionInputBuilder(id);
    const thenIds = thenBuilder ? thenBuilder(id) : [];
    const thenFirst = chain(b, thenIds);
    if (thenFirst) b.blocks[id].inputs.SUBSTACK = blockRef(thenFirst);
    const elseIds = elseBuilder ? elseBuilder(id) : [];
    const elseFirst = chain(b, elseIds);
    if (elseFirst) b.blocks[id].inputs.SUBSTACK2 = blockRef(elseFirst);
    return id;
}

module.exports = {
    createBuilder, numShadow, textShadow, blockRef, chain,
    whenFlagClicked, askAndWait, answer, say, setVar, getVar,
    add, sub, mul, div, round, gt, lt, not_, join, repeat, ifElse,
    mod_, equals, length_, letterOf, repeatUntil, if_, floor_, addToList, itemOfList, deleteAllOfList,
    and_, or_, abs_, replaceItemOfList, deleteItemOfList, lengthOfList
};
