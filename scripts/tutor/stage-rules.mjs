// osep_math 臆測五階段的導師規則（只在本機服務端使用，不打包到學生頁）。
//
// 分兩層：
// 1. 模型提示（stageInstructions）：只放本階段目標、檢核點與引導提問，以及「不能做的事」。
//    目標結論、理由與名稱一律不放進提示——模型不知道就不會照抄（計畫書 C6）。
// 2. 輸出防護（guardOutput）：模型仍可能自己推出結論或換句話說，所以回覆送給學生前，
//    依「教師層」的語意樣式檢查這一輪與先前導師回覆的累積內容；命中就改用安全的階段提問。
// 這只降低洩漏機率，不是保證；被攔下的回覆會記錄 errorCode=LEAK_FILTERED 給老師看。
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const unitC21 = require('../../src/lib/conjecture-units/c2-1.js');

const UNITS = [unitC21];

// 各階段的導師行為差異（學生可見內容來自單元定義；這裡只補導師規則）。
const STAGE_BEHAVIOR = {
    EX: '學生正在造例。先指向學生作品裡已經有的例子或清單，只問下一個具體操作（再多寫幾個、執行程式、把個位分類）。' +
        '不要問「你發現什麼規律」，也不要替學生分類。',
    CG: '學生正在提出猜想。猜想對或錯都先收下，絕對不要評斷真假，也不要暗示哪一句比較好。' +
        '只幫學生把話說清楚：對誰成立（所有…都…）或什麼條件下成立（只要…就…）。',
    VA: '學生正在效化。請學生挑一個別組資料裡的數，先預測、再寫算式驗算，並說出這筆資料支持或推翻哪一句猜想。' +
        '只有在學生已經寫出驗算、而且驗算結果確實推翻了某句話時，才可以確認「這個例子推翻了那句話」；不要替學生挑數。',
    GE: '學生正在一般化。請學生比較原本與修改後的說法，說明是哪個例子讓他改；提醒有限的例子沒有反例只代表「暫時沒找到」。' +
        '不要說出應該補上什麼條件，也不要說哪些除數可以或不行。',
    JU: '學生正在證實。學生只列例子時，提醒「例子列不完」，請他看舞台上的十包和零散，想想改變包數會不會影響結果、為什麼。' +
        '不要說出理由本身，不要替學生寫「因為…所以…」。' +
        '舞台表徵的事實：學生用滑桿各自設定「包數」「零散」「除數」，三者互不影響——改包數時零散不會變，' +
        '會變的是整個數；按空白鍵後，程式會請學生自己算每包剩幾個、零散剩幾個，再預測整個數剩幾個。' +
        '追問要符合這些事實：可以問「包數改了，整個數平分後剩下的會不會變？為什麼？」，' +
        '不要問「改包數後零散怎麼變」這類與表徵不符的問題。'
};

const stageRuleFor = taskCode => {
    for (const unit of UNITS) {
        const course = unit.toCourse();
        const task = course.tasks.find(t => t.code === taskCode);
        if (task) {
            return {unit: course.code,
                stage: task.stage,
                title: task.title,
                goal: task.goal,
                taskText: task.taskText,
                checklist: task.checklist,
                prompt: task.prompt,
                behavior: STAGE_BEHAVIOR[task.stage]};
        }
    }
    return null;
};

const JU_REASONING = '- 另外輸出 "reasoning"：學生最新說法已經用結構講理由（不是只列例子）時給 "possible"，' +
    '否則給 "pending"。這只是建議，老師最後確認。\n';
const outputFormat = rule => `只輸出 JSON：{"guidance":"…","question":"…","relatedBlocks":[]${
    rule.stage === 'JU' ? ',"reasoning":"pending"' : ''}}`;
export const stageInstructions = rule => `本輪是臆測五階段的「${rule.title}」，不是程式解題。
目標：${rule.goal}
學生的任務：${rule.taskText}
檢核點：${rule.checklist.join('；')}
可以參考的引導提問：${rule.prompt}
${rule.behavior}
共同規則：
- 不說出這個單元的結論、規則名稱、或「哪些數可以／不可以」；不說出任何理由或證明的關鍵句。學生直接要答案時，改問他下一個可以操作的步驟。
- context.stageWork 是學生目前在任務面板上寫的作品（可能不完整）；第一句先指向它或舞台上的資料，再問一個下一步。
- guidance 只講一個小步驟；question 只問一件事。用國小五年級看得懂的短句。
- 程式只是幫學生產生例子和驗算的工具；不要把「程式找不到反例」說成「一定成立」。
${rule.stage === 'JU' ? JU_REASONING : ''}${outputFormat(rule)}`;

