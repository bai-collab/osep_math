import LazyScratchBlocks from './tw-lazy-scratch-blocks';
import {defaultBlockColors} from './themes';

const categorySeparator = '<sep gap="36"/>';

const blockSeparator = '<sep gap="36"/>'; // At default scale, about 28px

const translate = (id, english) => {
    if (LazyScratchBlocks.isLoaded()) {
        return LazyScratchBlocks.get().ScratchMsgs.translate(id, english);
    }
    return english;
};

// 2026-08-04：把「思考」（looks_think）積木的顯示文字改成除錯print的角色，不是Scratch
// 原本敘事用的「角色在想什麼」。積木本身還是原生looks_think opcode（tw-judge-engine.js只
// 採計type==='say'，'think'不會算進最終答案），只是改顯示字串，行為完全沒變。
// 2026-09-10：字串從「輸出訊息」改成「輸出至訊息視窗」，對齊官方競賽平台跟BlocklyYdws/
// blockly-lab那邊text_print積木的命名（同一顆「除錯用、不列入評分」的積木，三個平台名稱
// 現在一致）。
//
// 這個字串來自Blockly.ScratchMsgs.locales[locale].LOOKS_THINK，每次workspace init時
// scratch-blocks的core/scratch_msgs.js都會用`Blockly.Msg = Object.assign({}, Blockly.Msg,
// Blockly.ScratchMsgs.locales[locale])`重建一次Blockly.Msg，所以兩個地方都要patch——
// 只改Msg會被下一次setLocale()蓋掉，只改locales表在Msg已經建好之後才patch又不會立刻生效，
// 兩個都改才保證不管執行順序都拿到「輸出至訊息視窗」。冪等（可重複呼叫），每次組toolbox XML時
// 都呼叫一次確保生效。
export const patchThinkBlockLabel = () => {
    if (!LazyScratchBlocks.isLoaded()) return;
    const ScratchBlocks = LazyScratchBlocks.get();
    const label = '輸出至訊息視窗 %1';
    if (ScratchBlocks.Msg) ScratchBlocks.Msg.LOOKS_THINK = label;
    const zhTw = ScratchBlocks.ScratchMsgs && ScratchBlocks.ScratchMsgs.locales && ScratchBlocks.ScratchMsgs.locales['zh-tw'];
    if (zhTw) zhTw.LOOKS_THINK = label;
};

/* eslint-disable no-unused-vars */
// 2026-08-14：對齊官方競賽平台（demo.csie.ntnu.edu.tw/ps）與BlocklyYdws來源專案自己的
// toolbox（見`BlocklyYdws/src/blockly/toolbox.js`，同樣叫「專用」分類）——動作／外觀／
// 音效／事件／偵測這些動畫用的完整分類全部移除，只留「當綠旗被點擊／說出／詢問並等待／
// 詢問的答案」這幾個解題題目實際會用到的積木，集中放進這個唯一的分類。積木本身還是原生
// Scratch積木（保留各自原本的顏色），Blockly本來就允許積木出現在自訂分類裡。
//
// 這裡放一顆「輸出至訊息視窗」積木當作除錯用：opcode還是原生looks_think，只是透過
// patchThinkBlockLabel()（見上方）把顯示字串從「思考」全域改成「輸出至訊息視窗」，
// 對學生來說是一顆語意明確的debug print積木，不是Scratch原本敘事用的「角色在想什麼」。
// tw-judge-engine.js的評分只採計looks_say（說出）事件，looks_think不會被算進最終答案，
// 可以放心拿來印變數目前的值除錯，不會影響評分結果。畫面上看不到（工作區旁的舞台是
// 隱藏的），但debug輸出會顯示在「自行測試」分頁（見judge-panel.jsx的SelfTestTab）。
const judgeHelpers = function (isInitialSetup, isStage, targetId) {
    const askDefault = translate('SENSING_ASK_TEXT', 'What\'s your name?');
    const sayDefault = translate('LOOKS_HELLO', 'Hello!');
    const thinkDefault = translate('LOOKS_HMM', 'Hmm...');
    return `
    <category name="專用" id="judgeHelpers" colour="#FF6680" secondaryColour="#FF3D5E">
        <block type="event_whenflagclicked"/>
        ${blockSeparator}
        <block type="looks_say">
            <value name="MESSAGE">
                <shadow type="text">
                    <field name="TEXT">${sayDefault}</field>
                </shadow>
            </value>
        </block>
        ${isInitialSetup ? '' : `
            <block id="judgeHelpers_askandwait" type="sensing_askandwait">
                <value name="QUESTION">
                    <shadow type="text">
                        <field name="TEXT">${askDefault}</field>
                    </shadow>
                </value>
            </block>
        `}
        <block type="sensing_answer"/>
        ${blockSeparator}
        <label text="以下用來除錯：不會算進評分結果"></label>
        <block type="looks_think">
            <value name="MESSAGE">
                <shadow type="text">
                    <field name="TEXT">${thinkDefault}</field>
                </shadow>
            </value>
        </block>
        ${categorySeparator}
    </category>
    `;
};

