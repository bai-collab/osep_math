/**
 * 臆測任務的舞台顯示狀態（小型 pub/sub，比照 judge-manual-run.js）。
 *
 * osep-judge 平常把舞台藏成 1px（純文字評分）；osep_math 的百數表、虛擬組員與位值表徵
 * 需要學生看得到舞台，所以臆測任務進行時由面板呼叫 show()，gui.jsx 把舞台改成浮動視窗。
 * collapsed 讓學生暫時收起舞台騰出積木區；收起時仍用原本的隱藏方式，舞台不卸載。
 */

const listeners = new Set();
let state = {visible: false, collapsed: false};

const emit = next => {
    if (next.visible === state.visible && next.collapsed === state.collapsed) return;
    state = next;
    listeners.forEach(fn => fn(state));
};

const show = () => emit({...state, visible: true});
const hide = () => emit({visible: false, collapsed: false});
const setCollapsed = collapsed => emit({...state, collapsed: Boolean(collapsed)});
const getState = () => state;
const subscribe = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export default {show, hide, setCollapsed, getState, subscribe};
