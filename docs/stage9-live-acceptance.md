# 第九階段：真實服務與發布前驗收

目前是 Draft PR #10 / `feat/cloud-sync-stage9-wip`，不是已發布的雲同步版本。本文件區分「使用者已確認」、「本輪實際觀察」、「自動化模擬」及「尚未驗收」。不要再次執行正式 migration，也不要為了測試開放資料表直接寫入或把 Logo bucket 改為 Public。

## 目前證據

| 項目 | 狀態及證據 |
| --- | --- |
| 正式 migration、四張表、RPC、RLS、Private bucket、原資料 JSON 備份 | **使用者已確認完成**。本助手未執行或重跑正式 SQL，未取得正式 SQL catalog 查詢結果。 |
| PR 起點 | `878a61b`；完整 Actions run `40297611691` success，deploy-pages skipped。 |
| 公開配置 | URL 與使用者提供的 `https://qcboybxjjegdwpbbtbaj.supabase.co` 一致；使用現有 Publishable Key，未使用其他密鑰。這是檔案核對，不代表伺服器已驗證 Key。 |
| 官方 SDK | 既有 `@supabase/supabase-js` 2.118.0；本地原始 bundle 的 SHA-256 與 `assets/vendor/supabase.json` 一致。未更新 SDK。 |
| 真實連線嘗試 | 2026-10-26，以現有公開 Key 對 `/auth/v1/health` 發 GET（Origin 為 GitHub Pages origin）；執行環境代理在 CONNECT 階段回覆 `403 Forbidden`，**尚未到達 Supabase**。不是 Supabase RPC/RLS 的 403，也不能據此認為專案停機。 |
| 環境解鎖 | 已保存網路草稿，僅新增 `qcboybxjjegdwpbbtbaj.supabase.co`，保留其餘網域。需要使用者在雲端環境設定審查、儲存並發布環境；草稿成功保存不代表已套用。不要更改 Supabase RLS 來解決代理問題。 |
| 真實 API / CORS / JWT / RPC / Storage | **未完成**。尚無已授權測試帳號／資料範圍；未執行登入、RPC 或正式物件讀寫測試。 |
| 跨端訂閱、付款、凍結匯率、Logo、分類及偏好 | 前輪模擬驗收已通過；不等同真實 Supabase 或實體裝置驗收。 |

目前不能以自動化 CI 通過作為直接合併／發布的依據。真實連線及以下人工驗收仍是發布阻擋項。

## 不寫入資料的連線檢查

網路設定真正生效後，在可到達專案的環境、此分支根目錄，使用 Node 24.19 或更新版本：

```sh
node --use-env-proxy scripts/check-sync-connectivity.cjs --read-only
```

本輪由於既有 CONNECT 拒絕，**未對正式專案執行此完整工具**；工具安全邊界及官方 SDK 請求串接以模擬 fetch 測試。需要時可由使用者在自己可連線的電腦執行，沒有密碼或 Token 參數。

工具只執行以下 9 個請求：

- GET Auth health／公開 Auth settings，記錄狀態、服務識別、CORS 標頭及公開註冊開關，不輸出整份回應。
- OPTIONS pull／push RPC 路徑及一個虛構圖片路徑，檢查 POST 的 CORS 預檢標頭；**OPTIONS 成功不代表函式存在、RPC 權限正確或可以上傳圖片**。
- 現有官方 SDK 對四張 `sumi_*` 表發匿名 HEAD，固定 `select=owner_id&limit=0`，不下載記錄。依 migration，匿名直接讀取預期遭 401／403 拒絕。空結果或其他狀態不應直接算通過。

工具拒絕 POST／PUT／PATCH／DELETE、RPC 執行、不同 origin、較大的查詢、任意 body、非現有公開 Key 或登入 JWT。它沒有使用者登入、沒有瀏覽器工作區、沒有持久化會話，也不跟隨重新導向；保留環境代理及 TLS 驗證，首個連線失敗即停止，沒有自動重試。回報不含 Key、密碼、Token 或業務資料。

