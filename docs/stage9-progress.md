# 第九階段恢復檢查點（WIP，禁止直接部署）

## 2026-10-26 恢復與保存

原工作區位於 `/workspace/sumi`，中斷時基於 `039efdd`，未提交的 SQL migration、資料庫測試、同步引擎、傳輸層、控制器、介面及本地儲存整合均已找回。本分支先完整保存這些成果，避免再次中斷造成遺失；這不是第九階段完成或可上線的宣告。

GitHub 最新 main 為 `927ec27`，已合併 PR #9 的黑白 S-dot 圖示。保存檢查點後會將此版本合入本開發分支，保留全部新圖示。不得把本分支合併或部署到 main，也不得對正式 Supabase 執行 migration。

已找回的模組：

- `supabase/`、`scripts/test-sync-db.sh`：可重複 SQL migration、RLS/Storage 權限、版本比對、冪等回執、墓碑及暫停存取腳本；測試僅使用一次性本地 PostgreSQL。
- `sync-engine.js`：逐記錄同步、首次預覽/確認、上傳讀回驗證、還原前備份、離線佇列及衝突處理。
- `sync-transport.js`：官方 SDK RPC、固定帳號驗證、私有圖片雜湊及傳輸驗證。
- `data-store.js`、`workspace.js`、`sync-lock.js`：帳號隔離、業務資料與同步中繼資料的原子日誌、同帳號分頁寫入鎖。
- `sync-controller.js`、`sync-view.js`、語言及 app 整合：未完成完整整合驗收的 WIP。
- 對應的 Node、瀏覽器及 SQL 測試原稿。

本輪只在保存後完成一個可獨立驗證的階段：訂閱上傳、下載與首次還原的安全同步鏈路；不擴展其餘功能，不重寫已有模組。先前執行紀錄不代替本輪驗證。

## 已保存及本輪驗證

- `969ecfc`：完整保存原工作區的 34 個修改／新增檔案，並推送至 `feat/cloud-sync-stage9-wip`，建立 [Draft PR #10](https://github.com/meropideadpt-lgtm/sumi/pull/10)。
- `ca1b0fc`：合入最新 main `927ec27`；`git diff origin/main -- assets/app` 為空，PR #9 的新圖示完整保留。
- 新增 `tests/test_sync_controller.cjs`，串接真實 controller、engine、transport、workspace 與本地原子日誌；只將遠端 RPC 替換成確定性的模擬服務。11 項整合測試通過：明確確認後上傳及讀回、第二裝置還原與修改、空裝置不刪雲資料、還原備份/配額失敗完整回復、離線重開/遺失回執安全重試、過期金額與墓碑衝突、讀回前不清除佇列、過期預覽、帳號切換隔離、未保存草稿保護、同帳號分頁寫入鎖。
- 修正取消預覽後遺留舊錯誤的問題；同時清除控制器及引擎的暫時錯誤，保留持久化資料與佇列，不讓已取消的確認 ID 再次生效。
- 恢復的 engine / transport / local / lock 測試：71/71 通過。修改後 controller + engine：41/41 通過（其中 30 項 engine 與前項重疊，不能相加為不重複測試數）。
- `bash scripts/test-sync-db.sh`：97/97 斷言通過，涵蓋 A/B/匿名權限、owner fence、重複操作、版本、墓碑、Storage policies、並發與非破壞性停用/重套用。容器為 PostgreSQL 17，`--network none`，未接觸正式 Supabase。Storage schema 為相容測試夾具，不能代替真正 Storage HTTP 驗收。
- 更新 PWA 靜態資源清單以納入恢復的同步模組；不部署。本輪只執行相關同步、資源一致性與後續訂閱瀏覽器驗證，不在本地重跑完整產品測試套件。

最初 WIP 的遠端 CI：資料庫 job 通過，Node 測試步驟失敗，後續瀏覽器步驟未執行；此時資源雜湊尚未更新。最終提交的 CI 狀態會另行更新，不將 WIP 檢查點說成全綠。

尚未完成：真實 Supabase RPC/Storage 聯調、真實多裝置與 iPadOS Safari 雲同步、完整應用/視覺回歸及整體第九階段驗收。正式資料庫未修改；既有本地與訪客資料不得刪除或搬移。
