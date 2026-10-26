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
- `38b3e5a`：上述可獨立驗證階段已再次提交並推送至同一 Draft PR。
- `tests/test_sync_subscriptions_browser.py`：1/1 Chromium 整合流程通過。使用實際 app 和官方 Supabase SDK、模擬 HTTP 服務、獨立桌面（1440×1000）與平板觸控（820×1180）瀏覽器 context，實際操作表單／同步按鈕完成上傳、第二端還原、金額修改後同步回桌面、重開、切回訪客；原 ID、還原備份、帳號資料與訪客原始位元組均保留。這不是完整跨裝置驗收，也不是真實 iPad。
- PWA 相關定向檢查 2/2 通過：94 項快取資源的 SHA-256、版本與安裝圖示；`/sumi/` 打包資源校驗 1/1 通過，核對 104 個發佈檔案（含同步模組，不含 `.nojekyll`）。未執行部署。

本輪本地不重複測試合計：82 項同步 Node 測試（30 engine、25 transport、11 local、5 lock、11 controller）、2 項 PWA 定向測試、1 項發佈資源測試、1 項訂閱瀏覽器流程，另有 97 項 SQL 斷言。沒有把此範圍宣稱為完整產品回歸。GitHub PR 的既有 CI 會在推送後自動跑原本的完整工作流程。

## 2026-10-26：付款歷史與凍結匯率整合驗收

沿用 `feat/cloud-sync-stage9-wip` / Draft PR #10，開始時本機與遠端均為 `1e57397`，工作區乾淨。上一輪 [完整 CI](https://github.com/meropideadpt-lgtm/sumi/actions/runs/40282710654) 的最終結論已確認為 **success**。main 仍為 `927ec27`，新圖示保持原樣。本輪不開發 Logo、設定同步或任何原生應用。

### 沿用的既有實作

- `app.js` 的付款確認、失敗記錄、補錄、編輯、刪除及 `changePayment` 已把付款與續費日期放入同一次本地寫入。
- `exchange.js` 的 `freeze` / `revise` / `valuePayment` 已保存並使用確認當時的匯率矩陣；編輯日期不重建快照，明確修改金額才以舊矩陣修訂換算結果，保持原確認時間。參考匯率更新不會自動回算歷史付款。
- 同步引擎、傳輸層與 SQL 已具有付款逐記錄版本、原子批次、重複 operation 回執、付費帳期唯一、墓碑及父子關聯衝突。先前已有單元測試與本地 SQL 驗證；本輪補上實際表單／官方 SDK／模擬 RPC 的應用整合驗收。

### 本輪修改與結果

新增 `tests/test_sync_payments_browser.py`，沿用上一輪的 `SubscriptionCloud` 模擬服務；僅在該測試夾具加入請求記錄、遺失回執、讀回失敗及付款業務衝突掛鉤。所有業務變更經由實際表單、確認按鈕、JSON 匯入／匯出及同步選擇操作，沒有在測試中替換 app、同步引擎或 SDK。

| 新增的瀏覽器流程 | 驗證結果 |
| --- | --- |
| 成功付款、失敗付款、補錄、修改與刪除 | 成功付款與月底續費日期同批同步；失敗付款沒有成功匯率快照、不推進帳期；補錄可保留無帳期關聯。日期編輯保留完整快照，明確修改金額使用原凍結矩陣。刪除成功付款傳播墓碑並正確回復未付款帳期。 |
| 跨裝置還原與匯率刷新 | 平板原有付款先保存在本地還原備份中，不會被偷偷上傳；從雲端還原後，兩端手動更新參考匯率及重新整理均保持付款原值、ID 和快照。 |
| 舊資料精度與擴展欄位 | 既有多位小數原始金額、重複小數匯率及巢狀擴展欄位，經上傳、手機還原、日期編輯、更新匯率及 JSON 匯出仍逐值一致；缺少歷史匯率的舊付款不補算。 |
| 離線修改、重開與中斷續傳 | 待同步 operation ID 及付款內容跨重開保留；服務端提交後遺失回執時使用同一 ID／同一內容重試，版本只增加一次。即使收到成功回執，讀回失敗仍保留佇列，恢復後才能清除。 |
| 同帳期重複確認 | 同端雙擊及兩端確認同一帳期不產生兩筆雲端成功付款、不重複推進續費；跨端競爭顯示 `paid-cycle` 衝突，保留本地版本並要求明確選擇。 |
| 同筆付款衝突與訂閱刪除 | 同筆金額的兩個版本及各自快照完整顯示，分別驗證選用雲端／本地版本；刪除訂閱與付款同批發送，離線付款修改不能靜默復活已刪除的訂閱或成為雲端孤兒。 |

