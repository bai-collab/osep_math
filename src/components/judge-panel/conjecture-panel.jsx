// 此面板固定繁體中文；表單元件沿用題目面板（tutor-tab.jsx）的事件回呼形式。
/* eslint-disable react/jsx-no-literals, react/jsx-no-bind */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import conjectureStageView from '../../lib/conjecture-stage-view.js';
import styles from './conjecture-panel.css';
import {validStudentId, newRecordId, safeProgram, recordContext, postStageRecord, postStageRecordResult}
    from '../../lib/learning-records.js';
import {STAGES, STAGE_LABELS} from '../../lib/conjecture-artifact.js';
import {loadProgress, saveProgress, isUnlocked, checkStage, completeStage, applyCompletion,
    looksLikeEnumeration, CHECK_LABELS} from '../../lib/conjecture-progress.js';
import {applyInjection, readNumberList} from '../../lib/conjecture-vm.js';
import unitC21 from '../../lib/conjecture-units/c2-1.js';
import {describeDraft, setWork, getReasoning} from '../../lib/conjecture-stage-work.js';

/**
 * osep_math 臆測五階段任務面板（取代一般題目的說明／自行測試／評分分頁）。
 *
 * 進入階段：載入該階段乾淨的半成品 sb3，再把前階段作品寫入專案清單（計畫書 W1-1）。
 * 完成階段：程式檢核 → 組作品 → 送出 artifact 與 gate 紀錄 → 活動完成才解鎖下一階段。
 * 說理是否成立不由程式判定（JU 先標「說理待補」）；目標結論不出現在這個元件。
 */

const UNITS = {[unitC21.UNIT_CODE]: unitC21};
// 本頁已自動載入過半成品的「學生＋階段」：同一位學生回到同一階段不再自動覆蓋正在改的畫布；
// 換學生代號時鍵值不同，會重新載入（P6 外審 R3a 第 3 點）。
const autoLoaded = new Set();
const autoLoadKey = (studentId, taskCode) => `${studentId || ''}|${taskCode}`;

const getStorage = () => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
};

const numberValue = value => {
    const n = Number(String(value).trim());
    return Number.isSafeInteger(n) ? n : null;
};

const ChecklistView = ({checks}) => (
    <ul className={styles.checklist}>
        {checks.map(check => (
            <li
                className={check.met ? styles.checkMet : styles.checkPending}
                key={check.id}
            >
                {check.met ? '✓ ' : '○ '}{CHECK_LABELS[check.id] || check.id}
            </li>
        ))}
    </ul>
);
ChecklistView.propTypes = {checks: PropTypes.arrayOf(PropTypes.object).isRequired};

const DIGIT_STATES = ['', 'appeared', 'notAppeared'];
const DIGIT_LABELS = {'': '？', 'appeared': '出現', 'notAppeared': '沒出現'};

