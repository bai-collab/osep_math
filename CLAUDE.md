本檔是給 AI 開發助手的內部開發筆記；一般使用者請從 README.md 開始。

# osep_math｜用 Scratch 自學臆測五階段

由 osep-judge（`claude/elegant-fermi-i0vtgw` 分支，含全班儀表板，提交 533c832）衍生。osep-judge 的完整開發歷程留在該 repo 的 `CLAUDE.md` 與 git history，這裡不重複。

## 設計正本

主 repository 的 `planned/26-10-14-osep-math-scratch-conjecturing-plan.md`（第 15～17 節為現行版本）。本 repo 只放實作。

## 沿用自 osep-judge 的部分

- TurboWarp 版 scratch-gui 與評分引擎 `src/lib/tw-judge-engine.js`。
- 評分面板 `src/components/judge-panel/`、浮動導師、積木高亮。
- 本機導師服務 `scripts/tutor/`（`server.mjs`、`provider.mjs`、`record-store.mjs`、`sheets/Code.gs`、教師頁 `teacher/`）。
- 課程資料層 `src/lib/judge-content/`（manifest＋courses 動態載入；`sb3Path` 由 `vm.loadProject` 載入）。

## 已移除（P5a，2026-10-14）

- osep-judge 的題庫與課程（`src/lib/judge-content/courses/*`、`static/judge-content/*`）及產生器 `scripts/judge-dev-tools/*`（只保留 `hand-author-builder.js`，供產生半成品 sb3 參考）。
- 造訪計數器（`workers/visit-counter/` 與面板中的計數）。
- 教學鷹架對照表內容（`SCAFFOLD_MAP` 改為空物件）。

## 與 osep-judge 的關鍵差異（實作時注意）

- osep-judge **刻意隱藏舞台**（純文字 I/O 評分）；osep_math 的百數表、虛擬組員與位值表徵需要可見舞台，P5c 要處理。
- 評分測資只用於造例正確性與反例真偽，**不可用來判定猜想**。
- 目標結論（例如哪些除數可以看個位）不得進入學生端導師提示。
- 使用者用語：一律用「資料」，不用「材料」。

## 已知環境教訓（沿用）

- 改後端後先確認佔用 8612 的程序啟動時間晚於修改時間，再宣稱生效。
- `*.cmd` 必須 CRLF 且只用 ASCII。
- 導師可見文字不可出現積木 id／opcode。
