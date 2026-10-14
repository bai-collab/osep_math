/* eslint func-style: ["error", "declaration", {"allowArrowFunctions": true}] */
const isValidGrade = record => record.type === 'grade' && record.status === 'completed' &&
    !record.demoLoaded && !record.programChanged;
const timestampOf = record => (typeof record.timestamp === 'string' ? record.timestamp : '');
const pairKey = (studentId, taskCode) => JSON.stringify([studentId, taskCode]);
const emptyPair = () => ({
    aiHelp: 0,
    demo: 0,
    alert: false,
    reflected: false,
    hasRecord: false,
    lastTimestamp: null,
    lastIndex: -1,
    latestGrade: null,
    latestGradeIndex: -1
});
const isLater = (timestamp, index, previousTimestamp, previousIndex) =>
    timestamp.localeCompare(previousTimestamp) > 0 ||
    (timestamp === previousTimestamp && index > previousIndex);
const gradeLevel = grade => {
    if (grade.totalScore === 0) return 'zero';
    if (grade.totalScore === grade.maxScore && grade.maxScore > 0) return 'full';
    return 'partial';
};

/**
 * Build class-level dashboard statistics from saved learning records only.
 * @param {Array<object>} records Saved learning records.
 * @param {object|null} dependency Dependency analysis and teacher reviews.
 * @returns {{metrics: object, grid: object, hardTasks: Array<object>}} Dashboard data.
 */
export function buildDashboard (records = [], dependency = null) {
    const input = Array.isArray(records) ? records : [];
    const studentsSeen = new Set();
    const tasksByCode = new Map();
    const pairs = new Map();
    const reflectionStudents = new Set();
    let realModelHelpCount = 0;
    let simulatedHelpCount = 0;

    for (const [index, record] of input.entries()) {
        if (!record || typeof record.studentId !== 'string' || !record.studentId ||
            typeof record.task?.code !== 'string' || !record.task.code) continue;
        // osep_math 臆測階段的紀錄另在「臆測進度」呈現；這張以評分為主的表不列入，避免顯示成「未做」。
        if (typeof record.unit === 'string' && record.unit) continue;

        const {studentId} = record;
        const {code} = record.task;
        const timestamp = timestampOf(record);
        studentsSeen.add(studentId);
        const task = tasksByCode.get(code);
        if (!task) {
            tasksByCode.set(code, {
                code,
                title: record.task.title || code,
                firstTimestamp: timestamp,
                firstIndex: index
            });
        } else if (timestamp.localeCompare(task.firstTimestamp) < 0) {
            task.firstTimestamp = timestamp;
            task.firstIndex = index;
            if (record.task.title) task.title = record.task.title;
        }

        const key = pairKey(studentId, code);
        const pair = pairs.get(key) || emptyPair();
        if (!pair.hasRecord || isLater(timestamp, index, pair.lastTimestamp, pair.lastIndex)) {
            pair.lastTimestamp = timestamp || null;
            pair.lastIndex = index;
        }
        pair.hasRecord = true;

        if (record.type === 'ai') {
            if (record.source === 'nmking') realModelHelpCount++;
            if (record.source === 'mock') simulatedHelpCount++;
            if (record.source === 'nmking' || record.source === 'mock') pair.aiHelp++;
        }
        if (record.type === 'demo') pair.demo++;
        if (record.type === 'reflection' && record.skipped !== true) {
            pair.reflected = true;
            reflectionStudents.add(studentId);
        }
        if (isValidGrade(record) && (!pair.latestGrade ||
            isLater(timestamp, index, timestampOf(pair.latestGrade), pair.latestGradeIndex))) {
            pair.latestGrade = record;
            pair.latestGradeIndex = index;
        }
        pairs.set(key, pair);
    }

    let dependencyAlertCount = 0;
    for (const alert of dependency?.alerts || []) {
        if (alert?.review?.status === 'false_positive') continue;
        dependencyAlertCount++;
        const studentId = alert?.studentId;
        const taskCode = alert?.task?.code;
        if (!studentsSeen.has(studentId) || !tasksByCode.has(taskCode)) continue;
        const key = pairKey(studentId, taskCode);
        const pair = pairs.get(key) || emptyPair();
        pair.alert = true;
        pairs.set(key, pair);
    }

    const students = [...studentsSeen].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const orderedTasks = [...tasksByCode.values()]
        .sort((a, b) => a.firstTimestamp.localeCompare(b.firstTimestamp) || a.firstIndex - b.firstIndex);
    const tasks = orderedTasks.map(({code, title}) => ({code, title}));
    const cells = Object.fromEntries(students.map(studentId => [
        studentId,
        Object.fromEntries(tasks.map(task => {
            const pair = pairs.get(pairKey(studentId, task.code)) || emptyPair();
            const grade = pair.latestGrade;
            const level = grade ? gradeLevel(grade) : 'none';
            return [task.code, {
                level,
                aiHelp: pair.aiHelp,
                demo: pair.demo,
                alert: pair.alert,
                reflected: pair.reflected,
                lastTimestamp: pair.lastTimestamp
            }];
        }))
    ]));

    const ratios = [];
    const hardTasks = tasks.map((task, index) => {
        let notFull = 0;
        let aiHelp = 0;
        let taskStudents = 0;
        for (const studentId of students) {
            const pair = pairs.get(pairKey(studentId, task.code)) || emptyPair();
            const cell = cells[studentId][task.code];
            aiHelp += cell.aiHelp;
            if (!pair.hasRecord) continue;
            taskStudents++;
            if (cell.level !== 'full') notFull++;
            const grade = pair.latestGrade;
            if (grade && Number.isFinite(grade.totalScore) && Number.isFinite(grade.maxScore) && grade.maxScore > 0) {
                ratios.push(grade.totalScore / grade.maxScore);
            }
        }
        return {code: task.code, title: task.title, notFull, aiHelp, students: taskStudents, index};
    }).sort((a, b) => b.notFull - a.notFull || b.aiHelp - a.aiHelp || a.index - b.index)
        .slice(0, 5)
        .map(task => ({
            code: task.code,
            title: task.title,
            notFull: task.notFull,
            aiHelp: task.aiHelp,
            students: task.students
        }));

    return {
        metrics: {
            students: students.length,
            tasks: tasks.length,
            realModelHelpCount,
            simulatedHelpCount,
            dependencyAlertCount,
            studentsWithReflections: reflectionStudents.size,
            averageLastValidScoreRatio: ratios.length ?
                ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null
        },
        grid: {students, tasks, cells},
        hardTasks
    };
}