const control = function (isInitialSetup, isStage, targetId, colors) {
    // Note: the category's secondaryColour matches up with the blocks' tertiary color, both used for border color.
    return `
    <category
        name="%{BKY_CATEGORY_CONTROL}"
        id="control"
        colour="${colors.primary}"
        secondaryColour="${colors.tertiary}">
        <block type="control_wait">
            <value name="DURATION">
                <shadow type="math_positive_number">
                    <field name="NUM">1</field>
                </shadow>
            </value>
        </block>
        ${blockSeparator}
        <block type="control_repeat">
            <value name="TIMES">
                <shadow type="math_whole_number">
                    <field name="NUM">10</field>
                </shadow>
            </value>
        </block>
        <block id="forever" type="control_forever"/>
        ${blockSeparator}
        <block type="control_if"/>
        <block type="control_if_else"/>
        <block id="wait_until" type="control_wait_until"/>
        <block id="repeat_until" type="control_repeat_until"/>
        <block id="while" type="control_while"/>
        ${blockSeparator}
        <block type="control_stop"/>
        ${blockSeparator}
        ${isStage ? `
            <block type="control_create_clone_of">
                <value name="CLONE_OPTION">
                    <shadow type="control_create_clone_of_menu"/>
                </value>
            </block>
        ` : `
            <block type="control_start_as_clone"/>
            <block type="control_create_clone_of">
                <value name="CLONE_OPTION">
                    <shadow type="control_create_clone_of_menu"/>
                </value>
            </block>
            <block type="control_delete_this_clone"/>
        `}
        ${categorySeparator}
    </category>
    `;
};

const operators = function (isInitialSetup, isStage, targetId, colors) {
    const apple = translate('OPERATORS_JOIN_APPLE', 'apple');
    const banana = translate('OPERATORS_JOIN_BANANA', 'banana');
    const letter = translate('OPERATORS_LETTEROF_APPLE', 'a');
    // Note: the category's secondaryColour matches up with the blocks' tertiary color, both used for border color.
    return `
    <category
        name="%{BKY_CATEGORY_OPERATORS}"
        id="operators"
        colour="${colors.primary}"
        secondaryColour="${colors.tertiary}">
        <block type="operator_add">
            <value name="NUM1">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
            <value name="NUM2">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        <block type="operator_subtract">
            <value name="NUM1">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
            <value name="NUM2">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        <block type="operator_multiply">
            <value name="NUM1">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
            <value name="NUM2">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        <block type="operator_divide">
            <value name="NUM1">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
            <value name="NUM2">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        ${blockSeparator}
        <block type="operator_random">
            <value name="FROM">
                <shadow type="math_number">
                    <field name="NUM">1</field>
                </shadow>
            </value>
            <value name="TO">
                <shadow type="math_number">
                    <field name="NUM">10</field>
                </shadow>
            </value>
        </block>
        ${blockSeparator}
        <block type="operator_gt">
            <value name="OPERAND1">
                <shadow type="text">
                    <field name="TEXT"/>
                </shadow>
            </value>
            <value name="OPERAND2">
                <shadow type="text">
                    <field name="TEXT">50</field>
                </shadow>
            </value>
        </block>
        <block type="operator_lt">
            <value name="OPERAND1">
                <shadow type="text">
                    <field name="TEXT"/>
                </shadow>
            </value>
            <value name="OPERAND2">
                <shadow type="text">
                    <field name="TEXT">50</field>
                </shadow>
            </value>
        </block>
        <block type="operator_equals">
            <value name="OPERAND1">
                <shadow type="text">
                    <field name="TEXT"/>
                </shadow>
            </value>
            <value name="OPERAND2">
                <shadow type="text">
                    <field name="TEXT">50</field>
                </shadow>
            </value>
        </block>
        ${blockSeparator}
        <block type="operator_and"/>
        <block type="operator_or"/>
        <block type="operator_not"/>
        ${blockSeparator}
        ${isInitialSetup ? '' : `
            <block type="operator_join">
                <value name="STRING1">
                    <shadow type="text">
                        <field name="TEXT">${apple} </field>
                    </shadow>
                </value>
                <value name="STRING2">
                    <shadow type="text">
                        <field name="TEXT">${banana}</field>
                    </shadow>
                </value>
            </block>
            <block type="operator_letter_of">
                <value name="LETTER">
                    <shadow type="math_whole_number">
                        <field name="NUM">1</field>
                    </shadow>
                </value>
                <value name="STRING">
                    <shadow type="text">
                        <field name="TEXT">${apple}</field>
                    </shadow>
                </value>
            </block>
            <block type="operator_length">
                <value name="STRING">
                    <shadow type="text">
                        <field name="TEXT">${apple}</field>
                    </shadow>
                </value>
            </block>
            <block type="operator_contains" id="operator_contains">
              <value name="STRING1">
                <shadow type="text">
                  <field name="TEXT">${apple}</field>
                </shadow>
              </value>
              <value name="STRING2">
                <shadow type="text">
                  <field name="TEXT">${letter}</field>
                </shadow>
              </value>
            </block>
        `}
        ${blockSeparator}
        <block type="operator_mod">
            <value name="NUM1">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
            <value name="NUM2">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        <block type="operator_round">
            <value name="NUM">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        ${blockSeparator}
        <block type="operator_mathop">
            <value name="NUM">
                <shadow type="math_number">
                    <field name="NUM"/>
                </shadow>
            </value>
        </block>
        ${categorySeparator}
    </category>
    `;
};