**邊界：**Node 不執行瀏覽器 CORS 政策。標頭符合預期只是一項證據，仍需從測試頁／正式 origin 驗證瀏覽器 fetch。匿名權限拒絕不能證明 A/B 的 RLS 隔離，HTTP 預檢不能證明 RPC 正常執行。

## RPC 與表權限：不要因 API DISABLED 開放寫表

應用程式使用：

- `sdk.rpc('sumi_sync_pull', {p_expected_owner, p_after, p_limit})`
- `sdk.rpc('sumi_sync_push', {p_expected_owner, p_operation_id, p_changes})`

官方 SDK 使用 POST 呼叫現有函式，JWT 由 SDK 管理。`p_expected_owner` 是目前工作區的固定 UUID，伺服器必須另外比對 `auth.uid()`；它不是取代 JWT 的身分憑據。

migration 刻意撤銷四表的直接寫入權限，只授予 authenticated 對 `sumi_sync_records` 的 SELECT；所有業務寫入經過有版本檢查的 RPC。authenticated 擁有兩個 public RPC 的 EXECUTE，anon／PUBLIC 沒有。RPC 以 SECURITY DEFINER 執行，但固定 search_path、從 JWT 派生 owner 並核對工作區。

單一資料表的 **API DISABLED** 標籤不足以判定 RPC 不可用，不要按「開放表寫入」當成修復。若真實呼叫失敗，依實際狀態查：

| 現象 | 檢查方向 |
| --- | --- |
| 代理 CONNECT 403 | 雲端執行環境網路白名單，與 Supabase RLS 無關。 |
| 瀏覽器 CORS／網路錯誤 | 查看安全的 HTTP 狀態、允許 origin／headers、DNS/TLS；不要停用 TLS、改 Public bucket 或修改 RLS。 |
| 已登入仍 401／驗證失敗 | 在自己的瀏覽器重登專用測試帳號；確認 session 未失效、JWT 由 SDK 附帶。不要複製 Token。 |
| `PGRST202`／函式找不到 | 核對專案 Data API 是否啟用、public 是否為 exposed schema、函式名稱和參數簽名、schema cache 狀態。到專案設定的 Data API／API Settings 核對（控制台名稱可能不同），不是開放表直接寫入。不要直接重跑 migration。 |
| 403／`42501` | 區分匿名預期拒絕、工作區與 JWT 不匹配、RPC EXECUTE 權限、Storage owner policy；保存錯誤碼後調查，不能取消 RLS。 |
| 在 GET 模式呼叫 RPC 失敗 | 兩個函式都有寫入／鎖定行為，應用使用 POST；不能以 GET 失敗推斷正常 POST 一定失敗。 |

特別注意：**`sumi_sync_pull` 不是完全唯讀函式。** 它包含 `insert into public.sumi_sync_clock ... on conflict do nothing`，並取得 share lock。第一次按「查看本機與雲端資料」就可能建立同步時鐘；這個動作也要等使用者批准測試寫入範圍，不能把它混進未授權的純連線檢查。此行為保留，未為本輪驗收改動資料庫。

## 專用帳號、資料與測試頁

下列步驟 **尚未執行**，必須先由使用者明確批准。建議批准範圍：正式專案內由使用者管理的專用帳號 A、B；只建立 `S9-ACCEPT-日期` 命名的最多兩筆訂閱、四筆付款、兩張小型測試圖片，以及必要的偏好、成本觀察、clock／operation 回執、版本和墓碑。修改及刪除也只限這些測試資料，不匯入私人備份、不碰私人帳號記錄。

帳號由使用者在 Authentication → Users 建立／確認及輸入密碼，不開放註冊，不把密碼、Token、HAR 或含 Authorization 的 Network 截圖交給助手。若不願在正式專案保留測試資料，可另選隔離 Supabase 測試專案，另行確認公開配置；本輪沒有改配置或建立帳號。

先在電腦取得此 PR 分支的獨立副本，不切換或覆寫自己已有未提交內容。例如在新的目錄：