const ExampleForm = ({unit, draft, onChange, vm}) => {
    const [inputs, setInputs] = useState({});
    const examples = draft.examples || [];
    const classification = draft.classification || {};
    const addExample = card => {
        const value = numberValue(inputs[card] || '');
        if (value === null || value <= 0) return;
        if (examples.some(e => e.card === card && e.value === value)) return;
        onChange({...draft, examples: [...examples, {card, value, source: 'student'}]});
        setInputs({...inputs, [card]: ''});
    };
    const removeExample = (card, value) => onChange({...draft,
        examples: examples.filter(e => !(e.card === card && e.value === value))});
    const readFromProgram = card => {
        const values = readNumberList(vm, unit.LISTS.multiples(card)) || [];
        const fresh = values.filter(v => v > 0 && !examples.some(e => e.card === card && e.value === v));
        const added = fresh.slice(0, 100).map(value => ({card, value, source: 'program'}));
        onChange({...draft, examples: [...examples, ...added]});
    };
    const cycleDigit = (card, digit) => {
        const current = classification[card] || {appeared: [], notAppeared: []};
        let state = '';
        if (current.appeared.includes(digit)) state = 'appeared';
        else if (current.notAppeared.includes(digit)) state = 'notAppeared';
        const next = DIGIT_STATES[(DIGIT_STATES.indexOf(state) + 1) % DIGIT_STATES.length];
        const appeared = current.appeared.filter(d => d !== digit);
        const notAppeared = current.notAppeared.filter(d => d !== digit);
        if (next === 'appeared') appeared.push(digit);
        if (next === 'notAppeared') notAppeared.push(digit);
        onChange({...draft, classification: {...classification, [card]: {appeared, notAppeared}}});
    };
    return (
        <div>
            {unit.STUDENT_CARDS.map(card => {
                const current = classification[card] || {appeared: [], notAppeared: []};
                return (
                    <section
                        className={styles.card}
                        key={card}
                    >
                        <h4 className={styles.cardTitle}>{`卡片：${card}`}</h4>
                        <div className={styles.row}>
                            <input
                                aria-label={`輸入一個 ${card} 的倍數`}
                                className={styles.input}
                                inputMode="numeric"
                                placeholder={`寫一個 ${card} 的倍數`}
                                value={inputs[card] || ''}
                                onChange={e => setInputs({...inputs, [card]: e.target.value})}
                            />
                            <button
                                className={styles.smallButton}
                                type="button"
                                onClick={() => addExample(card)}
                            >{'加入'}</button>
                            <button
                                className={styles.smallButton}
                                type="button"
                                onClick={() => readFromProgram(card)}
                            >{`讀取程式清單「${unit.LISTS.multiples(card)}」`}</button>
                        </div>
                        <div className={styles.chips}>
                            {examples.filter(e => e.card === card).map(e => (
                                <button
                                    className={e.source === 'student' ? styles.chipStudent : styles.chipProgram}
                                    key={`${e.card}:${e.value}`}
                                    title={e.source === 'student' ? '自己寫的（按一下移除）' : '程式找到的（按一下移除）'}
                                    type="button"
                                    onClick={() => removeExample(e.card, e.value)}
                                >{e.value}</button>
                            ))}
                        </div>
                        <div className={styles.hint}>{'把 0～9 每個個位數字分類：按一下切換「出現／沒出現」。'}</div>
                        <div className={styles.digits}>
                            {Array.from({length: 10}, (_, digit) => {
                                const state = current.appeared.includes(digit) ? 'appeared' :
                                    (current.notAppeared.includes(digit) ? 'notAppeared' : '');
                                return (
                                    <button
                                        aria-label={`${card} 的倍數個位 ${digit}：${DIGIT_LABELS[state]}`}
                                        className={state === 'appeared' ? styles.digitAppeared :
                                            (state === 'notAppeared' ? styles.digitNotAppeared : styles.digit)}
                                        key={digit}
                                        type="button"
                                        onClick={() => cycleDigit(card, digit)}
                                    >
                                        <span className={styles.digitNumber}>{digit}</span>
                                        <span className={styles.digitState}>{DIGIT_LABELS[state]}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
            <label className={styles.label}>
                {'（選填）寫下程式怎麼算出第一個倍數：'}
                <textarea
                    className={styles.textarea}
                    value={draft.trace || ''}
                    onChange={e => onChange({...draft, trace: e.target.value})}
                />
            </label>
        </div>
    );
};
ExampleForm.propTypes = {
    unit: PropTypes.object,
    draft: PropTypes.object,
    onChange: PropTypes.func,
    vm: PropTypes.object
};

const composeConjecture = draft => {
    if (draft.template === 'if-then') return `只要${draft.condition || '＿＿'}，就${draft.conclusion || '＿＿'}。`;
    if (draft.template === 'all') return `所有${draft.scope || '＿＿'}都${draft.conclusion || '＿＿'}。`;
    return draft.freeText || '';
};

const ConjectureForm = ({draft, onChange}) => {
    const update = patch => {
        const next = {...draft, ...patch};
        const filled = next.template === 'free' ? Boolean(next.freeText) :
            (next.template === 'if-then' ? next.condition && next.conclusion : next.scope && next.conclusion);
        onChange({...next, text: filled ? composeConjecture(next) : ''});
    };
    const template = draft.template || 'if-then';
    return (
        <div>
            <div
                className={styles.row}
                role="radiogroup"
                aria-label="猜想句型"
            >
                {[['if-then', '只要…就…'], ['all', '所有…都…'], ['free', '用自己的話']].map(([value, label]) => (
                    <label
                        className={styles.radio}
                        key={value}
                    >
                        <input
                            checked={template === value}
                            name="conjecture-template"
                            type="radio"
                            onChange={() => update({template: value})}
                        />{label}
                    </label>
                ))}
            </div>
            {template === 'if-then' ? (
                <div className={styles.sentence}>
                    {'只要'}
                    <input
                        aria-label="條件"
                        className={styles.input}
                        value={draft.condition || ''}
                        onChange={e => update({condition: e.target.value, template})}
                    />
                    {'，就'}
                    <input
                        aria-label="結論"
                        className={styles.input}
                        value={draft.conclusion || ''}
                        onChange={e => update({conclusion: e.target.value, template})}
                    />
                    {'。'}
                </div>
            ) : null}
            {template === 'all' ? (
                <div className={styles.sentence}>
                    {'所有'}
                    <input
                        aria-label="對象"
                        className={styles.input}
                        value={draft.scope || ''}
                        onChange={e => update({scope: e.target.value, template})}
                    />
                    {'都'}
                    <input
                        aria-label="結論"
                        className={styles.input}
                        value={draft.conclusion || ''}
                        onChange={e => update({conclusion: e.target.value, template})}
                    />
                    {'。'}
                </div>
            ) : null}
            {template === 'free' ? (
                <textarea
                    aria-label="我的猜想"
                    className={styles.textarea}
                    value={draft.freeText || ''}
                    onChange={e => update({freeText: e.target.value, template})}
                />
            ) : null}
            <p className={styles.preview}>{`我的猜想：${draft.text || '（還沒寫完）'}`}</p>
            <p className={styles.hint}>{'對不對先不用管，錯的猜想也很有用，下一階段會拿別組的資料來檢驗。'}</p>
            <label className={styles.radio}>
                <input
                    checked={draft.programCondition === true}
                    type="checkbox"
                    onChange={e => onChange({...draft, programCondition: e.target.checked})}
                />{'（選做）我也改了程式裡的「猜想條件區」'}
            </label>
        </div>
    );
};
ConjectureForm.propTypes = {draft: PropTypes.object, onChange: PropTypes.func};

const PREDICTIONS = [['support', '支持'], ['refute', '推翻'], ['unsure', '不確定']];
// 老師附註沒有結尾標點時補句號，避免和後面的提示黏在一起。
const withPeriod = text => (/[。！？.!?]$/.test(text) ? text : `${text}。`);
const VERDICTS = [['supports', '支持'], ['refutes', '推翻'], ['unclear', '還不確定']];
// 本機草稿可能損壞：找不到對應標籤時顯示「未知」，不讓面板崩潰（P6 外審 R3a 第 2 點）。
const verdictLabel = value => {
    const found = VERDICTS.find(v => v[0] === value);
    return found ? found[1] : '未知';
};

const ValidationForm = ({unit, progress, draft, onChange, onExposure}) => {
    const own = progress.artifacts.CG ? progress.artifacts.CG.conjecture.text : '';
    const [row, setRow] = useState({conjectureRef: 'own',
        number: '',
        dataFrom: unit.VIRTUAL_GROUPS[0].name,
        prediction: 'unsure',
        computation: '',
        verdict: 'unclear'});
    const tests = draft.tests || [];
    const conjectures = [{id: 'own', by: '我', text: own},
        ...(draft.poolOpened ? unit.CONJECTURE_POOL : [])];
    const addTest = () => {
        const number = numberValue(row.number);
        const chosen = conjectures.find(c => c.id === row.conjectureRef);
        if (number === null || number < 0 || !chosen || !chosen.text) return;
        onChange({...draft,
            tests: [...tests, {conjectureRef: chosen.id,
                conjectureText: chosen.text,
                number,
                dataFrom: row.dataFrom,
                prediction: row.prediction,
                computation: row.computation.trim(),
                verdict: row.verdict,
                source: 'student'}]});
        setRow({...row, number: '', computation: ''});
    };
    const openPool = () => {
        onChange({...draft, poolOpened: true});
        onExposure('conjecture-pool', `${unit.UNIT_CODE}-pool`);
    };
    return (
        <div>
            <h4 className={styles.cardTitle}>{'其他組帶來的資料'}</h4>
            {unit.VIRTUAL_GROUPS.map(group => (
                <section
                    className={styles.card}
                    key={group.id}
                >
                    <strong>{`${group.name}（卡片 ${group.cards.join('、')}）`}</strong>
                    {group.cards.map(card => (
                        <div
                            className={styles.dataLine}
                            key={card}
                        >{`${card} 的倍數：${unit.multiplesOf(card, 10).join('、')}`}</div>
                    ))}
                </section>
            ))}
            <h4 className={styles.cardTitle}>{'檢驗一句猜想'}</h4>
            <label className={styles.label}>
                {'要檢驗哪一句？'}
                <select
                    className={styles.input}
                    value={row.conjectureRef}
                    onChange={e => setRow({...row, conjectureRef: e.target.value})}
                >
                    {conjectures.map(c => (
                        <option
                            key={c.id}
                            value={c.id}
                        >{`${c.by}：${c.text}`}</option>
                    ))}
                </select>
            </label>
            <div className={styles.row}>
                <label className={styles.label}>
                    {'用哪個數'}
                    <input
                        className={styles.input}
                        inputMode="numeric"
                        value={row.number}
                        onChange={e => setRow({...row, number: e.target.value})}
                    />
                </label>
                <label className={styles.label}>
                    {'資料來自'}
                    <select
                        className={styles.input}
                        value={row.dataFrom}
                        onChange={e => setRow({...row, dataFrom: e.target.value})}
                    >
                        {[...unit.VIRTUAL_GROUPS.map(g => g.name), '我自己的例子'].map(name => (
                            <option
                                key={name}
                                value={name}
                            >{name}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div
                className={styles.row}
                role="radiogroup"
                aria-label="先預測"
            >
                {'先預測：'}
                {PREDICTIONS.map(([value, label]) => (
                    <label
                        className={styles.radio}
                        key={value}
                    >
                        <input
                            checked={row.prediction === value}
                            name="va-prediction"
                            type="radio"
                            onChange={() => setRow({...row, prediction: value})}
                        />{label}
                    </label>
                ))}
            </div>
            <label className={styles.label}>
                {'驗算（寫出算式）'}
                <input
                    className={styles.input}
                    placeholder="例如 26 ÷ 4 ＝ 6 … 2"
                    value={row.computation}
                    onChange={e => setRow({...row, computation: e.target.value})}
                />
            </label>
            <div
                className={styles.row}
                role="radiogroup"
                aria-label="結果"
            >
                {'結果：這個數'}
                {VERDICTS.map(([value, label]) => (
                    <label
                        className={styles.radio}
                        key={value}
                    >
                        <input
                            checked={row.verdict === value}
                            name="va-verdict"
                            type="radio"
                            onChange={() => setRow({...row, verdict: value})}
                        />{label}
                    </label>
                ))}
                {'這句猜想'}
            </div>
            <button
                className={styles.smallButton}
                type="button"
                onClick={addTest}
            >{'記下這次檢驗'}</button>
            <ol className={styles.testList}>
                {tests.map((t, i) => (
                    <li key={i}>{`${t.number}（${t.dataFrom}）→「${t.conjectureText}」：${t.computation || '未寫算式'}，` +
                        `${verdictLabel(t.verdict)}`}</li>
                ))}
            </ol>
            {draft.poolOpened ? (
                <p className={styles.hint}>{'猜想池已打開：上面的選單多了其他組的猜想，它們是對是錯都還不知道，請挑一句檢驗。'}</p>
            ) : (
                <button
                    className={styles.smallButton}
                    disabled={!tests.some(t => t.source === 'student')}
                    type="button"
                    onClick={openPool}
                >{'打開猜想池（先檢驗過自己的猜想才能打開）'}</button>
            )}
        </div>
    );
};
ValidationForm.propTypes = {unit: PropTypes.object,
    progress: PropTypes.object,
    draft: PropTypes.object,
    onChange: PropTypes.func,
    onExposure: PropTypes.func};

const GeneralizationForm = ({unit, progress, draft, onChange}) => {
    const before = progress.artifacts.CG ? progress.artifacts.CG.conjecture.text : '';
    const marks = draft.divisorMarks || {};
    const vaTests = progress.artifacts.VA ? progress.artifacts.VA.tests : [];
    const setMark = (n, mark) => onChange({...draft,
        before,
        divisorMarks: {...marks, [n]: marks[n] === mark ? '' : mark}});
    return (
        <div>
            <p className={styles.preview}>{`原本的猜想：${before}`}</p>
            {vaTests.length ? (
                <details className={styles.card}>
                    <summary>{`回顧效化時的 ${vaTests.length} 筆檢驗`}</summary>
                    <ol className={styles.testList}>
                        {vaTests.map((t, i) => <li key={i}>{`${t.number}：${t.conjectureText}（${t.computation}）`}</li>)}
                    </ol>
                </details>
            ) : null}
            <label className={styles.label}>
                {'修改後的說法（用「所有／任何／只有…」說清楚範圍和條件）'}
                <textarea
                    className={styles.textarea}
                    value={draft.after || ''}
                    onChange={e => onChange({...draft, before, after: e.target.value})}
                />
            </label>
            <label className={styles.label}>
                {'為什麼要這樣改？（是哪個例子讓你改的？）'}
                <textarea
                    className={styles.textarea}
                    value={draft.reason || ''}
                    onChange={e => onChange({...draft, before, reason: e.target.value})}
                />
            </label>
            <div className={styles.hint}>{'這些除數，你檢驗過了嗎？沒檢驗過的就標「還不知道」。'}</div>
            {unit.CANDIDATE_DIVISORS.map(n => (
                <div
                    className={styles.row}
                    key={n}
                >
                    <span className={styles.divisor}>{n}</span>
                    <button
                        aria-pressed={marks[n] === 'checked'}
                        className={marks[n] === 'checked' ? styles.chipStudent : styles.smallButton}
                        type="button"
                        onClick={() => setMark(n, 'checked')}
                    >{'檢驗過'}</button>
                    <button
                        aria-pressed={marks[n] === 'unknown'}
                        className={marks[n] === 'unknown' ? styles.chipProgram : styles.smallButton}
                        type="button"
                        onClick={() => setMark(n, 'unknown')}
                    >{'還不知道'}</button>
                </div>
            ))}
        </div>
    );
};
GeneralizationForm.propTypes = {unit: PropTypes.object,
    progress: PropTypes.object,
    draft: PropTypes.object,
    onChange: PropTypes.func};

const JustificationForm = ({draft, onChange}) => (
    <div>
        <label className={styles.label}>
            {'我在舞台上操作了什麼？（例如：把 34 拆成 3 包 10 和 4 個）'}
            <input
                className={styles.input}
                value={draft.representation || ''}
                onChange={e => onChange({...draft, representation: e.target.value})}
            />
        </label>
        <label className={styles.label}>
            {'為什麼一定成立？用「因為…所以…」寫出理由'}
            <textarea
                className={styles.textarea}
                value={draft.text || ''}
                onChange={e => onChange({...draft, text: e.target.value})}
            />
        </label>
        {looksLikeEnumeration(draft.text) ? (
            <p className={styles.warning}>{'你好像是在列例子。例子列不完，換個方式想：不管有多少包 10，會不會影響結果？為什麼？'}</p>
        ) : null}
        <p className={styles.hint}>{'程式不會判斷你的理由對不對；導師會陪你想，老師最後會看。'}</p>
    </div>
);
JustificationForm.propTypes = {draft: PropTypes.object, onChange: PropTypes.func};

const ConjecturePanel = ({vm, task, studentId, apiKey, onSelectTask}) => {
    const unit = UNITS[task.unit];
    const stage = task.stage;
    const storage = getStorage();
    // progress.owner 標明這份進度屬於哪個學生代號：代號切換時，舊進度不會被拿去搭配新代號查詢（P6 外審 R4b）。
    const [progress, setProgress] = useState(() =>
        ({...loadProgress(studentId, task.unit, storage), owner: studentId}));
    const [loadStatus, setLoadStatus] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [feedbackStatus, setFeedbackStatus] = useState('');
    const [message, setMessage] = useState('');
    const progressRef = useRef(progress);
    progressRef.current = progress;

    const feedbackSeq = useRef(0);
    useEffect(() => {
        setProgress({...loadProgress(studentId, task.unit, storage), owner: studentId});
        // 換學生代號：清掉前一位學生的老師回饋，作廢還在路上的查詢。
        feedbackSeq.current++;
        setFeedback(null);
        setFeedbackStatus('');
    }, [studentId, task.unit]);

    useEffect(() => {
        conjectureStageView.show();
        return () => conjectureStageView.hide();
    }, []);

    const unlocked = isUnlocked(progress, stage);
    const draft = progress.drafts[stage] || {};
    // 給導師的作品摘要（求助時附上）；每次草稿改變就更新。
    useEffect(() => {
        setWork(task.code, describeDraft(stage, draft, progress.artifacts));
    }, [task.code, stage, draft, progress.artifacts]);

    const send = useCallback((type, payload, recordId = newRecordId(), poster = postStageRecord) => {
        if (!validStudentId(studentId)) return Promise.resolve('未記錄：請先填寫有效的學生代號（作品仍保存在這台電腦）。');
        return poster({id: recordId,
            studentId,
            type,
            status: 'completed',
            task: {code: task.code, title: task.title},
            unit: task.unit,
            stage,
            ...payload,
            ...recordContext(task.code)});
    }, [studentId, task, stage]);

    const recordExposure = useCallback((item, ref) => {
        const current = progressRef.current;
        const key = `${stage}:${item}`;
        if (current.exposures[key]) return;
        const next = {...current, exposures: {...current.exposures, [key]: new Date().toISOString()}};
        setProgress(next);
        saveProgress(studentId, next, storage);
        send('exposure', {exposure: {item, ref}});
    }, [stage, studentId, send, storage]);

    const loadStageProject = useCallback(async () => {
        if (!task.answerProjectUrl) {
            setLoadStatus('這個階段的半成品專案還沒準備好。');
            return;
        }
        setLoadStatus('載入本階段半成品中…');
        try {
            const response = await fetch(task.answerProjectUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await vm.loadProject(await response.arrayBuffer());
            const {missing} = applyInjection(vm, unit.injections(stage, progressRef.current));
            setLoadStatus(missing.length ?
                `已載入半成品，但專案裡找不到清單：${missing.join('、')}（請回報老師）。` :
                '已載入本階段半成品，並帶入你前面階段的作品。');
        } catch (e) {
            setLoadStatus('這個階段的半成品專案還沒準備好，或載入失敗。');
        }
    }, [task, vm, unit, stage]);

    useEffect(() => {
        const key = autoLoadKey(studentId, task.code);
        if (!unlocked || autoLoaded.has(key)) return;
        autoLoaded.add(key);
        loadStageProject();
    }, [unlocked, studentId, task.code, loadStageProject]);

    useEffect(() => {
        if (unlocked && stage === 'VA') recordExposure('virtual-data', `${task.unit}-groups`);
    }, [unlocked, stage, task.unit, recordExposure]);

    const updateDraft = useCallback(next => {
        const updated = {...progressRef.current, drafts: {...progressRef.current.drafts, [stage]: next}};
        setProgress(updated);
        saveProgress(studentId, updated, storage);
    }, [stage, studentId, storage]);

    const {checks} = useMemo(() => checkStage(stage, draft, unit), [stage, draft, unit]);
    const stageIndex = STAGES.indexOf(stage);
    const nextTask = STAGES[stageIndex + 1] ? `${task.unit}-${STAGES[stageIndex + 1]}` : null;
    const gate = progress.gates[stage];

    const handleComplete = async () => {
        const result = completeStage(stage, draft, unit, {aiReasoning: getReasoning(task.code)});
        if (result.error) {
            setMessage('還有欄位沒填完整，先看看上面的檢核點。');
            return;
        }
        const artifactId = newRecordId();
        const completed = applyCompletion(progressRef.current, stage, result);
        setProgress(completed);
        saveProgress(studentId, completed, storage);
        if (stage === 'JU') {
            feedbackSeq.current++;
            setFeedback(null);
            setFeedbackStatus('');
        }
        let program;
        try {
            program = safeProgram(vm, apiKey);
        } catch (e) { /* 程式過大或含金鑰時不附程式快照，作品照常保存。 */ }
        const sent = await send('artifact', {artifact: result.artifact, ...(program ? {program} : {})},
            artifactId, postStageRecordResult);
        const artifactStatus = typeof sent === 'string' ? sent : sent.text;
        // 伺服器確認保存後，才記下作品 id 供之後查老師回饋（id 只存在自己的瀏覽器；P6 外審 R4b）。
        if (typeof sent === 'object' && sent.saved) {
            const latest = progressRef.current;
            const withId = {...latest, artifactIds: {...(latest.artifactIds || {}), [stage]: artifactId}};
            setProgress(withId);
            saveProgress(studentId, withId, storage);
        }
        await send('gate', {gate: result.gate});
        const base = result.gate.activityDone ?
            (stage === 'JU' ? '已完成五個階段的活動。你的理由會標成「說理待補」，請和導師、老師一起確認。' :
                '這個階段的活動完成了，可以前往下一階段。') :
            '作品已保存，但還有檢核點沒做到，完成後再按一次。';
        setMessage(`${base}${artifactStatus ? `（${artifactStatus}）` : ''}`);
    };

    // 證實階段：查詢老師對最近一份作品的回饋（請再說明／確認）。
    // 只使用屬於目前學生代號的進度裡的作品 id。
    const juArtifactId = progress.owner === studentId && progress.artifactIds ? progress.artifactIds.JU : null;
    const loadFeedback = useCallback(async () => {
        const seq = ++feedbackSeq.current;
        const current = () => seq === feedbackSeq.current;
        if (stage !== 'JU' || !juArtifactId || !validStudentId(studentId)) {
            setFeedback(null);
            setFeedbackStatus('');
            return;
        }
        setFeedbackStatus('查看老師回饋中…');
        try {
            const query = `artifactId=${encodeURIComponent(juArtifactId)}&studentId=${encodeURIComponent(studentId)}`;
            const response = await fetch(`./api/student/reasoning-feedback?${query}`);
            if (!current()) return;
            if (response.status === 404) {
                setFeedback(null);
                setFeedbackStatus('老師還看不到這份理由，請稍後再查。');
                return;
            }
            if (!response.ok) throw new Error('fail');
            const data = await response.json();
            if (!current()) return;
            setFeedback(data.review);
            setFeedbackStatus(data.review ? '' : '老師還沒看你的理由。');
        } catch (e) {
            if (!current()) return;
            setFeedback(null);
            setFeedbackStatus('現在查不到老師回饋（可能沒有連上本機服務）。');
        }
    }, [stage, juArtifactId, studentId]);
    useEffect(() => {
        loadFeedback();
    }, [loadFeedback]);

    if (!unit) return <p className={styles.panel}>{'找不到這個單元的設定。'}</p>;

    const formProps = {unit, progress, draft, onChange: updateDraft, vm, onExposure: recordExposure};
    return (
        <div className={styles.panel}>
            <nav
                aria-label="五個階段"
                className={styles.stepper}
            >
                {STAGES.map(s => {
                    const open = isUnlocked(progress, s);
                    const done = progress.gates[s] && progress.gates[s].activityDone;
                    return (
                        <button
                            aria-current={s === stage ? 'step' : null}
                            className={s === stage ? styles.stepActive : (open ? styles.step : styles.stepLocked)}
                            disabled={!open}
                            key={s}
                            title={open ? STAGE_LABELS[s] : '先完成前一個階段'}
                            type="button"
                            onClick={() => onSelectTask(`${task.unit}-${s}`)}
                        >{`${done ? '✓' : (open ? '' : '🔒')}${STAGE_LABELS[s]}`}</button>
                    );
                })}
            </nav>
            {unlocked ? (
                <React.Fragment>
                    <p className={styles.goal}>{task.goal}</p>
                    <p className={styles.taskText}>{task.taskText}</p>
                    <div className={styles.row}>
                        <button
                            className={styles.smallButton}
                            type="button"
                            onClick={loadStageProject}
                        >{'重新載入本階段半成品（作品會保留）'}</button>
                    </div>
                    {loadStatus ? <p
                        aria-live="polite"
                        className={styles.hint}
                    >{loadStatus}</p> : null}
                    {stage === 'JU' && juArtifactId ? (
                        <section
                            aria-live="polite"
                            className={feedback && feedback.status === 'needs_work' ? styles.feedbackNeedsWork :
                                styles.feedback}
                        >
                            <h4 className={styles.cardTitle}>{'老師回饋'}</h4>
                            {feedback && feedback.status === 'needs_work' ? (
                                <p>{`老師請你再說明${feedback.note ? `：${withPeriod(feedback.note)}` : '。'}` +
                                    '修改下面的理由後，再按一次「完成本階段」。'}</p>
                            ) : null}
                            {feedback && feedback.status === 'teacher_confirmed' ? (
                                <p>{`✓ 老師確認了你的理由${feedback.note ? `：${withPeriod(feedback.note)}` : '。'}`}</p>
                            ) : null}
                            {feedbackStatus ? <p className={styles.hint}>{feedbackStatus}</p> : null}
                            <button
                                className={styles.smallButton}
                                type="button"
                                onClick={loadFeedback}
                            >{'重新查看老師回饋'}</button>
                        </section>
                    ) : null}
                    <h4 className={styles.cardTitle}>{'檢核點'}</h4>
                    <ChecklistView checks={checks} />
                    <div className={styles.form}>
                        {stage === 'EX' ? <ExampleForm {...formProps} /> : null}
                        {stage === 'CG' ? <ConjectureForm {...formProps} /> : null}
                        {stage === 'VA' ? <ValidationForm {...formProps} /> : null}
                        {stage === 'GE' ? <GeneralizationForm {...formProps} /> : null}
                        {stage === 'JU' ? <JustificationForm {...formProps} /> : null}
                    </div>
                    <button
                        className={styles.completeButton}
                        type="button"
                        onClick={handleComplete}
                    >{'完成本階段'}</button>
                    {message ? <p
                        aria-live="polite"
                        className={styles.message}
                    >{message}</p> : null}
                    {gate && gate.activityDone && nextTask ? (
                        <button
                            className={styles.completeButton}
                            type="button"
                            onClick={() => onSelectTask(nextTask)}
                        >{`前往下一階段：${STAGE_LABELS[STAGES[stageIndex + 1]]}`}</button>
                    ) : null}
                </React.Fragment>
            ) : (
                <p className={styles.locked}>{'這個階段還沒解鎖：請先完成前一個階段。'}</p>
            )}
        </div>
    );
};

ConjecturePanel.propTypes = {
    apiKey: PropTypes.string,
    onSelectTask: PropTypes.func.isRequired,
    studentId: PropTypes.string,
    task: PropTypes.shape({
        code: PropTypes.string.isRequired,
        title: PropTypes.string,
        unit: PropTypes.string.isRequired,
        stage: PropTypes.oneOf(STAGES).isRequired,
        goal: PropTypes.string,
        taskText: PropTypes.string,
        answerProjectUrl: PropTypes.string
    }).isRequired,
    vm: PropTypes.object.isRequired
};

export default ConjecturePanel;
