/* eslint-disable import/no-commonjs */
/**
 * 把前階段作品寫進剛載入的半成品專案（舞台層級的清單），以及從專案讀回清單內容。
 *
 * 只寫入「舞台」上已經存在、名稱相符的清單；專案裡沒有的清單不自動建立，
 * 回傳 missing 讓面板提示（代表 sb3 與單元定義的清單名稱不一致，屬於開發錯誤）。
 */

const LIST_TYPE = 'list';
const MAX_ITEMS = 200000;

const stageTarget = vm => (vm && vm.runtime && typeof vm.runtime.getTargetForStage === 'function' ?
    vm.runtime.getTargetForStage() : null);

const findList = (target, name) => {
    if (!target || !target.variables) return null;
    return Object.values(target.variables).find(v => v && v.type === LIST_TYPE && v.name === name) || null;
};

const applyInjection = (vm, injection) => {
    const target = stageTarget(vm);
    const applied = [];
    const missing = [];
    const lists = (injection && injection.lists) || {};
    for (const [name, values] of Object.entries(lists)) {
        const list = findList(target, name);
        if (!list) {
            missing.push(name);
            continue;
        }
        list.value = values.slice(0, MAX_ITEMS).map(String);
        list._monitorUpToDate = false;
        applied.push(name);
    }
    // 讓清單監視器重新繪製；沒有監視器時無副作用。
    if (applied.length && vm.runtime && typeof vm.runtime.requestRedraw === 'function') vm.runtime.requestRedraw();
    return {applied, missing};
};

const readList = (vm, name) => {
    const list = findList(stageTarget(vm), name);
    if (!list || !Array.isArray(list.value)) return null;
    return list.value.map(v => String(v));
};

const readNumberList = (vm, name) => {
    const values = readList(vm, name);
    if (!values) return null;
    return values.map(v => Number(v)).filter(n => Number.isSafeInteger(n));
};

module.exports = {applyInjection, readList, readNumberList};
