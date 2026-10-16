/**
 * osep_math 單元／階段清單（輕量資料：只有課程與階段標題）。
 *
 * 每個單元的完整階段內容放在 ./courses/{code}.js，由 index.js 動態載入；
 * 單元正本在 src/lib/conjecture-units/。沒有 unlockCode 的課程視為公開（task-list.jsx）。
 */
import c21 from '../conjecture-units/c2-1.js';
import c41 from '../conjecture-units/c4-1.js';
import c61 from '../conjecture-units/c6-1.js';
import c62 from '../conjecture-units/c6-2.js';

const light = unit => {
    const course = unit.toCourse();
    return {
        code: course.code,
        title: course.title,
        tasks: course.tasks.map(({id, code, title}) => ({id, code, title}))
    };
};

export default [light(c21), light(c41), light(c61), light(c62)];