本輪沒有發現需修復的產品缺陷；**未修改任何應用程式 JS、同步引擎、傳輸層、控制器、SQL、圖示或工作流程**。首次執行有兩項測試錯把付款陣列位置視為跨裝置不變條件；修正為保留重複筆數檢查的完整記錄比對，不忽略 ID、金額、快照或擴展欄位。未為了讓測試通過而修改同步資料排序。

測試結果（不重複計數）：

- 新增付款整合：**6/6** 通過。先執行六項，修正比較方式後只重跑受影響的兩項；補上還原前付款備份斷言後只重跑該流程。
- 既有訂閱瀏覽器流程：**1/1** 通過。
- `test_billing.cjs`、`test_exchange.cjs`、`test_sync_engine.cjs`：**71/71** 通過（19 + 22 + 30）。
- PWA 資源雜湊／版本及圖示定向測試：**2/2** 通過；94 項快取資源仍正確，無需重新產生 `sw-assets.js`。
- `/sumi/` 發佈資源定向驗證：**1/1** 通過，涵蓋 104 個發佈檔案。
- 本輪未在本地重跑完整產品套件或未變動的 SQL 權限套件；PR 推送會自動觸發既有 CI。`1e57397` 的通過結果不代表本輪新提交的 CI 結論。

可重現本輪相關驗證：

```sh
PYTHONPATH=tests python -m unittest test_sync_payments_browser test_sync_subscriptions_browser -v
node --test tests/test_billing.cjs tests/test_exchange.cjs tests/test_sync_engine.cjs
node --test --test-name-pattern='generated shell manifest|manifest supports scoped' tests/test_pwa.cjs
PYTHONPATH=tests python -m unittest test_pages_verify.PagesVerifyTests.test_real_packaged_release_verifies_all_published_resources_including_auth -v
```

範圍與限制：使用實際 Sumi、現有官方 SDK、獨立 Chromium context（桌面 1440×1000、平板觸控 820×1180、手機觸控 390×844），GoTrue／RPC／Frankfurter 均為模擬回應。離線情境使 Auth／RPC／FX 請求失敗並將 `navigator.onLine` 設為 false；重開時靜態殼仍由本地測試伺服器提供，Service Worker 關閉，並非本輪重新驗收完整 PWA 斷網啟動。精度保留依現有 JavaScript 數值模型逐值檢查；換算結果繼續沿用原本貨幣小數位規則，不宣稱支援任意精度十進位。

**尚未完成真實 Supabase、RLS／Storage HTTP、實體 iPadOS Safari／Android 驗證。正式資料庫未修改，未執行遠端 SQL，未合併或部署。** 此輪完成付款與凍結匯率的模擬整合驗收後停止。

## 2026-10-26：資料庫啟動穩定性、Logo 與偏好整合驗收

本輪恢復時，工作區乾淨，原分支與遠端均為 `f6ce237`；沿用 Draft PR #10，未建立新 PR。上輪 [Actions run 40288141007](https://github.com/meropideadpt-lgtm/sumi/actions/runs/40288141007) **第 2 次執行已 completed / success**，包含資料庫及瀏覽器工作；初次失敗不能再描述為目前最終結果。main 仍為 `927ec27`，PR #9 圖示保持不變。

### 已確認的啟動競態及修正

