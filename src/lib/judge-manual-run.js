/**
 * 2026-08-04：手動測試模式共用的小型pub/sub——「自行測試」分頁需要讓學生用跟真正Scratch
 * 一樣的操作方式（按下綠旗、跳出「詢問並等待」浮動輸入框、一筆一筆手動輸入）試跑程式，
 * 但整個MVP-33平台把舞台（StageWrapper）用CSS藏起來（見gui.jsx的`.hiddenStage`），
 * 「詢問並等待」的浮動輸入框（`src/components/question/question.jsx`）是舞台底下的子元件，
 * 舞台被藏起來的時候這個輸入框也連帶完全不會出現，學生按下真正的綠旗會卡住、看不到
 * 任何輸入介面（已實測確認過）。
 *
 * 這個模組讓judge-panel.jsx（在SelfTestTab手動測試時）可以告訴gui.jsx「現在暫時要把舞台
 * 顯示出來」，跑完/學生按停止之後再藏回去，不用把兩個元件用Redux接在一起。
 */

const listeners = new Set();
let visible = false;

const show = () => {
    if (visible) return;
    visible = true;
    listeners.forEach(fn => fn(visible));
};

const hide = () => {
    if (!visible) return;
    visible = false;
    listeners.forEach(fn => fn(visible));
};

const isVisible = () => visible;

const subscribe = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export default {show, hide, isVisible, subscribe};
