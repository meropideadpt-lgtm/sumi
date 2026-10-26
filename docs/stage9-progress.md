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

本輪只在保存後完成一個可獨立驗證的階段：訂閱上傳、下載與首次還原的安全同步鏈路；不擴展其餘功能，不重寫已有模組。下方將補上實際執行結果與未完成事項。先前執行紀錄不代替本輪驗證。

尚未完成：真實 Supabase RPC/Storage 聯調、真實多裝置與 iPadOS Safari 雲同步、完整應用/視覺回歸及整體第九階段驗收。正式資料庫未修改；既有本地與訪客資料不得刪除或搬移。