- 舊腳本以 Unix socket 的 `pg_isready` 判斷就緒。固定摘要的官方 PostgreSQL 17 映像在 initdb 時會啟動僅監聽 socket 的暫時伺服器，隨後停止，再啟動正式伺服器。
- 已在 `--network none` 容器以受控初始化腳本重現：初始化仍在進行時，舊檢查退出碼為 **0**，TCP `pg_isready` 為 **2**；正式伺服器啟動後 TCP `SELECT 1` 才成功。這確認了腳本本身的競態。舊失敗工作的詳細日誌下載仍受環境政策以 403 阻擋，**不能宣稱已證明那次歷史失敗的唯一原因**。
- 新增 `scripts/sync-db-ready.sh`：最長 60 秒就緒期限，每次 Docker／SQL 探測最長 3 秒，連線自身逾時 2 秒；檢查容器仍執行，並對 `127.0.0.1` 執行 `SELECT 1`。後續 SQL 使用同一 TCP 端點。
- 只重試就緒探測；migration、RLS、並行測試與停用／重套用不重試，仍使用 `ON_ERROR_STOP=1`，保留原退出碼。失敗時保留執行階段、runner、PostgreSQL 日誌、容器 State、並行 session 輸出，再清理本輪一次性容器及匿名 volume。不收集環境變數或憑據。
- `sync-database` 工作設 5 分鐘上限，新增啟動回歸測試與 `sync-database-diagnostics` artifact（7 天保留）。部署條件沒有改動。
- 5 項測試實際驗證短暫連線失敗後成功、掛起探測超時、容器提前退出、SQL 錯誤只執行一次且保留退出碼 3／診斷，以及真正 Docker 初始化階段拒絕暫時伺服器、接受正式伺服器。最後一項只在資料庫 job 或明確設 `SUMI_TEST_DB_STARTUP=1` 時執行，普通 Python job 明確 skip，避免重複啟動 Docker。

### Logo、分類與偏好驗收

新增 `tests/test_sync_assets_preferences_browser.py`，沿用原 PaymentCloud RPC 夾具、實際 Sumi 表單／JSON 匯入、原官方 Supabase SDK、原同步引擎與傳輸層，補上隔離 Private Storage HTTP 夾具。沒有新增或重寫同步產品模組。

| 流程 | 驗證內容 |
| --- | --- |
| 上傳與跨裝置還原 | PNG／JPEG／WebP 原圖走既有壓縮及 IndexedDB 流程；以實際壓縮後位元組核對 SHA-256、owner/hash 路徑、上傳讀回及第二端圖片。重新整理、登出／登入後 ID、圖片與凍結付款保持一致。可見圖片先捲入視口再驗證解碼，保留原有延遲載入與手機隱藏版面。 |
| 個人偏好與擴展欄位 | 自訂分類、訂閱週期／幣別／金額／續費設定、巢狀服務欄位、自訂分類集合、語言、主題、顯示幣別、提醒及未知業務偏好原值保留。還原後語言、深色主題與下拉選項立即反映。`motion` 保留各裝置本地值，認證資料、工作區選擇、deviceId、FX cache 不進入同步 payload。 |
| 離線與中斷續傳 | 手機離線更換 Logo／分類／偏好，重開後資料及 outbox 完整保留。模擬圖片服務已保存但回執遺失：驗證完成前不推送引用它的訂閱；重試讀回既有物件後成功，只增加一次訂閱版本，不重複或覆蓋圖片。 |
| 跨端衝突 | 兩端對同一 Logo／分類和語言修改，保留本地／雲端兩個版本；透過實際衝突介面分別採用雲端訂閱和本地語言，兩端收斂，付款及凍結匯率不變。 |
| 異常圖片與還原安全 | 錯誤 hash、錯誤 MIME、偽裝 SVG、超過 12 MiB、404、403、斷線都拒絕還原；既有資料、偏好及本地圖片不變。故障解除後成功還原，原本資料及其圖片仍可由還原前備份讀回。 |
| 私有權限與儲存故障 | 官方 SDK 對 A／B／匿名、不可覆蓋、MIME 和大小限制的模擬 HTTP 拒絕結果正確處理；實際 SQL RLS 另以 97 項斷言驗證。IndexedDB 不可用時，經驗證的圖片保留內嵌原值，離線重開、恢復連線後仍維持相同雲端 hash／版本。訪客業務及偏好原始位元組保留，訪客沒有私人 RPC／Storage 呼叫。 |

