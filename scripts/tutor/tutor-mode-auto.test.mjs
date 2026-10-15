// 導師模式自動選擇：教師已設定 AI 時預設真實模型，學生手動選過就不再覆蓋。
// node --test 每個檔案獨立行程，連線 store 是全新狀態；檔內測試依序共用同一個 store。
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const {create, act} = require('react-test-renderer');
const {useTutorConnection} = require('../../src/lib/tutor-connection.js');
const originals = {window: globalThis.window, fetch: globalThis.fetch};
const roots = [];

const serve = aiConfigured => {
    globalThis.window = {location: {protocol: 'http:', hostname: '127.0.0.1'}};
    globalThis.fetch = async () => new Response(JSON.stringify({managed: true, aiConfigured}),
        {headers: {'Content-Type': 'application/json'}});
};
const mount = async () => {
    const state = {};
    const Harness = () => {
        state.api = useTutorConnection();
        return null;
    };
    await act(async () => {roots.push(create(React.createElement(Harness)));});
    return state;
};

afterEach(() => {
    while (roots.length) act(() => roots.pop().unmount());
    for (const [name, value] of Object.entries(originals)) {
        if (typeof value === 'undefined') delete globalThis[name];
        else globalThis[name] = value;
    }
});

test('教師尚未設定 AI：維持模擬練習', async () => {
    serve(false);
    const state = await mount();
    assert.equal(state.api.statusReady, true);
    assert.equal(state.api.aiConfigured, false);
    assert.equal(state.api.mode, 'mock');
});

test('教師設定 AI 後重新讀取狀態：學生未手動選擇時自動改選真實模型', async () => {
    serve(true);
    const state = await mount();
    assert.equal(state.api.aiConfigured, true);
    assert.equal(state.api.mode, 'live');
});

test('無效模式值不算手動選擇：教師移除 AI 後仍跟著改回模擬練習', async () => {
    serve(true);
    const state = await mount();
    act(() => state.api.setMode('other'));
    assert.equal(state.api.mode, 'live');
    serve(false);
    await act(async () => {await state.api.refreshStatus();});
    assert.equal(state.api.mode, 'mock');
});

test('學生手動選擇後，再讀取狀態不覆蓋學生的選擇', async () => {
    serve(true);
    const state = await mount();
    act(() => state.api.setMode('mock'));
    assert.equal(state.api.mode, 'mock');
    await act(async () => {await state.api.refreshStatus();});
    assert.equal(state.api.mode, 'mock');
    serve(false);
    act(() => state.api.setMode('live'));
    await act(async () => {await state.api.refreshStatus();});
    assert.equal(state.api.aiConfigured, false);
    assert.equal(state.api.mode, 'live');
});
