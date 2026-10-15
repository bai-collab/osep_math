// 此本機試用介面固定繁體中文；小型 hook 元件沿用題目面板的事件回呼形式。
/* eslint-disable react/jsx-no-literals, react/jsx-no-bind */
import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {buildTutorContext} from '../../lib/tutor-context.js';
import {getWork, setReasoning} from '../../lib/conjecture-stage-work.js';
import {readTutorEditor} from '../../lib/tutor-editor.js';
import {groundRelatedBlocks, createTutorBlockHighlight} from '../../lib/tutor-block-highlight.js';
import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
import styles from './tutor.css';
import {useTutorConnection, isTutorServicePage} from '../../lib/tutor-connection.js';
import {useStudentIdentity, validStudentId, newRecordId,
    safeProgram, recordingText, recordContext, markReflected, postSkipReflection} from '../../lib/learning-records.js';

export const TutorTab = ({task, vm, grading, apiKey, mode, toolboxXML, visible = true,
    connection: connectionProp = null, reflectionRequest = null, onReflectionDone = () => {}}) => {
    const sharedConnection = useTutorConnection();
    const connection = connectionProp || sharedConnection;
    const [question, setQuestion] = useState('');
    const [reflectionText, setReflectionText] = useState('');
    const [turns, setTurns] = useState([]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const requestRef = useRef(null);
    const conversationRef = useRef(null);
    const [observationOpen, setObservationOpen] = useState(false);
    const [recordStatus, setRecordStatus] = useState('');
    const {studentId} = useStudentIdentity();
    const [observation, setObservation] = useState(null);
    const highlightRef = useRef(null);
    const turnIdRef = useRef(0);
    const [highlightTargets, setHighlightTargets] = useState([]);
    const [highlightTurn, setHighlightTurn] = useState(null);
    const [highlightStatus, setHighlightStatus] = useState(null);
    // 本機或教師機區網的導師服務頁（http: 同來源）才可求助；GitHub Pages（https:）不呼叫 API。
    const local = isTutorServicePage();

    useEffect(() => () => {
        if (requestRef.current) requestRef.current.abort();
    }, []);
    useEffect(() => {
        const controller = createTutorBlockHighlight({getMainWorkspace: () => (
            LazyScratchBlocks.isLoaded() ? LazyScratchBlocks.get().getMainWorkspace() : null)}, setHighlightStatus);
        highlightRef.current = controller;
        return () => {
            controller.dispose();
            highlightRef.current = null;
        };
    }, []);
    useEffect(() => {
        if (!highlightRef.current) return;
        if (visible && highlightTargets.length) highlightRef.current.show(highlightTargets);
        else highlightRef.current.clear();
    }, [highlightTargets, visible]);

    const observe = () => {
        const editor = readTutorEditor(toolboxXML, LazyScratchBlocks.isLoaded() ? LazyScratchBlocks.get() : null);
        const context = buildTutorContext(task, vm, grading, editor);
        setObservation({total: context.totalBlocks,
            omitted: context.omittedBlocks,
            rendered: editor.renderedBlocks.length,
            renderedOmitted: editor.renderedOmitted,
            workspaceStatus: editor.workspaceStatus,
            availableStatus: editor.availableStatus,
            categories: editor.availableCategories.join('、')});
        return context;
    };
    const refreshObservation = () => {
        try {
            observe();
        } catch (err) {
            setObservation(null);
        }
    };
    useEffect(refreshObservation, [task, toolboxXML]);
    useEffect(() => {
        const conversation = conversationRef.current;
        if (conversation) conversation.scrollTop = conversation.scrollHeight;
    }, [turns]);

    // 求助（help）與評分後說明解題想法（reflection）共用同一條導師連線；成功時回傳 true。
    const sendTurn = async (submittedQuestion, purpose) => {
        if (running) return false;
        setError('');
        if (!local) {
            setError('請從導師服務網址（本機或教師提供的區網網址）開啟；直接開檔或公開網站不會呼叫 API。');
            return false;
        }
        if (mode === 'live' && !connection.managed && !apiKey.trim()) {
            setError('目前教師服務尚未設定真實模型。');
            return false;
        }
        if (apiKey && (submittedQuestion.includes(apiKey) || studentId.includes(apiKey))) {
            setError('請勿把金鑰放在提問或學生代號中。');
            return false;
        }
        const controller = new AbortController();
        setHighlightTargets([]);
        setHighlightTurn(null);
        requestRef.current = controller;
        setRunning(true);
        try {
            const context = observe();
            // osep_math：臆測階段附上學生目前在任務面板寫的作品，讓導師先指向學生自己的作品。
            const stageWork = task.kind === 'conjecture' ? getWork(task.code) : '';
            if (stageWork) context.stageWork = stageWork;
            let learning;
            let recordWarning = '';
            if (validStudentId(studentId)) {
                try {
                    learning = {
                        studentId,
                        id: newRecordId(),
                        program: safeProgram(vm, apiKey),
                        ...recordContext(task.code)
                    };
                } catch (err) {
                    recordWarning = err.message;
                }
            }
            setRecordStatus(recordWarning || (learning ? '記錄準備中…' : recordingText(null)));
            const response = await fetch('./api/tutor', {
                method: 'POST',
                signal: controller.signal,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({mode,
                    ...(connection.managed ? {} : {apiKey: mode === 'live' ? apiKey : null}),
                    purpose,
                    learning,
                    context,
                    question: submittedQuestion,
                    history: turns.slice(-3).flatMap(turn => [
                        {role: 'user', text: turn.question},
                        {role: 'assistant', text: `${turn.guidance}\n${turn.followup}`}
                    ])})
            });
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error('目前網址沒有導師後端；請用 npm run tutor:serve 啟動後開啟 8612 的網頁。');
            }
            const data = await response.json();
            const recordLimit = data.code === 'RECORD_LIMIT' || (data.recording && data.recording.status === 'limit');
            if (!recordWarning) setRecordStatus(recordLimit ? '紀錄已達上限，請教師處理。' : recordingText(data.recording));
            if (!response.ok) throw new Error(data.error || '導師請求沒有完成。');
            if (typeof data.guidance !== 'string' || typeof data.question !== 'string' ||
                !['mock', 'nmking'].includes(data.source)) throw new Error('導師回覆格式不完整。');
            if (controller.signal.aborted) return false;
            const relatedBlocks = groundRelatedBlocks(data.relatedBlocks, context.editor);
            const turnId = ++turnIdRef.current;
            if (task.kind === 'conjecture' && data.reasoning) setReasoning(task.code, data.reasoning);
            setTurns(previous => [...previous, {question: submittedQuestion,
                guidance: data.guidance,
                followup: data.question,
                source: data.source,
                purpose,
                relatedBlocks,
                id: turnId}].slice(-8));
            setHighlightTargets(relatedBlocks);
            setHighlightTurn(turnId);
            return true;
        } catch (err) {
            if (!controller.signal.aborted) setError(err.message || '無法取得導師引導。');
            return false;
        } finally {
            if (!controller.signal.aborted) setRunning(false);
            if (requestRef.current === controller) requestRef.current = null;
        }
    };
    const handleSubmit = async event => {
        event.preventDefault();
        if (!question.trim()) {
            setError('先說說你卡在哪裡，或想確認哪一個步驟。');
            return;
        }
        if (await sendTurn(question.trim(), 'help')) setQuestion('');
    };
    const handleReflectionSubmit = async event => {
        event.preventDefault();
        if (!reflectionText.trim()) {
            setError('用一兩句話說說你的程式怎麼解這題就可以。');
            return;
        }
        if (await sendTurn(reflectionText.trim(), 'reflection')) {
            markReflected(studentId, task.code);
            setReflectionText('');
            onReflectionDone();
        }
    };
    // 「下次再說」只記一筆跳過，不呼叫導師；下次打開評分紀錄會再問。
    const handleReflectionSkip = async () => {
        onReflectionDone();
        if (!validStudentId(studentId)) return;
        setRecordStatus(await postSkipReflection({
            id: newRecordId(),
            studentId,
            type: 'reflection',
            status: 'completed',
            skipped: true,
            task: {code: task.code, title: task.title},
            ...recordContext(task.code)
        }));
    };

    return (
        <section
            className={styles.tutor}
            aria-label="解題導師"
        >
            <header className={styles.windowHeader}>
                <strong>題目：{task.title}</strong>
            </header>
            <div className={styles.observation}>
                <button
                    type="button"
                    aria-expanded={observationOpen}
                    aria-controls="tutor-observation"
                    onClick={() => setObservationOpen(previous => !previous)}
                >{observationOpen ? '收合積木觀察' : '積木觀察（求助時自動更新）'}</button>
                <div
                    id="tutor-observation"
                    hidden={!observationOpen}
                >
                    <p role="status">{connection.managed ? '連線由教師設定；更新觀察不影響設定。' :
                        apiKey ? '金鑰已輸入。更新觀察不需重貼。' : '尚未輸入金鑰；模擬模式可直接使用。'}</p>
                    <span>{observation ? `已讀 ${observation.total} 個積木（含輸入槽）` : '尚未取得積木觀察'}</span>
                    <button
                        type="button"
                        onClick={refreshObservation}
                    >更新觀察</button>
                    <p>{observation && observation.workspaceStatus === 'complete' ?
                        `目前畫布 ${observation.rendered + observation.renderedOmitted} 個；每次求助會重新讀取。` :
                        '畫布觀察尚未就緒，不推測缺少哪些積木。'}</p>
                    <p>{observation && observation.availableStatus !== 'unavailable' ?
                        `可用分類：${observation.categories}${observation.availableStatus === 'partial' ? '（部分）' : ''}` :
                        '積木選單未就緒；導師需向你確認畫面。'}</p>
                    {observation && observation.omitted > 0 && <p>細節省略 {observation.omitted} 個，仍提供種類統計。</p>}
                </div>
            </div>
            {!local && <p role="alert">請從導師服務網址（本機或教師提供的區網網址）開啟此頁面使用導師。</p>}
            <div
                className={styles.conversation}
                aria-label="導師對話紀錄"
                role="log"
                aria-live="polite"
                aria-busy={running}
                ref={conversationRef}
                tabIndex={0}
            >
                {turns.length === 0 && <p className={styles.intro}>
                    先說說你卡在哪裡。導師會參考題目、目前積木及本編輯器的選單，給你下一步與追問。評分仍以「評分」分頁為準。
                </p>}
                {turns.map((turn, index) => (
                    <article
                        className={styles.turn}
                        key={index}
                    >
                        {/* 學生的話與導師回覆分成兩個對話框，避免讀起來混在一起。 */}
                        <section
                            className={styles.studentBubble}
                            aria-label={turn.purpose === 'reflection' ? '你的解題想法' : '你的提問'}
                        >
                            <p className={styles.speaker}>{turn.purpose === 'reflection' ? '你的解題想法：' : '你的提問：'}</p>
                            <p>{turn.question}</p>
                        </section>
                        <section
                            className={styles.tutorBubble}
                            aria-label="導師回覆"
                        >
                            <p className={styles.speaker}>
                                {'導師'}
                                <span className={styles.source}>
                                    {turn.source === 'mock' ? '模擬提示，沒有呼叫模型' : 'NMKING 導師引導'}
                                </span>
                            </p>
                            <div className={styles.step}>
                                <p className={styles.stepLabel}>{turn.purpose === 'reflection' ? '導師回饋：' : '這一輪先做：'}</p>
                                <p>{turn.guidance}</p>
                            </div>
                            <div className={`${styles.step} ${styles.followup}`}>
                                <p className={styles.stepLabel}>接著想一想：</p>
                                <p>{turn.followup}</p>
                            </div>
                            {turn.relatedBlocks.length > 0 && <div className={styles.related}>
                                <p><strong>相關積木：</strong>{turn.relatedBlocks.map(block =>
                                    `${block.kind === 'workspace' ? '畫布' : `選單／${block.category}`}：` +
                                `${block.label || block.opcode}`)
                                    .join('；')}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setHighlightTargets([...turn.relatedBlocks]);
                                        setHighlightTurn(turn.id);
                                    }}
                                >顯示相關積木</button>
                                <button
                                    type="button"
                                    disabled={highlightTurn !== turn.id || !highlightTargets.length}
                                    onClick={() => {
                                        setHighlightTargets([]);
                                        setHighlightTurn(null);
                                    }}
                                >取消高亮</button>
                                {highlightTurn === turn.id && highlightStatus && <p aria-live="polite">
                                    玫紅粗邊：畫布 {highlightStatus.canvas} 個、選單 {highlightStatus.toolbox} 個。
                                    {highlightStatus.missing > 0 ? '部分積木已不在目前畫面，未替換成其他積木。' :
                                        '若被浮窗遮住，可拖動浮窗查看。'}
                                </p>}
                            </div>}
                        </section>
                    </article>
                ))}
            </div>
            {reflectionRequest && <form
                className={styles.reflection}
                aria-label="說說你的解題想法"
                onSubmit={handleReflectionSubmit}
            >
                <p className={styles.source}>解題導師</p>
                <p>
                    你這題評分拿到 {reflectionRequest.totalScore} / {reflectionRequest.maxScore} 分。
                    用你自己的話說說看：你的程式是怎麼一步一步解這題的？
                </p>
                <label
                    className={styles.label}
                    htmlFor="tutor-reflection"
                >我的解題想法</label>
                <textarea
                    disabled={running}
                    id="tutor-reflection"
                    maxLength={1500}
                    placeholder="例如：先用詢問讀入名字，存到變數，再用字串組合說出 Hello 和名字。"
                    rows={3}
                    value={reflectionText}
                    onChange={event => setReflectionText(event.target.value)}
                />
                <div className={styles.reflectionActions}>
                    <button
                        className={styles.submit}
                        disabled={running || !local}
                        type="submit"
                    >{running ? '導師回覆中…' : '送出想法'}</button>
                    <button
                        disabled={running}
                        type="button"
                        onClick={handleReflectionSkip}
                    >下次再說</button>
                </div>
            </form>}
            {error && <p
                className={styles.error}
                role="alert"
            >{error}</p>}
            {recordStatus && <p
                className={styles.recordStatus}
                aria-live="polite"
            >{recordStatus}</p>}
            <form
                className={styles.composer}
                onSubmit={handleSubmit}
            >
                <label
                    className={styles.label}
                    htmlFor="tutor-question"
                >我卡住的地方</label>
                <textarea
                    disabled={running}
                    id="tutor-question"
                    maxLength={1500}
                    placeholder="例如：我輸入數字後，結果和自己算的不一樣。"
                    rows={2}
                    value={question}
                    onChange={event => setQuestion(event.target.value)}
                />
                <button
                    className={styles.submit}
                    disabled={running || !local}
                    type="submit"
                >
                    {running ? '導師回覆中…' : mode === 'mock' ? '取得模擬提示' : '向導師求助'}
                </button>
            </form>
        </section>
    );
};

TutorTab.propTypes = {
    apiKey: PropTypes.string.isRequired,
    connection: PropTypes.shape({
        managed: PropTypes.bool,
        aiConfigured: PropTypes.bool,
        mode: PropTypes.oneOf(['mock', 'live']),
        statusReady: PropTypes.bool
    }),
    grading: PropTypes.object,
    mode: PropTypes.oneOf(['mock', 'live']).isRequired,
    onReflectionDone: PropTypes.func,
    reflectionRequest: PropTypes.shape({
        totalScore: PropTypes.number,
        maxScore: PropTypes.number
    }),
    task: PropTypes.object.isRequired,
    toolboxXML: PropTypes.string,
    visible: PropTypes.bool,
    vm: PropTypes.object.isRequired
};

export default connect(state => ({toolboxXML: state.scratchGui.toolbox.toolboxXML}))(TutorTab);