沒有發現需要修正的產品同步缺陷。開發測試時修正了夾具對 SDK 私有下載端點的假設、對手機隱藏桌面列／延遲圖片的選取，以及訪客重新開啟後可正常刷新參考匯率的斷言；未改動產品行為以迎合測試。真實 Storage 仍負責 JWT 驗證及 bucket MIME／大小限制；此處 HTTP 夾具不能取代真正服務權限驗收，SQL 也不會解碼圖片位元組。

### 本輪測試結果

- 新增 Logo／偏好瀏覽器整合 **6/6 通過**；測試夾具／選取修正後僅重跑受影響流程，不重複宣稱為額外案例。
- 原有訂閱及付款／凍結匯率瀏覽器整合 **7/7 通過**。
- 相關 Node 測試 **104/104 通過**：transport、logo-store、logo-upload、engine、controller、local。
- 資料庫啟動及診斷 **5/5 通過**，包括真正隔離 PostgreSQL 初始化競態測試。
- PostgreSQL migration／RLS／Storage policies／CAS／並行／停用及重套用 **97/97 SQL 斷言通過**。
- PWA 定向檢查 **2/2**、`/sumi/` 發佈資源檢查 **1/1** 通過，仍為 94 項快取資源、104 個發佈檔案。本輪只改測試、CI 腳本與文件，沒有修改 runtime 資源，故 **不重產 `sw-assets.js` 或無故變更快取版本**。
- GitHub 會對本輪提交執行既有完整 CI；最新結果記於 PR #10 的 Checks／PR 描述，不用上輪成功代替本輪結果。部署 job 對 PR 仍應 skipped。

重現命令：

```sh
SUMI_TEST_DB_STARTUP=1 python -m unittest discover -s tests -p test_sync_db_runner.py -v
bash scripts/test-sync-db.sh
PYTHONPATH=tests python -m unittest test_sync_assets_preferences_browser test_sync_subscriptions_browser test_sync_payments_browser -v
node --test tests/test_sync_transport.cjs tests/test_logo_store.cjs tests/test_logo_upload.cjs tests/test_sync_engine.cjs tests/test_sync_controller.cjs tests/test_sync_local.cjs
node --test --test-name-pattern='generated shell manifest|manifest supports scoped' tests/test_pwa.cjs
PYTHONPATH=tests python -m unittest test_pages_verify.PagesVerifyTests.test_real_packaged_release_verifies_all_published_resources_including_auth -v
```

**邊界：**獨立 Chromium 桌面（1440×1000）、平板觸控（820×1180）、手機觸控（390×844）context；Auth／RPC／Storage／匯率皆為隔離模擬服務。離線測試阻斷 API，靜態殼仍由本地伺服器供應、Service Worker 關閉；不宣稱本輪完成真實 PWA 斷網啟動、真實 Supabase HTTP 或實體 iPadOS Safari／Android 驗收。沒有清除或遷移任何使用者資料，沒有執行正式 SQL、合併或部署。本輪到此停止。

## 下一輪範圍（本輪不繼續擴展）

1. 訂閱、付款／凍結匯率、圖片與偏好的模擬整合已完成；下一步是整理完整啟用驗收清單與真實服務／裝置測試，並非直接啟用正式同步。
2. 整理同步狀態介面的邊界提示（例如另一分頁持有寫入鎖）、四語介面、視覺與無障礙驗收；不以本輪的一個瀏覽器流程取代它們。
3. 使用者審核 migration 並明確同意後，再安排 Supabase 測試專案的 Auth/RPC/RLS/Storage 聯調、故障與真實 Safari/Android 驗收。現階段無須在正式控制台執行任何 SQL。
4. 完整第九階段仍是 WIP；未完成項目應分成後續可審查階段，不在此輪一次性完成。

最初 WIP 的遠端 CI：資料庫 job 通過，Node 測試步驟失敗，後續瀏覽器步驟未執行；此時資源雜湊尚未更新。其後 `1e57397` 的完整 CI 已通過，見上節連結；新提交須獨立查看其 Checks。

尚未完成：真實 Supabase RPC/Storage 聯調、真實多裝置與 iPadOS Safari 雲同步、完整應用/視覺回歸及整體第九階段驗收。正式資料庫未修改；既有本地與訪客資料不得刪除或搬移。
