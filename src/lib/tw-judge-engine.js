/**
 * MVP-33-2：純解題模式的評分引擎。
 *
 * 技術路徑（已用.scratch-work/mvp33-headless-test.js、verify-sb3-file.js headless驗證過）：
 * 攔截scratch-vm runtime的QUESTION/ANSWER/SAY事件，模擬「詢問並等待」的作答，並只採計
 * looks_say（「說出」）內容作為評分依據——跟BlocklyYdws main.js的規則（只認說出、不認其他
 * 輸出）完全一致，讓學生在兩個平台的心智模型不用切換。
 *
 * 關鍵細節（來自scratch-vm/src/blocks/scratch3_sensing.js的_askNextQuestion()）：
 * 角色visible=true時，「詢問並等待」會把問題文字透過SAY事件echo成說話泡泡，污染評分輸出。
 * 執行評分前必須強制所有非stage角色visible=false，否則捕捉到的內容會混進問題文字本身。
 *
 * clone數上限交給scratch-vm自己的runtimeOptions.maxClones機制把關（不用另外實作）；
 * 逾時保護用固定執行步數上限（MAX_STEPS，一步對應runtime一次_step()，預設30fps）。
 *
 * 2026-08-04擴充題庫時修正：input要比照BlocklyYdws src/main.js的createTokenReader()，
 * 用「空白（含換行）」逐一斷詞、依序回答每一次「詢問並等待」，不能只答第一次問題就不理
 * 後續問題（題目常有2~4次連續詢問，例如M0-02系列）。舊版只答第一題會讓後續問題永遠卡住、
 * 逾時判FAIL。
 *
 * 2026-08-04新增：額外攔截looks_think（「思考」）當作debug輸出擷取進debugOutput——
 * 只用來給SelfTestTab顯示，gradeSubmission/actualOutput比對完全不看這欄，「思考」
 * 積木放心讓學生拿來印偵錯訊息，不會污染評分。
 */

const DEFAULT_MAX_STEPS = 200;
const STEP_INTERVAL_MS = 20;

/**
 * 官方平台（demo.csie.ntnu.edu.tw）對「多筆輸出」的評分不要求輸出用什麼空白字元分隔——
 * 分開多次「說出」（換行接起來）跟合成一次「說出」（自己用空白接好）都算對。用任意空白
 * （含換行、tab、空白）斷詞後逐token比對，忽略用哪種空白字元分隔，但保留token順序
 * （不能變成集合比對，順序錯仍要判錯）。
 */
const normalizeForCompare = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).join(' ');

/**
 * 對一個已經loadProject完成的VM執行單一測資。
 * @param {VM} vm 已經呼叫過vm.start()、且所有非stage角色已強制visible=false的VM實例
 * @param {{input: string, expectedOutput: string}} testCase 單一測資
 * @param {{maxSteps: number}} options 逾時步數上限
 * @returns {Promise<{actualOutput: string, pass: boolean, timedOut: boolean}>}
 */
const runTestCase = (vm, testCase, options = {}) => {
    const maxSteps = options.maxSteps || DEFAULT_MAX_STEPS;

    const tokens = String(testCase.input ?? '').trim().length > 0
        ? String(testCase.input ?? '').trim().split(/\s+/)
        : [];
    let tokenIndex = 0;

    return new Promise(resolve => {
        const capturedSay = [];
        const capturedThink = [];

        const onQuestion = question => {
            if (question === null) return;
            const value = tokenIndex < tokens.length ? tokens[tokenIndex] : '';
            tokenIndex += 1;
            vm.runtime.emit('ANSWER', value);
        };
        const onSay = (target, type, text) => {
            if (type === 'say') capturedSay.push(text);
            else if (type === 'think') capturedThink.push(text);
        };

        vm.runtime.on('QUESTION', onQuestion);
        vm.runtime.on('SAY', onSay);

        const cleanup = () => {
            clearInterval(stepTimer);
            vm.runtime.off('QUESTION', onQuestion);
            vm.runtime.off('SAY', onSay);
        };

        let stepCount = 0;
        const stepTimer = setInterval(() => {
            stepCount += 1;
            if (stepCount > maxSteps) {
                cleanup();
                resolve({
                    actualOutput: capturedSay.join('\n'),
                    debugOutput: capturedThink.join('\n'),
                    pass: false,
                    timedOut: true
                });
                return;
            }
            if (vm.runtime.threads.length === 0 && stepCount > 1) {
                cleanup();
                const actualOutput = capturedSay.join('\n');
                resolve({
                    actualOutput,
                    debugOutput: capturedThink.join('\n'),
                    pass: normalizeForCompare(actualOutput) === normalizeForCompare(testCase.expectedOutput),
                    timedOut: false
                });
            }
        }, STEP_INTERVAL_MS);

        vm.greenFlag();
    });
};

/**
 * 對一組測資跑完整評分，並依BlocklyYdws的testCase.score欄位加總分數。
 * 呼叫前必須已經vm.start()並強制非stage角色visible=false（見上方說明）。
 * @param {VM} vm 已初始化的VM實例
 * @param {Array<{input: string, expectedOutput: string, score: number}>} testCases 測資清單
 * @param {{maxSteps: number}} options 逾時步數上限
 * @returns {Promise<{totalScore: number, maxScore: number, results: Array}>}
 */
const gradeSubmission = async (vm, testCases, options = {}) => {
    const results = [];
    for (const testCase of testCases) {
        // eslint-disable-next-line no-await-in-loop
        const result = await runTestCase(vm, testCase, options);
        results.push({...testCase, ...result});
    }
    const totalScore = results.reduce((sum, r) => sum + (r.pass ? (r.score || 0) : 0), 0);
    const maxScore = testCases.reduce((sum, tc) => sum + (tc.score || 0), 0);
    return {totalScore, maxScore, results};
};

/**
 * 執行評分前的必要準備：強制所有非stage角色visible=false，避免「詢問並等待」的
 * 問題文字echo污染SAY輸出擷取；並開啟turbo模式。
 *
 * 2026-08-20新增turbo模式：scratch-vm非turbo時，sequencer.stepThreads()只要有積木
 * 觸發畫面重繪就會提前中斷這一輪、等下一個約33ms（30fps）的frame才繼續（見
 * node_modules/scratch-vm/src/engine/sequencer.js的stepThreads()），這是為了讓學生
 * 看動畫用的節流機制。osep-judge舞台本來就強制隱藏（純文字I/O評分，沒有視覺內容），
 * 不需要這個節流，但迴圈/清單愈重的題目（排序、圖論等）會被拖得愈慢，實測有題目在真實
 * 瀏覽器分頁跑超過30秒還沒評分完（headless不受影響，因為headless本來就沒有畫面重繪
 * 這個概念）。vm.setTurboMode(true)只影響執行速度、不影響執行順序或邏輯結果。
 * @param {VM} vm VM實例
 */
const prepareVmForGrading = vm => {
    vm.runtime.targets.forEach(target => {
        if (!target.isStage) target.visible = false;
    });
    vm.setTurboMode(true);
};

module.exports = {
    runTestCase,
    gradeSubmission,
    prepareVmForGrading,
    DEFAULT_MAX_STEPS
};