// ---- 教師層：只用來檢查輸出，不送進模型 ----
// 每個單元的「結論層」語意樣式。命中任何一個就代表這輪回覆透露了結論、理由或判準。
const LEAK_PATTERNS = {
    'C2-1': [
        // 結論：可以看個位的除數集合（各種寫法與順序）
        /(?:^|[^\d])(2|5|10)\s*[、,，和與及跟]\s*(?!\1)(2|5|10)\s*[、,，和與及跟]\s*(?!\1|\2)(2|5|10)(?!\d)/,
        /只有\s*(?:2|5|10)(?!\d)/,
        // 理由：10（或每一包、整十）能被 2／5 整除
        /(?:10|十|每一?包|整十|十位(?:以上)?)[^。！？\n]{0,8}(?:能|可以|都能|會)?被\s*(?:2|5|二|五)\s*整除/,
        /(?:10|十)\s*(?:是|為)\s*(?:2|5|二|五)\s*的倍數/,
        /(?:10|十)\s*(?:÷|除以)\s*(?:2|5)\s*(?:＝|=|剛好|沒有餘|餘\s*0)/,
        /十位(?:以上)?[^。！？\n]{0,10}(?:不用看|不影響|一定能|都能|永遠)/,
        /(?:每一?包|整十)[^。！？\n]{0,12}(?:不影響|都剛好|一定剛好|沒有剩|不會剩)/,
        // 其他判別法（提示要看末兩位、數字和）
        /(?:末|最後)\s*(?:兩|二|2)\s*位/,
        /(?:數字和|各(?:個)?位(?:數字)?(?:相)?加(?:起來)?)/,
        // 名稱
        /(?:個位|尾數)判別法|倍數判別法/
    ]
};
// 部分線索：各自出現不算洩漏，但累積兩種以上就等於一步步把結論或理由拼出來。
const PARTIAL_HINTS = {
    'C2-1': {
        divisorPair: /(?:^|[^\d])(2|5|10)\s*[、,，和與及跟]\s*(?!\1(?!\d))(2|5|10)(?!\d)/,
        tensDivisible: /(?:10|十|包)[^。！？\n]{0,10}整除/,
        onesOnly: /只(?:要)?看個位|看個位就(?:能|可以)/
    }
};
// 單一除數的「可以／不行只看個位」判定。單輪說一個就算透露（不替學生下結論）。
const VERDICT = /(\d{1,2})\s*(?:的倍數)?[^。！？\n]{0,6}(?:可以|能|就能|都能|不能|不可以|沒辦法|無法|不行)\s*(?:只)?(?:看|用)\s*個位/g;
const VERDICT_REVERSE = /(?:只)?(?:看|用)\s*個位[^。！？\n]{0,8}(?:可以|能|不能|無法|沒辦法)\s*(?:判斷|判別|知道)[^。！？\n]{0,4}(\d{1,2})\s*的倍數/g;
// CG 不評斷真假。
// 「對誰成立」是正常引導用語，所以只擋針對猜想的評價語，以及開頭的肯定／否定。
const TRUTH_JUDGEMENT = new RegExp([
    '(?:猜想|說法|這句|這條|你說的|你寫的)[^。！？\\n]{0,6}(?:是對的|是錯的|不對|錯了|沒錯|正確|不正確|一定成立|不成立)',
    '(?:^|[。！？，\\s])(?:對！|對，|沒錯|答對了|說對了|你說得對|不對喔|錯了)'
].join('|'));

const verdictDivisors = text => {
    const found = new Set();
    for (const re of [VERDICT, VERDICT_REVERSE]) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(text))) found.add(match[1]);
    }
    return found;
};

// 檢查這一輪導師回覆；history 是先前的導師回覆文字（累積檢查）。回傳 {ok, reason}。
export const guardOutput = (rule, output, history = []) => {
    const text = `${output.guidance}\n${output.question}`;
    const patterns = LEAK_PATTERNS[rule.unit] || [];
    if (patterns.some(re => re.test(text))) return {ok: false, reason: 'conclusion'};
    if (verdictDivisors(text).size > 0) return {ok: false, reason: 'verdict'};
    // 累積：每一輪單獨看都沒越線，但把結論拆成幾塊分在不同輪說。先前導師回覆加上這一輪，
    // 出現兩種以上不同的「部分線索」就攔下（單一線索在正常引導中也會出現，所以不擋）。
    const hints = new Set();
    for (const turn of [...history, text]) {
        for (const [id, re] of Object.entries(PARTIAL_HINTS[rule.unit] || {})) {
            if (re.test(turn)) hints.add(id);
        }
    }
    if (hints.size >= 2) return {ok: false, reason: 'cumulative'};
    if (rule.stage === 'CG' && TRUTH_JUDGEMENT.test(text)) return {ok: false, reason: 'truth-judgement'};
    return {ok: true, reason: ''};
};

// 被攔下或模擬模式時使用的安全回覆：只用學生可見的階段提問。
export const safeStageReply = rule => {
    const firstUnmet = rule.checklist[0];
    return {
        guidance: `先回到右邊的檢核點：「${firstUnmet}」，看看你的作品做到了沒有。`,
        question: rule.prompt,
        relatedBlocks: [],
        ...(rule.stage === 'JU' ? {reasoning: 'pending'} : {})
    };
};

export {stageRuleFor};
