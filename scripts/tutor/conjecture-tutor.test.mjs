// osep_math P5e：臆測階段導師規則——提示不含結論、輸出防洩漏（含換句話說與累積）、階段由服務端決定。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createTutorServer} from './server.mjs';
import {createRecordStore} from './record-store.mjs';
import {stageRuleFor, stageInstructions, guardOutput, safeStageReply} from './stage-rules.mjs';
const require = createRequire(import.meta.url);
const stageWork = require('../../src/lib/conjecture-stage-work.js');
const progressLib = require('../../src/lib/conjecture-progress.js');
const unit = require('../../src/lib/conjecture-units/c2-1.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const fixtureDir = path.join(here, 'fixtures');
const scratch = path.resolve(root, '../../workspace/osep-math/conjecture-tutor');
const harmlessKey = 'harmless-test-token-123';
const ctx = (code, extra = {}) => ({task: {code, title: '階段', description: '說明', examples: []}, blocks: [],
    omittedBlocks: 0, grading: null, ...extra});
const modelSays = payload => () => new Response(JSON.stringify({status: 'completed', output: [
    {type: 'message', content: [{type: 'output_text', text: JSON.stringify(payload)}]}]}),
{headers: {'Content-Type': 'application/json'}});

async function serverFor (t, options = {}) {
    const server = createTutorServer({buildDir: fixtureDir, ...options});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections();
        server.close(resolve);
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(`${base}/api/tutor`, {method: 'POST',
        headers: {'Content-Type': 'application/json', 'Origin': base}, body: JSON.stringify(body)});
    return {post};
}
async function directory (t) {
    await fs.mkdir(scratch, {recursive: true});
    const dir = await fs.mkdtemp(path.join(scratch, 'records-'));
    t.after(async () => {
        if (!path.resolve(dir).startsWith(scratch + path.sep)) throw new Error('OUTSIDE_SCRATCH');
        await fs.rm(dir, {recursive: true, force: true});
    });
    return dir;
}

// 會洩漏結論、理由、判準或名稱的導師回覆（含換句話說）。
const LEAKS = [
    '其實只有 2、5、10 可以只看個位。',
    '想想 10、5 和 2 有什麼共同點。',
    '你可以發現 2 和 5 和 10 都可以。',
    '因為 10 可以被 2 整除，所以十位不用看。',
    '十能被五整除喔。',
    '10 是 2 的倍數，對吧？',
    '10 ÷ 5 剛好分完。',
    '每一包都剛好分完，所以不影響。',
    '十位以上一定能被整除。',
    '4 的倍數要看末兩位。',
    '3 的倍數要把各位數字加起來。',
    '4 不能只看個位。',
    '5 的倍數可以看個位判斷。',
    '看個位沒辦法判斷 6 的倍數。',
    '這就是倍數判別法。'
];
// 正常的引導（不可誤擋）。
const SAFE = [
    '先在右邊多寫幾個 2 的倍數，再看看個位出現了哪些數字。',
    '你說的規律，對哪些倍數成立？用「所有…都…」說清楚。',
    '挑一個小華組資料裡的數，先預測，再用驗算機算 14 ÷ 4。',
    '例子列不完，你要怎麼說服別人每一個都對？',
    '把包數改大一點，剩下的會不會變？為什麼？',
    '卡片 10 那段少了一塊，參考卡片 2 那段把個位加進清單。'
];

test('提示只含本階段的學生可見內容，不含結論、理由或名稱', () => {
    for (const stage of ['EX', 'CG', 'VA', 'GE', 'JU']) {
        const rule = stageRuleFor(`C2-1-${stage}`);
        assert.equal(rule.stage, stage);
        const prompt = stageInstructions(rule);
        assert.ok(prompt.includes(rule.goal));
        const reply = {guidance: prompt, question: ''};
        // 提示本身拿去過防護也必須通過——代表提示沒有夾帶結論。
        assert.deepEqual(guardOutput({...rule, stage: 'EX'}, reply), {ok: true, reason: ''}, stage);
        assert.equal(prompt.includes('reasoning'), stage === 'JU');
    }
    assert.equal(stageRuleFor('114EKeelung-1'), null);
});

test('防護：結論、理由、判準與名稱的各種說法都會攔下；正常引導不誤擋', () => {
    const rule = stageRuleFor('C2-1-VA');
    for (const leak of LEAKS) assert.equal(guardOutput(rule, {guidance: leak, question: '你覺得呢？'}).ok, false, leak);
    for (const safe of SAFE) assert.equal(guardOutput(rule, {guidance: safe, question: '你覺得呢？'}).ok, true, safe);
    // 樣式也檢查 question 欄位。
    assert.equal(guardOutput(rule, {guidance: '很好', question: '10 可以被 2 整除嗎？'}).ok, false);
});

test('防護：累積檢查——分好幾輪各透露一點，合起來命中也要攔下', () => {
    const rule = stageRuleFor('C2-1-GE');
    const first = {guidance: '想想 2 和 5 有什麼共同點。', question: '你覺得呢？'};
    const second = {guidance: '那十位的部分能不能整除呢？', question: '試試看？'};
    // 單獨一輪都只是部分線索，不擋。
    assert.equal(guardOutput(rule, first).ok, true);
    assert.equal(guardOutput(rule, second).ok, true);
    // 合起來就是在一步步拼出結論與理由。
    assert.deepEqual(guardOutput(rule, second, ['想想 2 和 5 有什麼共同點。\n你覺得呢？']),
        {ok: false, reason: 'cumulative'});
    // 學生自己說的話不算導師洩漏（history 只放導師回覆）。
    assert.equal(guardOutput(rule, {guidance: '把包數改大看看。', question: '會變嗎？'}, ['先回到檢核點。']).ok, true);
});

test('防護：提出猜想階段不評斷真假；效化階段可以確認學生驗算出的反例', () => {
    const cg = stageRuleFor('C2-1-CG');
    for (const text of ['你的猜想是對的！', '對！就是這樣。', '這句說法不正確。', '答對了']) {
        assert.equal(guardOutput(cg, {guidance: text, question: '還有呢？'}).ok, false, text);
    }
    assert.equal(guardOutput(cg, {guidance: '說清楚對誰成立。', question: '用「只要…就…」寫寫看？'}).ok, true);
    const va = stageRuleFor('C2-1-VA');
    assert.equal(guardOutput(va, {guidance: '你算出 14 ÷ 4 ＝ 3 … 2，這個例子推翻了那句話。', question: '要怎麼改？'}).ok, true);
});

test('服務端：臆測題目由服務端判定為階段模式；模擬回覆只用學生可見的階段提問', async t => {
    const {post} = await serverFor(t, {fetchImpl: () => {
        throw new Error('UNEXPECTED');
    }});
    const res = await post({mode: 'mock', context: ctx('C2-1-CG'), question: '答案是什麼？', purpose: 'reflection'});
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual({guidance: data.guidance, question: data.question}, (({guidance, question}) => ({guidance, question}))(
        safeStageReply(stageRuleFor('C2-1-CG'))));
});

test('服務端：送上游的提示含階段規則與學生作品、不含結論；一般題目維持原行為', async t => {
    const sent = [];
    const {post} = await serverFor(t, {fetchImpl: async (url, options) => {
        sent.push(JSON.parse(options.body));
        return modelSays({guidance: '先看你寫的 4、6。', question: '個位出現了哪些？'})();
    }});
    let res = await post({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-EX', {stageWork: '我造的例子：4、6'}),
        question: '我卡住了'});
    assert.equal(res.status, 200);
    const system = sent[0].input[0].content;
    assert.ok(system.includes('臆測五階段'));
    assert.ok(sent[0].input.at(-1).content.includes('我造的例子：4、6'));
    for (const forbidden of ['只有 2、5、10', '末兩位', '數字和', '判別法']) assert.equal(system.includes(forbidden), false);
    res = await post({mode: 'live', apiKey: harmlessKey, context: ctx('q1'), question: '我卡住了', purpose: 'stage'});
    assert.equal(res.status, 200);
    assert.equal(sent[1].input[0].content.includes('臆測五階段'), false);
});

test('服務端：模型洩漏結論時改送安全提問，並以 LEAK_FILTERED 記錄給老師（含單元與階段）', async t => {
    const store = createRecordStore(await directory(t));
    const {post} = await serverFor(t, {recordStore: store,
        fetchImpl: modelSays({guidance: '因為 10 可以被 2 整除，十位不用看。', question: '懂了嗎？'})});
    const res = await post({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-JU'), question: '為什麼？',
        learning: {id: 'ai-leak-12345', studentId: 'S01', program: {targets: []}, schemaVersion: 3}});
    const data = await res.json();
    assert.equal(data.filtered, true);
    assert.equal(data.guidance.includes('整除'), false);
    assert.equal(data.reasoning, 'pending');
    const [record] = await store.list();
    assert.equal(record.status, 'completed');
    assert.equal(record.errorCode, 'LEAK_FILTERED');
    assert.equal(record.unit, 'C2-1');
    assert.equal(record.stage, 'JU');
    assert.equal(record.guidance.includes('整除'), false);
});

test('服務端：累積洩漏以先前的導師回覆為依據攔下', async t => {
    const {post} = await serverFor(t, {fetchImpl: modelSays({guidance: '那十位的部分能不能整除呢？', question: '試試看？'})});
    const data = await (await post({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-GE'), question: '然後呢',
        history: [{role: 'user', text: '還有呢'}, {role: 'assistant', text: '想想 2 和 5 有什麼共同點。'}]})).json();
    assert.equal(data.filtered, true);
});

test('服務端：證實階段才傳回說理建議，而且只接受 pending／possible', async t => {
    const {post} = await serverFor(t, {fetchImpl: modelSays({guidance: '你用包數講理由了。', question: '零散呢？',
        reasoning: 'possible'})});
    assert.equal((await (await post({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-JU'), question: '我的理由'}))
        .json()).reasoning, 'possible');
    assert.equal((await (await post({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-GE'), question: '我的理由'}))
        .json()).reasoning, undefined);
    const {post: post2} = await serverFor(t, {fetchImpl: modelSays({guidance: '好', question: '再說說？',
        reasoning: 'teacher_confirmed'})});
    assert.equal((await (await post2({mode: 'live', apiKey: harmlessKey, context: ctx('C2-1-JU'), question: 'x'}))
        .json()).reasoning, undefined);
});

test('面板端：作品摘要只含學生自己寫的內容；導師的說理建議寫進證實的過關判定（by:ai，不是教師確認）', () => {
    const text = stageWork.describeDraft('VA', {tests: [{number: 14, dataFrom: '小華組', conjectureText: '個位偶數就是 4 的倍數',
        prediction: 'refute', computation: '14÷4＝3…2', verdict: 'refutes'}]},
    {CG: {conjecture: {text: '只要個位是 0，就是 10 的倍數。'}}});
    assert.ok(text.includes('我原本的猜想：只要個位是 0'));
    assert.ok(text.includes('14÷4＝3…2'));
    assert.ok(stageWork.describeDraft('JU', {text: 'x'.repeat(5000)}).length <= 1500);
    stageWork.setReasoning('C2-1-JU', 'teacher_confirmed');
    assert.equal(stageWork.getReasoning('C2-1-JU'), null);
    stageWork.setReasoning('C2-1-JU', 'possible');
    const draft = {text: '因為每一包 10 都可以平分，所以只要看零散的。'};
    const result = progressLib.completeStage('JU', draft, unit, {aiReasoning: stageWork.getReasoning('C2-1-JU')});
    assert.equal(result.gate.reasoningStatus, 'possible');
    assert.deepEqual(result.gate.checks.at(-1), {id: 'ai-reasoning-suggestion', met: true, by: 'ai'});
    // 其他階段忽略導師的說理建議。
    const cg = progressLib.completeStage('CG', {text: '只要個位是 0，就是 10 的倍數。'}, unit, {aiReasoning: 'possible'});
    assert.equal(cg.gate.reasoningStatus, 'not_applicable');
});