```sh
git clone --branch feat/cloud-sync-stage9-wip https://github.com/meropideadpt-lgtm/sumi.git sumi-stage9-acceptance
cd sumi-stage9-acceptance
python scripts/build-pages.py --output ../sumi-stage9-preview
python -m http.server 8000 --bind 127.0.0.1 --directory ../sumi-stage9-preview
```

這些是使用者本機指令，不是本助手已部署的預覽網址。輸出目錄必須是新的空位置。用獨立瀏覽器 profile，手動輸入本機 localhost 的 8000 埠；不要匯入正式私人 JSON。先核對 Git commit 與 PR 最新一致。

iPad／Android 需要另行批准的 **獨立 HTTPS 測試 origin**，最好保留 `/sumi/` 路徑以驗收相對資源、PWA scope。不能把同一正式 origin 下另一個目錄當成資料隔離，因為 localStorage／IndexedDB 不按 URL 路徑隔離。LAN 純 HTTP 不能可靠驗證 Web Locks／PWA。**本輪沒有建立或部署這個測試站，也沒有可宣稱已可用的預覽連結。**

## 人工驗收順序（批准後才開始）

1. **A 登入與首次檢查。** 在新的測試 profile 用 A 登入，核對是 A 工作區及預期空的本地／雲端狀態。按「查看本機與雲端資料」；此步可能初始化 A 的 clock。Network 中應看到官方 SDK 的 POST `sumi_sync_pull` 成功，回應含 `version:1`、`records`、字串 `cursor`、布林 `more`。不要回傳原始 payload 或 auth headers 給助手。只有兩個 RPC 應寫業務記錄，不應有資料表 insert/update HTTP 請求。
2. **首次上傳與讀回。** 在 A 建立測試訂閱（例如 USD 11.23、月付），上傳小型 Logo、自訂分類，待參考匯率可用再確認測試付款。明確選「上傳並合併本機資料」。檢查 `sumi_sync_push`、圖片 upload／download 和後續 pull 成功，狀態「已同步」、待同步 0、成功時間更新。未讀回成功時不能顯示已完成。
3. **新裝置還原。** 在第二個獨立裝置／profile 登入同一 A；空本地不應自動清空雲端。明確選「從雲端還原」，核對訂閱／付款 ID、欄位、Logo、分類、語言／主題／顯示幣別／提醒。降低動態效果設定留在各裝置，登入資料不進 JSON 備份。
4. **歷史付款與凍結匯率。** 記下測試 JSON 中該付款的原始金額、幣別、確認時間、匯率矩陣及換算結果；刷新參考匯率、切換顯示幣別、重開及還原後應逐值一致。依授權補錄／修改／刪除測試付款；失敗付款不得成為成功記帳或推進帳期。同帳期雙端確認必須去重或明確衝突，不重複記帳。
5. **真實離線續傳。** 先讓測試 HTTPS 頁的 PWA 資源完成快取。手機斷網後修改測試訂閱／付款／Logo，關閉再開，檢查原資料和待同步數量保留；恢復網路後讀回驗證，另一端取得相同變更。已過期 session 離線無法刷新屬限制，不能把它當成已通過重連測試。精確的「服務已提交但回執丟失」目前仍以模擬測試為證據，不用一次切飛航模式宣稱完整證明。
6. **版本衝突及墓碑。** 兩端對同一測試付款離線修改成不同金額，先後連線；核對兩個版本及凍結快照都保留、沒有靜默覆寫，明確選擇後兩端一致。對授權測試資料驗證刪除後另一端舊資料不會復活；不使用 SQL 刪除回執／墓碑作為「清理」。
7. **B／匿名權限。** 先用 A 確認 A 的測試圖片路徑確實存在且可下載。再在 B 的獨立 profile 驗證不能讀／覆蓋／刪除 A 的測試資料或圖片；匿名也不能讀取相同已存在圖片。404 可能是隱藏拒絕，必須搭配 A 先前成功下載的相同路徑證據。B 對自己資料的正常流程也需成功，避免把所有帳號都被拒絕誤當 RLS 正確。寫入／刪除負向測試同樣需要先批准範圍，建議由後續專項自動化代替手工寫 SQL。
8. **登出與重新登入。** 登出 A 不刪本機資料，不影響其他裝置；重登 A 恢復相同記錄，切訪客看不到 A 的雲端資料且不發私人 RPC／Storage。不要清除網站資料來「修復」任何錯誤。
9. **四語與實機。** 依序檢查 zh-CN／zh-TW／ja-JP／en、深淺主題，初次預覽、離線、失敗、衝突與重試提示；iPad Safari／主畫面 PWA、Android Chrome／已安裝 PWA 的軟鍵盤、下拉選單、旋轉、背景恢復、VoiceOver／TalkBack、讀屏狀態與焦點。另一分頁持鎖時先儲存並關閉該頁再重試；不支援 Web Locks 時應看到升級瀏覽器／安全來源提示，而不是一直重試。

