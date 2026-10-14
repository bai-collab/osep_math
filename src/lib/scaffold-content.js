/**
 * M0~M3教學鷹架文件（16份，Cowork潤飾HTML版）的課程代碼對照表。
 * 網站正本部署在獨立的公開repo（tnjbox/teaching-scaffolds），osep-judge跟
 * BlocklyYdws/blockly-lab三個平台共用同一份對照表各自複製一份（避免額外的
 * 跨網域fetch依賴），內容需要與 YDWS-CodingBank/docs/teaching-scaffolds/
 * html-output/course-map.json 保持一致——那邊有異動要記得同步複製過來。
 */

export const SCAFFOLD_BASE_URL = 'https://tnjbox.github.io/teaching-scaffolds/';

// osep_math 目前沒有對應的教學鷹架文件；保留機制，對照表為空。
export const SCAFFOLD_MAP = {};

// BlocklyYdws/blockly-lab的courseGroup.id是完整課程代碼（例如「M1-07-SORTBASICS」），
// osep-judge的course.code則已經是短代碼（「M1-07」）——這裡統一先取開頭的「M?-NN」
// 短代碼再查表，兩種輸入都能正確對到SCAFFOLD_MAP的key，不用呼叫端各自處理。
const shortCourseCode = courseCode => {
    const match = /^([A-Za-z]\d+-\d+)/.exec(String(courseCode || '').trim());
    return match ? match[1].toUpperCase() : String(courseCode || '').toUpperCase();
};

export const scaffoldUrlForCourse = courseCode => {
    const file = SCAFFOLD_MAP[shortCourseCode(courseCode)];
    return file ? `${SCAFFOLD_BASE_URL}${file}` : null;
};
