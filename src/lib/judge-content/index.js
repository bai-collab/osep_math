/**
 * judge-content資料存取層（手寫，不是產生器輸出——產生器只寫manifest.js跟courses/*.js，
 * 見scripts/judge-dev-tools/gen-judge-content.js）。
 *
 * 2026-09-01：從單一2MB的judge-content.js（全部課程渾然一體，見上一版git history）拆成
 * manifest（輕量課程/題目清單）＋courses/{code}.js（每課程各自完整資料，動態載入）兩層，
 * 讓「上架一個新縣市」只讓新增的那個課程檔案雜湊變動，不拖累其他課程或平台程式碼的
 * 瀏覽器快取。manifest本身很小，直接靜態import跟著這個模組一起載入即可。
 *
 * answerProjectUrl用document.baseURI（相對目前頁面路徑）動態產生，能正確處理GitHub Pages
 * 子路徑部署（例如osep-judge部署在/osep-judge/底下時，document.baseURI本身就是
 * .../osep-judge/editor.html，用它當base算出來的judge-content會自動落在/osep-judge/
 * judge-content/底下）——這個getter要在每個課程完整資料「載入完成」後才動態補上，
 * 不是JSON資料的一部分，所以統一寫在這裡的attachRuntimeFields()，不重複產生在
 * 每個courses/*.js檔案裡。
 *
 * course.unlockCode：版權保護用的課程解鎖代碼（見task-list.jsx），值直接沿用
 * BlocklyYdws自己的courseCode（來源課程檔的完整檔名，不含.js），不用另外維護一套。
 */

import manifest from './manifest.js';

const judgeContentBase = () => new URL('judge-content', document.baseURI).href;

function attachRuntimeFields(course) {
    course.tasks.forEach(task => {
        if (!task.sb3Path) {
            task.loadable = false;
            return;
        }
        Object.defineProperty(task, 'answerProjectUrl', {
            enumerable: true,
            get() { return `${judgeContentBase()}/${task.sb3Path}`; }
        });
        task.loadable = true;
    });
    return course;
}

const courseCache = new Map();

// 動態import表達式要有靜態的前後綴（`./courses/`+`.js`），webpack才能把這個資料夾底下
// 每個檔案各自切成獨立chunk（等同Vite的import.meta.glob，BlocklyYdws/src/courses/index.js
// 用的是那個機制，這裡是webpack版的等價做法）。courseCode不合法（找不到對應檔案）時
// import()會reject，呼叫端要自行處理。
export async function getCourseTasks(courseCode) {
    if (courseCache.has(courseCode)) return courseCache.get(courseCode);
    const mod = await import(
        /* webpackChunkName: "course-[request]" */
        `./courses/${courseCode}.js`
    );
    const course = attachRuntimeFields(mod.default);
    courseCache.set(courseCode, course);
    return course;
}

// 只用manifest（輕量、不含description/testCases）比對taskCode屬於哪個課程，
// 確定之後才觸發該課程完整資料的動態載入——這樣使用者只會下載自己實際點開的課程，
// 其他課程（含還沒解鎖的私有課程）完全不會被下載。
export async function findTaskByCode(taskCode) {
    for (const courseMeta of manifest) {
        const taskMeta = courseMeta.tasks.find(t => t.code === taskCode);
        if (!taskMeta) continue;
        const course = await getCourseTasks(courseMeta.code);
        const task = course.tasks.find(t => t.code === taskCode);
        if (task) return {course, task};
        return null;
    }
    return null;
}

export const courses = manifest;