需要自行驗證 SDK pull 時，只有在上述 clock 寫入也獲授權後，才可在自己測試頁 DevTools 使用以下摘要查詢；不要改為輸出 client、session 或完整 records：

```js
(async () => {
  const owner = SumiWorkspace.current();
  if (owner.mode !== 'account') throw Error('請先登入已授權的專用測試帳號');
  const sdk = await SumiAccess.syncClient();
  const {data, error, status} = await sdk.rpc('sumi_sync_pull', {
    p_expected_owner: owner.userId, p_after: '0', p_limit: 1
  });
  console.table([{status, code: error?.code ?? null,
    version: data?.version ?? null, count: data?.records?.length ?? null,
    cursorType: typeof data?.cursor, moreType: typeof data?.more}]);
})();
```

push／Logo 的正向測試使用 Sumi 既有表單與同步按鈕，讓付款、續費、operation ID 和圖片讀回走完整安全路徑。不要在 Console 直接更改本地佇列或手工覆寫同步表。

## 回報與發布門檻

只回報：測試 commit、裝置／瀏覽器版本、測試帳號代號 A/B（不需密碼）、案例編號、通過／失敗、HTTP 狀態與安全錯誤碼、待同步數量、成功時間。截圖遮蔽私人內容；不要提供 HAR、Token、私人 JSON 或整份回應。

| 門檻 | 目前狀態 |
| --- | --- |
| 正式 schema / bucket 安裝 | 使用者確認完成，無需重跑 |
| 本機程式、模擬整合、SQL 權限基線 | 前輪通過；本輪相關 UI／診斷及資源檢查另記於 progress |
| 真實匿名連線／CORS 標頭 | 執行環境網路阻擋，待解除 |
| 已授權 A/B／匿名 JWT、RPC、Storage | 未執行；需要帳號與測試寫入範圍確認 |
| 真實多裝置、離線、衝突、Logo 與凍結匯率 | 未執行 |
| 真實 iPadOS Safari／Android、讀屏與 PWA | 未執行 |
| 最終 PR 審核及發布授權 | 未完成；保留 Draft，不能直接合併 |

全部驗收及最新 CI 通過後，由使用者另行審核並明確同意發布。目前 workflow 在 main 推送後會自動部署 GitHub Pages，因此 **合併 PR #10 與觸發正式部署是相連動作**，不能先合併再聲稱尚未部署。若需要先合併、稍後人工發布，須先另行審查 workflow 改動，本輪不做。

獲准發布後依現有 Pages 流程驗證 `/sumi/` 靜態資源、`sw-assets.js` 版本、更新提示及舊資料；裝置先儲存草稿、保留 JSON 備份再接受更新，不清除 localStorage／IndexedDB／整站資料。發布若出現帳務或隔離錯誤，停止新增寫入、保存現有記錄與待同步佇列，再評估停用策略；不要自行重跑 migration、刪表或清資料。本文件沒有授權任何正式發布或資料變更。
