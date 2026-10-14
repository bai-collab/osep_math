import React, {useState} from 'react';
import PropTypes from 'prop-types';
import styles from './judge-panel.css';

/**
 * MVP-33後續（方案C）：課程/題目瀏覽清單，取代BlocklyYdws的courseCode輸入代碼方式。
 * 對這個年齡層的學生（M0~M2難度標籤是基礎程度）用點選清單比打代碼直覺，
 * 且完全活在現有React SPA架構裡，不用另外維護靜態頁面。
 *
 * 2026-08-04：課程組標題可點選折疊/展開（題目多了以後清單會越來越長）。
 * 預設全部展開，折疊狀態只存在這個元件的state，不記憶跨session。
 *
 * 2026-08-04（版權保護）：每個課程組改回需要輸入代碼才能解鎖，解鎖狀態存在localStorage，
 * 同一台電腦同一個瀏覽器下次開不用重打。**這只是降低隨手瀏覽到的機率，不是真正的
 * 存取控制**——純靜態網站，代碼本身還是打包在公開JS檔案裡，用開發者工具找得到。
 *
 * 2026-08-09：比照BlocklyYdws/blockly-lab現況（JSA00/JSB00公開、其餘課程需代碼），
 * course.unlockCode改成可選——沒有unlockCode（null/undefined）的課程視為公開課程，
 * 一律直接列出。
 *
 * 2026-08-10：需代碼的課程改成「只留一個輸入框」的模式，取代原本每個課程組各自一個
 * 鎖頭+輸入框的畫面——公開課程（JSA00/JSB00）直接列在上面，下面統一一個輸入框，
 * 代碼對了就顯示該課程的題目清單；要換課程，直接把輸入框內容換成新代碼即可
 * （不會同時疊加顯示多個代碼解鎖過的課程，一次只顯示目前代碼對應的那一個）。
 */

const ACTIVE_CODE_STORAGE_KEY = 'osepJudgeActiveCourseCode';

