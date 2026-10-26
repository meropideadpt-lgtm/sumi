/* Display-only cloud sync messages; persisted records are never translated. */
globalThis.SumiMessages=globalThis.SumiMessages||{};
Object.assign(globalThis.SumiMessages,{
  "sync.title": {
    "zh-CN": "云端同步",
    "zh-TW": "雲端同步",
    "ja-JP": "クラウド同期",
    "en": "Cloud sync"
  },
  "sync.guestNote": {
    "zh-CN": "本地访客不会访问私人云端数据。登录后可在账号工作区启用同步。",
    "zh-TW": "本機訪客不會存取私人雲端資料。登入後可在帳號工作區啟用同步。",
    "ja-JP": "ローカルゲストは非公開クラウドデータにアクセスしません。ログイン後、アカウントで同期を有効にできます。",
    "en": "Local guests never access private cloud data. Sign in to enable sync for your account workspace."
  },
  "sync.disabledNote": {
    "zh-CN": "此账号的本机数据尚未启用同步。先比较本机与云端记录，再选择首次同步方式。",
    "zh-TW": "此帳號的本機資料尚未啟用同步。請先比較本機與雲端紀錄，再選擇首次同步方式。",
    "ja-JP": "このアカウントのローカルデータはまだ同期されていません。端末とクラウドの記録を比較してから初回の同期方法を選んでください。",
    "en": "Sync is not enabled for this account on this device. Compare local and cloud records before choosing how to start."
  },
  "sync.enabledNote": {
    "zh-CN": "同一账号的订阅、付款、设置和自定义图片会同步。历史付款的冻结汇率保持原值。",
    "zh-TW": "同一帳號的訂閱、付款、設定與自訂圖片會同步。歷史付款的凍結匯率維持原值。",
    "ja-JP": "同じアカウントのサブスクリプション、支払い、設定、画像を同期します。過去の支払いに確定した為替レートは変わりません。",
    "en": "Subscriptions, payments, settings and custom images sync within this account. Historical payment exchange rates stay frozen."
  },
  "sync.status.disabled": {
    "zh-CN": "尚未启用",
    "zh-TW": "尚未啟用",
    "ja-JP": "未設定",
    "en": "Not enabled"
  },
  "sync.status.synced": {
    "zh-CN": "已同步",
    "zh-TW": "已同步",
    "ja-JP": "同期済み",
    "en": "Synced"
  },
  "sync.status.syncing": {
    "zh-CN": "同步中",
    "zh-TW": "同步中",
    "ja-JP": "同期中",
    "en": "Syncing"
  },
  "sync.status.offline": {
    "zh-CN": "离线，等待同步",
    "zh-TW": "離線，等待同步",
    "ja-JP": "オフライン・同期待ち",
    "en": "Offline — waiting to sync"
  },
  "sync.status.error": {
    "zh-CN": "同步失败",
    "zh-TW": "同步失敗",
    "ja-JP": "同期に失敗",
    "en": "Sync failed"
  },
  "sync.status.conflict": {
    "zh-CN": "发生冲突",
    "zh-TW": "發生衝突",
    "ja-JP": "競合あり",
    "en": "Conflicts need attention"
  },
  "sync.status.paused": {
    "zh-CN": "同步已暂停",
    "zh-TW": "同步已暫停",
    "ja-JP": "同期を一時停止中",
    "en": "Sync paused"
  },
  "sync.pending": {
    "zh-CN": "待同步操作",
    "zh-TW": "待同步操作",
    "ja-JP": "送信待ちの操作",
    "en": "Pending operations"
  },
  "sync.lastSuccess": {
    "zh-CN": "最近成功同步",
    "zh-TW": "最近成功同步",
    "ja-JP": "前回の同期成功",
    "en": "Last successful sync"
  },
  "sync.notYet": {
    "zh-CN": "尚未同步",
    "zh-TW": "尚未同步",
    "ja-JP": "まだ同期していません",
    "en": "Not synced yet"
  },
  "sync.unknown": {
    "zh-CN": "尚未读取",
    "zh-TW": "尚未讀取",
    "ja-JP": "未取得",
    "en": "Not checked"
  },
  "sync.inspect": {
    "zh-CN": "查看本机与云端数据",
    "zh-TW": "查看本機與雲端資料",
    "ja-JP": "端末とクラウドのデータを確認",
    "en": "Compare local and cloud data"
  },
  "sync.retry": {
    "zh-CN": "重试同步",
    "zh-TW": "重試同步",
    "ja-JP": "同期を再試行",
    "en": "Retry sync"
  },
  "sync.syncNow": {
    "zh-CN": "立即同步",
    "zh-TW": "立即同步",
    "ja-JP": "今すぐ同期",
    "en": "Sync now"
  },
  "sync.previewTitle": {
    "zh-CN": "首次同步确认",
    "zh-TW": "首次同步確認",
    "ja-JP": "初回同期の確認",
    "en": "Choose how to start syncing"
  },
  "sync.previewNote": {
    "zh-CN": "以下为刚读取的数据状态。启用前请确认同步方向；已保存的原本机数据会保留为备份。",
    "zh-TW": "以下是剛讀取的資料狀態。啟用前請確認同步方向；已儲存的原本機資料會保留為備份。",
    "ja-JP": "取得した最新のデータ状況です。同期の方向を確認してください。現在の端末データはバックアップとして保持されます。",
    "en": "These are the data counts just read. Confirm the direction before enabling sync. Saved local data will be kept as a backup."
  },
  "sync.local": {
    "zh-CN": "本机",
    "zh-TW": "本機",
    "ja-JP": "この端末",
    "en": "This device"
  },
  "sync.cloud": {
    "zh-CN": "云端",
    "zh-TW": "雲端",
    "ja-JP": "クラウド",
    "en": "Cloud"
  },
  "sync.type": {
    "zh-CN": "数据类型",
    "zh-TW": "資料類型",
    "ja-JP": "データの種類",
    "en": "Data type"
  },
  "sync.kind.subscriptions": {
    "zh-CN": "订阅",
    "zh-TW": "訂閱",
    "ja-JP": "サブスクリプション",
    "en": "Subscriptions"
  },
  "sync.kind.payments": {
    "zh-CN": "付款历史",
    "zh-TW": "付款歷史",
    "ja-JP": "支払い履歴",
    "en": "Payment history"
  },
  "sync.kind.costHistory": {
    "zh-CN": "成本历史",
    "zh-TW": "成本歷史",
    "ja-JP": "費用履歴",
    "en": "Cost history"
  },
  "sync.kind.preferences": {
    "zh-CN": "共享设置",
    "zh-TW": "共用設定",
    "ja-JP": "共有する設定",
    "en": "Shared settings"
  },
  "sync.kind.extensions": {
    "zh-CN": "业务扩展字段",
    "zh-TW": "業務擴充欄位",
    "ja-JP": "拡張フィールド",
    "en": "Extension fields"
  },
  "sync.kind.images": {
    "zh-CN": "自定义图片",
    "zh-TW": "自訂圖片",
    "ja-JP": "カスタム画像",
    "en": "Custom images"
  },
  "sync.kind.unknown": {
    "zh-CN": "记录",
    "zh-TW": "紀錄",
    "ja-JP": "記録",
    "en": "Record"
  },
  "sync.differences": {
    "zh-CN": "不同的记录：{count}",
    "zh-TW": "不同的紀錄：{count}",
    "ja-JP": "異なる記録：{count}",
    "en": "Different records: {count}"
  },
  "sync.upload": {
    "zh-CN": "上传并合并本机数据",
    "zh-TW": "上傳並合併本機資料",
    "ja-JP": "端末データをアップロードして統合",
    "en": "Upload and merge local data"
  },
  "sync.uploadNote": {
    "zh-CN": "只上传本机已有记录，不会用本机缺少的记录删除云端数据。同编号的不同版本需要处理冲突。",
    "zh-TW": "只上傳本機既有紀錄，不會因本機缺少紀錄而刪除雲端資料。同編號的不同版本需要處理衝突。",
    "ja-JP": "端末にある記録を送信します。端末にない記録を理由にクラウドから削除しません。同じ ID の異なる内容は競合として確認します。",
    "en": "Uploads records present on this device. Records missing locally never delete cloud data. Different versions with the same ID need conflict review."
  },
  "sync.restore": {
    "zh-CN": "从云端恢复到本机",
    "zh-TW": "從雲端還原到本機",
    "ja-JP": "クラウドからこの端末に復元",
    "en": "Restore cloud data on this device"
  },
  "sync.restoreNote": {
    "zh-CN": "替换当前账号的本机视图；原本机数据会保留为备份。不会删除访客数据或云端记录。",
    "zh-TW": "取代目前帳號的本機檢視；原本機資料會保留為備份。不會刪除訪客資料或雲端紀錄。",
    "ja-JP": "現在のアカウントの端末データを置き換え、元のデータはバックアップに残します。ゲストやクラウドの記録は削除しません。",
    "en": "Replaces this account’s local view and keeps its previous local data as a backup. Guest data and cloud records are never deleted."
  },
  "sync.cancelPreview": {
    "zh-CN": "暂不启用",
    "zh-TW": "暫不啟用",
    "ja-JP": "今は有効にしない",
    "en": "Not now"
  },
  "sync.backup": {
    "zh-CN": "导出首次同步前的本机备份",
    "zh-TW": "匯出首次同步前的本機備份",
    "ja-JP": "初回同期前の端末バックアップを書き出す",
    "en": "Export the local backup from before sync"
  },
  "sync.conflictsTitle": {
    "zh-CN": "需要你确认的冲突",
    "zh-TW": "需要你確認的衝突",
    "ja-JP": "確認が必要な競合",
    "en": "Review conflicts"
  },
  "sync.conflictsNote": {
    "zh-CN": "双方版本均保留。请选择整组更改的处理方式；付款、金额、账期和冻结汇率不会自动覆盖。",
    "zh-TW": "雙方版本皆保留。請選擇整組變更的處理方式；付款、金額、帳期與凍結匯率不會自動覆寫。",
    "ja-JP": "両方の内容を保持しています。関連する変更をまとめて選んでください。支払い、金額、請求日、確定済み為替レートを自動で上書きしません。",
    "en": "Both versions are retained. Choose how to resolve the entire group of related changes. Payments, amounts, billing dates and frozen rates are never silently overwritten."
  },
  "sync.conflictGroup": {
    "zh-CN": "冲突组 {count}",
    "zh-TW": "衝突組 {count}",
    "ja-JP": "競合グループ {count}",
    "en": "Conflict group {count}"
  },
  "sync.localVersion": {
    "zh-CN": "本机版本",
    "zh-TW": "本機版本",
    "ja-JP": "端末の内容",
    "en": "Local version"
  },
  "sync.cloudVersion": {
    "zh-CN": "云端版本",
    "zh-TW": "雲端版本",
    "ja-JP": "クラウドの内容",
    "en": "Cloud version"
  },
  "sync.deleted": {
    "zh-CN": "已删除",
    "zh-TW": "已刪除",
    "ja-JP": "削除済み",
    "en": "Deleted"
  },
  "sync.absent": {
    "zh-CN": "没有此记录",
    "zh-TW": "沒有此紀錄",
    "ja-JP": "この記録はありません",
    "en": "Record does not exist"
  },
  "sync.useLocal": {
    "zh-CN": "使用本机这一组更改",
    "zh-TW": "使用本機這組變更",
    "ja-JP": "この変更グループは端末の内容を使う",
    "en": "Use this group of local changes"
  },
  "sync.useCloud": {
    "zh-CN": "使用云端这一组版本",
    "zh-TW": "使用雲端這組版本",
    "ja-JP": "この変更グループはクラウドの内容を使う",
    "en": "Use this group of cloud versions"
  },
  "sync.paidCycle": {
    "zh-CN": "同一订阅账期已有成功付款，不能再次确认。请保留云端版本，再检查并编辑需要保留的付款记录。",
    "zh-TW": "同一訂閱帳期已有成功付款，不能再次確認。請保留雲端版本，再檢查並編輯需要保留的付款紀錄。",
    "ja-JP": "同じ請求期間に成功した支払いがあります。二重に確定できません。クラウドの内容を保持し、必要な支払いを確認・編集してください。",
    "en": "This billing cycle already has a successful payment and cannot be confirmed twice. Keep the cloud version, then review and edit the payment records you need."
  },
  "sync.error.generic": {
    "zh-CN": "同步未完成。已有本机数据和待同步操作均保留，请重试。",
    "zh-TW": "同步尚未完成。既有本機資料與待同步操作皆保留，請重試。",
    "ja-JP": "同期が完了していません。端末のデータと送信待ちの操作は保持されています。再試行してください。",
    "en": "Sync did not finish. Existing local data and pending changes are retained. Please retry."
  },
  "sync.error.network": {
    "zh-CN": "无法连接云端，待同步操作已保留。恢复网络后再试。",
    "zh-TW": "無法連線至雲端，待同步操作已保留。網路恢復後再試。",
    "ja-JP": "クラウドに接続できません。送信待ちの操作は保持されています。接続が戻ったら再試行してください。",
    "en": "Cannot reach the cloud. Pending changes are retained. Retry when the connection returns."
  },
  "sync.error.auth": {
    "zh-CN": "登录状态需要验证，请重新登录原账号。已有本机数据保持不变。",
    "zh-TW": "登入狀態需要驗證，請重新登入原帳號。既有本機資料保持不變。",
    "ja-JP": "ログイン状態の確認が必要です。元のアカウントで再ログインしてください。端末のデータは変わりません。",
    "en": "Your session needs verification. Sign in to the original account again. Existing local data is unchanged."
  },
  "sync.error.setup": {
    "zh-CN": "云同步接口不可用，请按验收文档检查 API、函数与权限设置。不要直接重复执行数据库迁移或开放数据表写入。",
    "zh-TW": "雲端同步介面無法使用，請依驗收文件檢查 API、函式與權限設定。不要直接重跑資料庫 migration 或開放資料表寫入。",
    "ja-JP": "同期 API を利用できません。検証手順に沿って API、関数、権限を確認してください。移行 SQL の再実行やテーブルへの直接書き込み許可で対処しないでください。",
    "en": "The sync API is unavailable. Follow the acceptance guide to check API, function and permission settings. Do not simply rerun migrations or enable direct table writes."
  },
  "sync.error.otherTab": {
    "zh-CN": "此账号已在本浏览器的另一标签页中打开。请先在该页保存操作并关闭，再回到此页重试；本机数据和待同步操作均保留。",
    "zh-TW": "此帳號已在本瀏覽器的另一分頁中開啟。請先在該頁儲存操作並關閉，再回到此頁重試；本機資料與待同步操作皆保留。",
    "ja-JP": "このアカウントは同じブラウザの別タブで開いています。そちらで作業を保存してタブを閉じ、このタブで再試行してください。端末データと送信待ちの操作は保持されています。",
    "en": "This account is open in another tab in this browser. Save your work there and close that tab, then retry here. Local data and pending changes are retained."
  },
  "sync.error.lockUnavailable": {
    "zh-CN": "当前浏览器环境不支持安全同步所需的 Web Locks。请使用支持此功能的新版浏览器，通过 HTTPS 或本机 localhost 打开。请勿清除本机数据。",
    "zh-TW": "目前瀏覽器環境不支援安全同步所需的 Web Locks。請使用支援此功能的新版瀏覽器，透過 HTTPS 或本機 localhost 開啟。請勿清除本機資料。",
    "ja-JP": "この環境では安全な同期に必要な Web Locks を利用できません。対応する最新ブラウザで HTTPS または端末の localhost から開いてください。端末データは消去しないでください。",
    "en": "This browser environment lacks the Web Locks required for safe sync. Use a current supported browser over HTTPS or local localhost. Do not clear local data."
  },
  "sync.error.permission": {
    "zh-CN": "云端拒绝了此次操作，请检查账号权限；本机数据未被删除。",
    "zh-TW": "雲端拒絕了這次操作，請檢查帳號權限；本機資料未被刪除。",
    "ja-JP": "クラウドが操作を拒否しました。アカウントの権限を確認してください。端末データは削除されていません。",
    "en": "The cloud denied this operation. Check account permissions. Local data has not been deleted."
  },
  "sync.error.image": {
    "zh-CN": "自定义图片无法完整验证或传输，同步已停止。请保留本机图片并重试。",
    "zh-TW": "自訂圖片無法完整驗證或傳輸，同步已停止。請保留本機圖片並重試。",
    "ja-JP": "画像を完全に検証・転送できず同期を停止しました。端末の画像を保持したまま再試行してください。",
    "en": "A custom image could not be fully verified or transferred. Sync stopped. Keep the local image and retry."
  },
  "sync.error.storage": {
    "zh-CN": "无法安全保存同步状态，请检查浏览器存储空间或权限，勿清除本机数据。",
    "zh-TW": "無法安全儲存同步狀態，請檢查瀏覽器儲存空間或權限，請勿清除本機資料。",
    "ja-JP": "同期状態を安全に保存できません。ブラウザの空き容量と保存権限を確認し、端末データは消去しないでください。",
    "en": "Cannot safely save sync state. Check browser storage space and permissions without clearing local data."
  },
  "sync.error.changed": {
    "zh-CN": "数据在等待期间发生变化，请重新查看本机与云端状态后重试。",
    "zh-TW": "資料在等待期間已變更，請重新查看本機與雲端狀態後再試。",
    "ja-JP": "処理待ちの間にデータが変わりました。端末とクラウドの状況をもう一度確認してください。",
    "en": "Data changed while this operation was waiting. Compare local and cloud data again before retrying."
  },
  "sync.error.busy": {
    "zh-CN": "请先保存或关闭当前表单，再进行同步操作。",
    "zh-TW": "請先儲存或關閉目前表單，再進行同步操作。",
    "ja-JP": "同期操作の前に現在のフォームを保存するか閉じてください。",
    "en": "Save or close the current form before this sync operation."
  },
  "sync.error.invalid": {
    "zh-CN": "同步数据校验未通过，已有记录和待同步操作保持不变。请保留备份并检查数据。",
    "zh-TW": "同步資料驗證未通過，既有紀錄與待同步操作保持不變。請保留備份並檢查資料。",
    "ja-JP": "同期データを検証できません。既存の記録と送信待ちの操作は変わりません。バックアップを保持してデータを確認してください。",
    "en": "Sync data did not pass validation. Existing records and pending changes are unchanged. Keep a backup and check the data."
  }
});
Object.assign(globalThis.SumiMessages,{
  "sync.parentDeleted": {
    "zh-CN": "关联订阅已在云端删除，不能自动恢复。请先使用云端版本，再检查需要保留的本机修改。",
    "zh-TW": "關聯訂閱已在雲端刪除，不能自動還原。請先使用雲端版本，再檢查需要保留的本機變更。",
    "ja-JP": "関連するサブスクリプションはクラウドで削除されています。自動復元できません。クラウドの内容を使ってから、残したい端末の変更を確認してください。",
    "en": "The related subscription was deleted in the cloud and cannot be restored automatically. Use the cloud version first, then review the local changes you need to keep."
  },
  "sync.dependentRecords": {
    "zh-CN": "云端还有关联付款或历史记录，不能直接删除订阅。请先使用云端版本，再检查相关记录并确认删除。",
    "zh-TW": "雲端仍有關聯付款或歷史紀錄，不能直接刪除訂閱。請先使用雲端版本，再檢查相關紀錄並確認刪除。",
    "ja-JP": "クラウドに関連する支払いや履歴があるため、サブスクリプションを直接削除できません。クラウドの内容を使い、関連する記録を確認してから削除してください。",
    "en": "Related payments or history still exist in the cloud, so the subscription cannot be deleted directly. Use the cloud version, review related records, then confirm deletion."
  }
});
Object.assign(globalThis.SumiMessages,{
  "sync.error.tooLarge": {
    "zh-CN": "本次更改数量超过单次同步限制。请保留备份并检查待同步数据，已有记录未被删除。",
    "zh-TW": "這次變更數量超過單次同步限制。請保留備份並檢查待同步資料，既有紀錄未被刪除。",
    "ja-JP": "今回の変更数が1回の同期上限を超えています。バックアップを保持し、送信待ちのデータを確認してください。既存の記録は削除されていません。",
    "en": "This change exceeds the limit for one sync operation. Keep a backup and review pending data. Existing records have not been deleted."
  },
  "sync.error.verification": {
    "zh-CN": "云端读回校验未通过，尚未确认同步成功。请保留本机数据和备份后重试。",
    "zh-TW": "雲端讀回驗證未通過，尚未確認同步成功。請保留本機資料與備份後再試。",
    "ja-JP": "クラウドからの読み戻しを検証できず、同期成功を確認できませんでした。端末データとバックアップを保持して再試行してください。",
    "en": "Cloud read-back verification failed, so sync has not been confirmed successful. Keep local data and backups, then retry."
  }
});
if(typeof module!=='undefined')module.exports=globalThis.SumiMessages;