const variables = function (isInitialSetup, isStage, targetId, colors) {
    // Note: the category's secondaryColour matches up with the blocks' tertiary color, both used for border color.
    return `
    <category
        name="%{BKY_CATEGORY_VARIABLES}"
        id="variables"
        colour="${colors.primary}"
        secondaryColour="${colors.tertiary}"
        custom="VARIABLE">
    </category>
    `;
};

const myBlocks = function (isInitialSetup, isStage, targetId, colors) {
    // Note: the category's secondaryColour matches up with the blocks' tertiary color, both used for border color.
    return `
    <category
        name="%{BKY_CATEGORY_MYBLOCKS}"
        id="myBlocks"
        colour="${colors.primary}"
        secondaryColour="${colors.tertiary}"
        custom="PROCEDURE">
    </category>
    `;
};

// eslint-disable-next-line max-len
const extraTurboWarpBlocks = `
<block type="argument_reporter_boolean"><field name="VALUE">is compiled?</field></block>
<block type="argument_reporter_boolean"><field name="VALUE">is TurboWarp?</field></block>
`;
/* eslint-enable no-unused-vars */

const xmlOpen = '<xml style="display: none">';
const xmlClose = '</xml>';

/**
 * @param {!boolean} isInitialSetup - Whether the toolbox is for initial setup. If the mode is "initial setup",
 * blocks with localized default parameters (e.g. ask and wait) should not be loaded. (LLK/scratch-gui#5445)
 * @param {?boolean} isStage - Whether the toolbox is for a stage-type target. This is always set to true
 * when isInitialSetup is true.
 * @param {?string} targetId - The current editing target
 * @param {?Array.<object>} categoriesXML - optional array of `{id,xml}` for categories. This can include both core
 * and other extensions: core extensions will be placed in the normal Scratch order; others will go at the bottom.
 * @property {string} id - the extension / category ID.
 * @property {string} xml - the `<category>...</category>` XML for this extension / category.
 * @param {?object} colors - The colors for the theme.
 * @returns {string} - a ScratchBlocks-style XML document for the contents of the toolbox.
 */
const makeToolboxXML = function (isInitialSetup, isStage = true, targetId, categoriesXML = [],
    colors = defaultBlockColors) {
    isStage = isInitialSetup || isStage;
    const gap = [categorySeparator];

    patchThinkBlockLabel();

    categoriesXML = categoriesXML.slice();
    const moveCategory = categoryId => {
        const index = categoriesXML.findIndex(categoryInfo => categoryInfo.id === categoryId);
        if (index >= 0) {
            // remove the category from categoriesXML and return its XML
            const [categoryInfo] = categoriesXML.splice(index, 1);
            return categoryInfo.xml;
        }
        // return `undefined`
    };
    const controlXML = moveCategory('control') || control(isInitialSetup, isStage, targetId, colors.control);
    const operatorsXML = moveCategory('operators') || operators(isInitialSetup, isStage, targetId, colors.operators);
    const variablesXML = moveCategory('data') || variables(isInitialSetup, isStage, targetId, colors.data);
    const myBlocksXML = moveCategory('procedures') || myBlocks(isInitialSetup, isStage, targetId, colors.more);

    // Always display TurboWarp blocks as the first extension, if it exists,
    // and also add an "is compiled?" block to the top.
    let turbowarpXML = moveCategory('tw');
    if (turbowarpXML && !turbowarpXML.includes(extraTurboWarpBlocks)) {
        turbowarpXML = turbowarpXML.replace('<block', `${extraTurboWarpBlocks}<block`);
    }

    const judgeHelpersXML = judgeHelpers(isInitialSetup, isStage, targetId);

    const everything = [
        xmlOpen,
        judgeHelpersXML, gap,
        controlXML, gap,
        operatorsXML, gap,
        variablesXML, gap,
        myBlocksXML
    ];

    if (turbowarpXML) {
        everything.push(gap, turbowarpXML);
    }

    for (const extensionCategory of categoriesXML) {
        everything.push(gap, extensionCategory.xml);
    }

    everything.push(xmlClose);
    return everything.join('\n');
};

export default makeToolboxXML;