const loadSavedCode = () => {
    try {
        return window.localStorage.getItem(ACTIVE_CODE_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
};

const saveActiveCode = code => {
    try {
        window.localStorage.setItem(ACTIVE_CODE_STORAGE_KEY, code);
    } catch (e) {
        // localStorage不可用，忽略——這次session還是看得到，只是下次要重打代碼
    }
};

// 2026-09-05：題目清單加上順序編號（1. 2. 3. ...），CourseGroup跟下面的CourseTaskList
// （從題目詳情頁「返回題組」用的單一題組清單）共用這個小元件，編號邏輯只需要寫一次。
const TaskRow = ({task, index, onSelectTask}) => (
    <li>
        <button
            className={styles.taskItemButton}
            onClick={() => onSelectTask(task.code)}
        >
            <span>{index + 1}. {task.title}</span>
            <span className={styles.taskDifficulty}>{task.difficultyLabel}</span>
        </button>
    </li>
);
TaskRow.propTypes = {
    index: PropTypes.number.isRequired,
    onSelectTask: PropTypes.func.isRequired,
    task: PropTypes.shape({
        code: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        difficultyLabel: PropTypes.string
    }).isRequired
};

const CourseGroup = ({course, isCollapsed, onToggle, onSelectTask}) => (
    <div className={styles.courseGroup}>
        <button
            className={styles.courseTitleButton}
            onClick={onToggle}
        >
            <span className={isCollapsed ? styles.courseCollapseIconCollapsed : styles.courseCollapseIcon}>▶</span>
            <span>{course.code}｜{course.title}</span>
        </button>
        {!isCollapsed && (
            <ul className={styles.taskItems}>
                {course.tasks.map((task, index) => (
                    <TaskRow
                        index={index}
                        key={task.code}
                        onSelectTask={onSelectTask}
                        task={task}
                    />
                ))}
            </ul>
        )}
    </div>
);
CourseGroup.propTypes = {
    course: PropTypes.shape({
        code: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        tasks: PropTypes.array.isRequired
    }).isRequired,
    isCollapsed: PropTypes.bool,
    onSelectTask: PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired
};

// 2026-09-05：從題目詳情頁按「返回題組」時用——只顯示「剛剛那一題所屬課程」的題目清單，
// 不是整個TaskList（全部課程＋解鎖輸入框），解掉「解完題只能回到最上層列表，每次都要
// 重新展開/輸入代碼才能繼續下一題」的問題。
const CourseTaskList = ({course, onBack, onSelectTask}) => (
    <div className={styles.taskList}>
        <button
            className={styles.backToAllCoursesButton}
            onClick={onBack}
        >
            ← 全部課程
        </button>
        <h3 className={styles.sectionHeading}>{course.code}｜{course.title}</h3>
        <ul className={styles.taskItems}>
            {course.tasks.map((task, index) => (
                <TaskRow
                    index={index}
                    key={task.code}
                    onSelectTask={onSelectTask}
                    task={task}
                />
            ))}
        </ul>
    </div>
);
CourseTaskList.propTypes = {
    course: PropTypes.shape({
        code: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        tasks: PropTypes.array.isRequired
    }).isRequired,
    onBack: PropTypes.func.isRequired,
    onSelectTask: PropTypes.func.isRequired
};

const TaskList = ({courses, onSelectTask}) => {
    // 2026-08-10：公開課程（JSA00/JSB00）進入平台時預設收合，避免一進來就被一長串題目
    // 清單洗版——只有需要代碼的課程（輸入代碼後才出現）維持預設展開。
    const [collapsed, setCollapsed] = useState(() => {
        const initial = {};
        courses.filter(course => !course.unlockCode).forEach(course => {
            initial[course.code] = true;
        });
        return initial;
    });
    const [codeInput, setCodeInput] = useState(() => loadSavedCode());
    const [activeCode, setActiveCode] = useState(() => loadSavedCode());
    const [error, setError] = useState(false);

    const publicCourses = courses.filter(course => !course.unlockCode);
    const privateCourses = courses.filter(course => course.unlockCode);

    const toggleCourse = code => setCollapsed(prev => ({...prev, [code]: !prev[code]}));

    const handleSubmit = () => {
        const trimmed = codeInput.trim();
        if (!trimmed) return;
        const matched = privateCourses.find(course => trimmed.toLowerCase() === course.unlockCode.toLowerCase());
        if (matched) {
            setActiveCode(trimmed);
            saveActiveCode(trimmed);
            setError(false);
        } else {
            setError(true);
        }
    };

    const activeCourse = privateCourses.find(
        course => activeCode && activeCode.toLowerCase() === course.unlockCode.toLowerCase()
    );

    return (
        <div className={styles.taskList}>
            <h3 className={styles.sectionHeading}>選擇題目</h3>

            {publicCourses.map(course => (
                <CourseGroup
                    course={course}
                    isCollapsed={!!collapsed[course.code]}
                    key={course.code}
                    onSelectTask={onSelectTask}
                    onToggle={() => toggleCourse(course.code)}
                />
            ))}

            <div className={styles.courseGroup}>
                <div className={styles.unlockRow}>
                    <input
                        className={styles.unlockInput}
                        placeholder="輸入課程代碼載入課程"
                        value={codeInput}
                        onChange={e => {
                            setCodeInput(e.target.value);
                            setError(false);
                        }}
                        onKeyPress={e => {
                            if (e.key === 'Enter') handleSubmit();
                        }}
                    />
                    <button
                        className={styles.unlockButton}
                        onClick={handleSubmit}
                    >
                        載入
                    </button>
                </div>
                {error ? <div className={styles.unlockError}>代碼不正確，請跟老師確認。</div> : null}
            </div>

            {activeCourse ? (
                <CourseGroup
                    course={activeCourse}
                    isCollapsed={!!collapsed[activeCourse.code]}
                    key={activeCourse.code}
                    onSelectTask={onSelectTask}
                    onToggle={() => toggleCourse(activeCourse.code)}
                />
            ) : null}
        </div>
    );
};

TaskList.propTypes = {
    courses: PropTypes.arrayOf(PropTypes.shape({
        code: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        unlockCode: PropTypes.string,
        tasks: PropTypes.array.isRequired
    })).isRequired,
    onSelectTask: PropTypes.func.isRequired
};

export default TaskList;
export {CourseTaskList};
