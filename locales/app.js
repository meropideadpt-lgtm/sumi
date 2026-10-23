/* UI messages; values are plain text and are escaped by their rendering sites. */
globalThis.SumiMessages ||= {};
Object.assign(globalThis.SumiMessages, {
  "app.nav.home": {
    "zh-CN": "首页",
    "zh-TW": "首頁",
    "ja-JP": "ホーム",
    "en": "Home"
  },
  "app.nav.list": {
    "zh-CN": "订阅列表",
    "zh-TW": "訂閱列表",
    "ja-JP": "サブスクリプション",
    "en": "Subscriptions"
  },
  "app.nav.stats": {
    "zh-CN": "统计",
    "zh-TW": "統計",
    "ja-JP": "統計",
    "en": "Statistics"
  },
  "app.nav.calendar": {
    "zh-CN": "日历",
    "zh-TW": "行事曆",
    "ja-JP": "カレンダー",
    "en": "Calendar"
  },
  "app.nav.settings": {
    "zh-CN": "设置",
    "zh-TW": "設定",
    "ja-JP": "設定",
    "en": "Settings"
  },
  "app.nav.main": {
    "zh-CN": "主导航",
    "zh-TW": "主導覽",
    "ja-JP": "メインナビゲーション",
    "en": "Main navigation"
  },
  "app.subtitle.home": {
    "zh-CN": "轻松管理每一份订阅",
    "zh-TW": "輕鬆管理每一份訂閱",
    "ja-JP": "すべてのサブスクリプションを手軽に管理",
    "en": "Manage every subscription with ease"
  },
  "app.subtitle.list": {
    "zh-CN": "你的所有订阅，一目了然",
    "zh-TW": "你的所有訂閱，一目瞭然",
    "ja-JP": "サブスクリプションを一覧で確認",
    "en": "All your subscriptions at a glance"
  },
  "app.subtitle.stats": {
    "zh-CN": "了解你的订阅支出",
    "zh-TW": "瞭解你的訂閱支出",
    "ja-JP": "サブスクリプションの支出を確認",
    "en": "Understand your subscription spending"
  },
  "app.subtitle.calendar": {
    "zh-CN": "查看即将到来的续费",
    "zh-TW": "查看即將到來的續費",
    "ja-JP": "今後の更新日を確認",
    "en": "See upcoming renewals"
  },
  "app.subtitle.settings": {
    "zh-CN": "个性化你的 sumi",
    "zh-TW": "個人化你的 sumi",
    "ja-JP": "sumi を自分好みに",
    "en": "Make sumi yours"
  },
  "app.addSubscription": {
    "zh-CN": "添加订阅",
    "zh-TW": "新增訂閱",
    "ja-JP": "サブスクリプションを追加",
    "en": "Add subscription"
  },
  "app.editSubscription": {
    "zh-CN": "编辑订阅",
    "zh-TW": "編輯訂閱",
    "ja-JP": "サブスクリプションを編集",
    "en": "Edit subscription"
  },
  "app.exportRaw": {
    "zh-CN": "导出原始数据",
    "zh-TW": "匯出原始資料",
    "ja-JP": "元データをエクスポート",
    "en": "Export original data"
  },
  "app.monthlyCost": {
    "zh-CN": "平均每月订阅成本",
    "zh-TW": "平均每月訂閱成本",
    "ja-JP": "月平均サブスクリプション費用",
    "en": "Average monthly cost"
  },
  "app.amortizedReference": {
    "zh-CN": "按订阅周期分摊 · 参考汇率",
    "zh-TW": "按訂閱週期攤分 · 參考匯率",
    "ja-JP": "契約期間で按分 · 参考為替レート",
    "en": "Amortized by billing cycle · Reference rates"
  },
  "app.activeSubscriptions": {
    "zh-CN": "正在订阅",
    "zh-TW": "使用中的訂閱",
    "ja-JP": "契約中",
    "en": "Active subscriptions"
  },
  "app.items": {
    "zh-CN": "项",
    "zh-TW": "項",
    "ja-JP": "件",
    "en": "items",
    "en-one": "item"
  },
  "app.itemCount": {
    "zh-CN": "{count} 项",
    "zh-TW": "{count} 項",
    "ja-JP": "{count} 件",
    "en": "{count} items",
    "en-one": "{count} item"
  },
  "app.activeOnly": {
    "zh-CN": "仅包含有效订阅",
    "zh-TW": "僅包含有效訂閱",
    "ja-JP": "有効な契約のみ",
    "en": "Active subscriptions only"
  },
  "app.nextRenewal": {
    "zh-CN": "下次续费",
    "zh-TW": "下次續費",
    "ja-JP": "次回更新日",
    "en": "Next renewal"
  },
  "app.none": {
    "zh-CN": "暂无",
    "zh-TW": "暫無",
    "ja-JP": "なし",
    "en": "None"
  },
  "app.startAdding": {
    "zh-CN": "添加订阅以开始",
    "zh-TW": "新增訂閱以開始",
    "ja-JP": "契約を追加して始めましょう",
    "en": "Add a subscription to get started"
  },
  "app.renewalReminder": {
    "zh-CN": "续费提醒",
    "zh-TW": "續費提醒",
    "ja-JP": "更新のお知らせ",
    "en": "Renewal reminders"
  },
  "app.attentionCount": {
    "zh-CN": "{count} 项待关注",
    "zh-TW": "{count} 項待關注",
    "ja-JP": "{count} 件を確認",
    "en": "{count} need attention"
  },
  "app.overdue": {
    "zh-CN": "已过续费日 · 待确认",
    "zh-TW": "已過續費日 · 待確認",
    "ja-JP": "更新日を経過 · 要確認",
    "en": "Overdue · Awaiting confirmation"
  },
  "app.dueToday": {
    "zh-CN": "今天续费",
    "zh-TW": "今天續費",
    "ja-JP": "本日更新",
    "en": "Renews today"
  },
  "app.dueIn": {
    "zh-CN": "{count} 天后续费",
    "zh-TW": "{count} 天後續費",
    "ja-JP": "{count} 日後に更新",
    "en": "Renews in {count} days",
    "en-one": "Renews in {count} day"
  },
  "app.view": {
    "zh-CN": "查看",
    "zh-TW": "查看",
    "ja-JP": "詳細",
    "en": "View"
  },
  "app.mySubscriptions": {
    "zh-CN": "我的订阅",
    "zh-TW": "我的訂閱",
    "ja-JP": "登録済みの契約",
    "en": "My subscriptions"
  },
  "app.searchSubscriptions": {
    "zh-CN": "搜索订阅...",
    "zh-TW": "搜尋訂閱…",
    "ja-JP": "サブスクリプションを検索…",
    "en": "Search subscriptions…"
  },
  "app.allSubscriptions": {
    "zh-CN": "全部订阅",
    "zh-TW": "全部訂閱",
    "ja-JP": "すべての契約",
    "en": "All subscriptions"
  },
  "app.active": {
    "zh-CN": "订阅中",
    "zh-TW": "訂閱中",
    "ja-JP": "契約中",
    "en": "Active"
  },
  "app.cancelled": {
    "zh-CN": "已取消",
    "zh-TW": "已取消",
    "ja-JP": "解約済み",
    "en": "Cancelled"
  },
  "app.service": {
    "zh-CN": "订阅服务",
    "zh-TW": "訂閱服務",
    "ja-JP": "サービス",
    "en": "Service"
  },
  "app.cost": {
    "zh-CN": "费用",
    "zh-TW": "費用",
    "ja-JP": "費用",
    "en": "Cost"
  },
  "app.monthlyAverage": {
    "zh-CN": "平均月成本",
    "zh-TW": "平均月成本",
    "ja-JP": "月平均費用",
    "en": "Monthly average"
  },
  "app.status": {
    "zh-CN": "状态",
    "zh-TW": "狀態",
    "ja-JP": "状態",
    "en": "Status"
  },
  "app.months": {
    "zh-CN": "{count} 个月",
    "zh-TW": "{count} 個月",
    "ja-JP": "{count} か月",
    "en": "{count} months",
    "en-one": "{count} month"
  },
  "app.shortMonths": {
    "zh-CN": "{count}月",
    "zh-TW": "{count}月",
    "ja-JP": "{count}か月",
    "en": "{count} mo"
  },
  "app.emptySubscriptions": {
    "zh-CN": "暂无订阅，点击右上角「添加订阅」开始吧",
    "zh-TW": "暫無訂閱，點擊右上角「新增訂閱」開始吧",
    "ja-JP": "契約はまだありません。「追加」から始めましょう",
    "en": "No subscriptions yet. Select “Add subscription” to get started."
  },
  "app.previousMonth": {
    "zh-CN": "上一月",
    "zh-TW": "上個月",
    "ja-JP": "前の月",
    "en": "Previous month"
  },
  "app.nextMonth": {
    "zh-CN": "下一月",
    "zh-TW": "下個月",
    "ja-JP": "次の月",
    "en": "Next month"
  },
  "app.calendarNote": {
    "zh-CN": "日历目前展示记录中的下一次续费日期。",
    "zh-TW": "行事曆目前顯示記錄中的下一次續費日期。",
    "ja-JP": "カレンダーには保存されている次回更新日が表示されます。",
    "en": "The calendar shows each subscription’s saved next renewal date."
  },
  "app.language": {
    "zh-CN": "语言",
    "zh-TW": "語言",
    "ja-JP": "言語",
    "en": "Language"
  },
  "app.displayCurrency": {
    "zh-CN": "统计展示币种",
    "zh-TW": "統計顯示幣別",
    "ja-JP": "表示通貨",
    "en": "Display currency"
  },
  "app.appearance": {
    "zh-CN": "外观",
    "zh-TW": "外觀",
    "ja-JP": "外観",
    "en": "Appearance"
  },
  "app.light": {
    "zh-CN": "浅色模式",
    "zh-TW": "淺色模式",
    "ja-JP": "ライト",
    "en": "Light"
  },
  "app.dark": {
    "zh-CN": "深色模式",
    "zh-TW": "深色模式",
    "ja-JP": "ダーク",
    "en": "Dark"
  },
  "app.system": {
    "zh-CN": "跟随系统",
    "zh-TW": "跟隨系統",
    "ja-JP": "システムに合わせる",
    "en": "System"
  },
  "app.siteReminder": {
    "zh-CN": "续费提醒（仅站内）",
    "zh-TW": "續費提醒（僅站內）",
    "ja-JP": "更新通知（サイト内のみ）",
    "en": "Renewal reminders (in app)"
  },
  "app.daysBefore": {
    "zh-CN": "提前 {count} 天",
    "zh-TW": "提前 {count} 天",
    "ja-JP": "{count} 日前",
    "en": "{count} days before",
    "en-one": "{count} day before"
  },
  "app.onDay": {
    "zh-CN": "当天",
    "zh-TW": "當天",
    "ja-JP": "当日",
    "en": "On the day"
  },
  "app.backupRestore": {
    "zh-CN": "备份与恢复",
    "zh-TW": "備份與還原",
    "ja-JP": "バックアップと復元",
    "en": "Backup and restore"
  },
  "app.exportJSON": {
    "zh-CN": "导出 JSON",
    "zh-TW": "匯出 JSON",
    "ja-JP": "JSON をエクスポート",
    "en": "Export JSON"
  },
  "app.importJSON": {
    "zh-CN": "导入 JSON",
    "zh-TW": "匯入 JSON",
    "ja-JP": "JSON をインポート",
    "en": "Import JSON"
  },
  "app.backupNote": {
    "zh-CN": "订阅和付款原始金额不会随展示币种修改。数据保存在本浏览器，请定期备份。",
    "zh-TW": "訂閱和付款原始金額不會隨顯示幣別修改。資料儲存在此瀏覽器，請定期備份。",
    "ja-JP": "表示通貨を変更しても契約や支払いの元の金額は変わりません。データはこのブラウザーに保存されます。定期的にバックアップしてください。",
    "en": "Changing the display currency does not change original subscription or payment amounts. Data is stored in this browser; back it up regularly."
  },
  "app.closeSubscription": {
    "zh-CN": "关闭订阅表单",
    "zh-TW": "關閉訂閱表單",
    "ja-JP": "契約フォームを閉じる",
    "en": "Close subscription form"
  },
  "app.logo": {
    "zh-CN": "软件图标",
    "zh-TW": "服務圖示",
    "ja-JP": "サービスのアイコン",
    "en": "Service logo"
  },
  "app.changeLogo": {
    "zh-CN": "选择或更换订阅图标",
    "zh-TW": "選擇或更換訂閱圖示",
    "ja-JP": "契約のアイコンを選択・変更",
    "en": "Choose or change subscription logo"
  },
  "app.subscriptionName": {
    "zh-CN": "订阅名称",
    "zh-TW": "訂閱名稱",
    "ja-JP": "サービス名",
    "en": "Subscription name"
  },
  "app.matchedServices": {
    "zh-CN": "匹配的订阅服务",
    "zh-TW": "符合的訂閱服務",
    "ja-JP": "一致するサービス",
    "en": "Matching subscription services"
  },
  "app.originalCurrency": {
    "zh-CN": "原始货币",
    "zh-TW": "原始貨幣",
    "ja-JP": "元の通貨",
    "en": "Original currency"
  },
  "app.amount": {
    "zh-CN": "金额",
    "zh-TW": "金額",
    "ja-JP": "金額",
    "en": "Amount"
  },
  "app.cycle": {
    "zh-CN": "订阅周期",
    "zh-TW": "訂閱週期",
    "ja-JP": "請求周期",
    "en": "Billing cycle"
  },
  "app.subscriptionStatus": {
    "zh-CN": "订阅状态",
    "zh-TW": "訂閱狀態",
    "ja-JP": "契約状態",
    "en": "Subscription status"
  },
  "app.autoRenew": {
    "zh-CN": "自动续费",
    "zh-TW": "自動續費",
    "ja-JP": "自動更新",
    "en": "Automatic renewal"
  },
  "app.on": {
    "zh-CN": "开启",
    "zh-TW": "開啟",
    "ja-JP": "オン",
    "en": "On"
  },
  "app.off": {
    "zh-CN": "关闭",
    "zh-TW": "關閉",
    "ja-JP": "オフ",
    "en": "Off"
  },
  "app.category": {
    "zh-CN": "订阅类别",
    "zh-TW": "訂閱類別",
    "ja-JP": "カテゴリー",
    "en": "Category"
  },
  "app.cancel": {
    "zh-CN": "取消",
    "zh-TW": "取消",
    "ja-JP": "キャンセル",
    "en": "Cancel"
  },
  "app.add": {
    "zh-CN": "添加",
    "zh-TW": "新增",
    "ja-JP": "追加",
    "en": "Add"
  },
  "app.saveChanges": {
    "zh-CN": "保存修改",
    "zh-TW": "儲存修改",
    "ja-JP": "変更を保存",
    "en": "Save changes"
  },
  "app.summary": {
    "zh-CN": "订阅摘要",
    "zh-TW": "訂閱摘要",
    "ja-JP": "契約の概要",
    "en": "Subscription summary"
  },
  "app.monthly": {
    "zh-CN": "平均每月",
    "zh-TW": "平均每月",
    "ja-JP": "月平均",
    "en": "Monthly average"
  },
  "app.activeShort": {
    "zh-CN": "活跃订阅",
    "zh-TW": "有效訂閱",
    "ja-JP": "契約中",
    "en": "Active"
  },
  "app.viewAll": {
    "zh-CN": "查看全部",
    "zh-TW": "查看全部",
    "ja-JP": "すべて表示",
    "en": "View all"
  },
  "app.renewOn": {
    "zh-CN": "{date}续费",
    "zh-TW": "{date}續費",
    "ja-JP": "{date} に更新",
    "en": "Renews {date}"
  },
  "app.emptyMobile": {
    "zh-CN": "暂无订阅，添加一份开始吧",
    "zh-TW": "暫無訂閱，新增一份開始吧",
    "ja-JP": "契約を追加して始めましょう",
    "en": "Add your first subscription to get started"
  },
  "app.paymentSuccess": {
    "zh-CN": "付款成功",
    "zh-TW": "付款成功",
    "ja-JP": "支払い成功",
    "en": "Payment succeeded"
  },
  "app.paymentFailed": {
    "zh-CN": "付款失败",
    "zh-TW": "付款失敗",
    "ja-JP": "支払い失敗",
    "en": "Payment failed"
  },
  "app.oldCycle": {
    "zh-CN": "旧账期",
    "zh-TW": "舊帳期",
    "ja-JP": "以前の請求周期",
    "en": "Previous schedule"
  },
  "app.cycleDate": {
    "zh-CN": "账期 {date}",
    "zh-TW": "帳期 {date}",
    "ja-JP": "対象日 {date}",
    "en": "Cycle {date}"
  },
  "app.unlinkedCycle": {
    "zh-CN": "未关联账期",
    "zh-TW": "未關聯帳期",
    "ja-JP": "請求周期の関連付けなし",
    "en": "No linked billing cycle"
  },
  "app.edit": {
    "zh-CN": "编辑",
    "zh-TW": "編輯",
    "ja-JP": "編集",
    "en": "Edit"
  },
  "app.delete": {
    "zh-CN": "删除",
    "zh-TW": "刪除",
    "ja-JP": "削除",
    "en": "Delete"
  },
  "app.details": {
    "zh-CN": "订阅详情",
    "zh-TW": "訂閱詳情",
    "ja-JP": "契約の詳細",
    "en": "Subscription details"
  },
  "app.closeDetails": {
    "zh-CN": "关闭订阅详情",
    "zh-TW": "關閉訂閱詳情",
    "ja-JP": "契約の詳細を閉じる",
    "en": "Close subscription details"
  },
  "app.referenceRate": {
    "zh-CN": "参考汇率",
    "zh-TW": "參考匯率",
    "ja-JP": "参考為替レート",
    "en": "Reference rates"
  },
  "app.paymentHistory": {
    "zh-CN": "付款历史",
    "zh-TW": "付款歷史",
    "ja-JP": "支払い履歴",
    "en": "Payment history"
  },
  "app.recordPayment": {
    "zh-CN": "补录付款",
    "zh-TW": "補登付款",
    "ja-JP": "支払いを記録",
    "en": "Record payment"
  },
  "app.noPayments": {
    "zh-CN": "暂无付款记录",
    "zh-TW": "暫無付款記錄",
    "ja-JP": "支払い記録はありません",
    "en": "No payments recorded"
  },
  "app.confirmRenewal": {
    "zh-CN": "确认本次续费成功",
    "zh-TW": "確認本次續費成功",
    "ja-JP": "今回の更新支払いを確認",
    "en": "Confirm renewal payment"
  },
  "app.recordFailure": {
    "zh-CN": "记录本次付款失败",
    "zh-TW": "記錄本次付款失敗",
    "ja-JP": "今回の支払い失敗を記録",
    "en": "Record failed payment"
  },
  "app.markCancelled": {
    "zh-CN": "标记为已取消",
    "zh-TW": "標記為已取消",
    "ja-JP": "解約済みにする",
    "en": "Mark as cancelled"
  },
  "app.restore": {
    "zh-CN": "恢复订阅",
    "zh-TW": "恢復訂閱",
    "ja-JP": "契約を再開",
    "en": "Restore subscription"
  },
  "app.deleteSubscription": {
    "zh-CN": "删除订阅",
    "zh-TW": "刪除訂閱",
    "ja-JP": "契約を削除",
    "en": "Delete subscription"
  },
  "app.detailNote": {
    "zh-CN": "这里只记录付款结果，不会实际扣费。每次成功确认仅结清对应账期；逾期账期逐期处理，失败不推进日期。取消仅更改本地状态，恢复后保留原账期。删除或改为失败的关联付款会重新打开对应账期。",
    "zh-TW": "這裡只記錄付款結果，不會實際扣費。每次成功確認僅結清對應帳期；逾期帳期逐期處理，失敗不推進日期。取消僅更改本機狀態，恢復後保留原帳期。刪除或改為失敗的關聯付款會重新開啟對應帳期。",
    "ja-JP": "支払い結果の記録のみを行い、実際の請求は行いません。成功確認は対象の請求周期のみを完了します。延滞分は順に処理し、失敗時は日付を進めません。解約や再開では元の請求周期を保持します。関連する支払いを削除または失敗に変更すると、その周期は再び未払いになります。",
    "en": "This only records payment outcomes; it does not charge you. Each successful confirmation settles one billing cycle. Overdue cycles are handled in order, and failures do not advance the date. Cancel and restore preserve the schedule. Deleting a linked payment or marking it failed reopens its billing cycle."
  },
  "app.editPayment": {
    "zh-CN": "编辑付款记录",
    "zh-TW": "編輯付款記錄",
    "ja-JP": "支払い記録を編集",
    "en": "Edit payment"
  },
  "app.closePayment": {
    "zh-CN": "关闭付款表单",
    "zh-TW": "關閉付款表單",
    "ja-JP": "支払いフォームを閉じる",
    "en": "Close payment form"
  },
  "app.paymentDate": {
    "zh-CN": "实际付款日期",
    "zh-TW": "實際付款日期",
    "ja-JP": "実際の支払日",
    "en": "Payment date"
  },
  "app.paymentAmount": {
    "zh-CN": "付款金额",
    "zh-TW": "付款金額",
    "ja-JP": "支払金額",
    "en": "Payment amount"
  },
  "app.optionalCycle": {
    "zh-CN": "对应账期（可选）",
    "zh-TW": "對應帳期（選填）",
    "ja-JP": "対象の請求周期（任意）",
    "en": "Billing cycle date (optional)"
  },
  "app.paymentResult": {
    "zh-CN": "付款结果",
    "zh-TW": "付款結果",
    "ja-JP": "支払い結果",
    "en": "Payment result"
  },
  "app.archivedPaymentNote": {
    "zh-CN": "这条记录属于旧账期设置，保持原账期时不会影响当前续费日；修改对应账期可关联当前设置。",
    "zh-TW": "這筆記錄屬於舊帳期設定，保持原帳期時不會影響目前續費日；修改對應帳期可關聯目前設定。",
    "ja-JP": "この記録は以前の請求設定に属します。対象日を変えない限り、現在の更新日に影響しません。対象日を変更すると現在の設定に関連付けできます。",
    "en": "This record belongs to a previous schedule. Keeping its cycle date leaves the current renewal unchanged; changing it can link it to the current schedule."
  },
  "app.paymentNote": {
    "zh-CN": "关联账期后，成功付款会推进至下一未付款账期。留空则仅补记历史，不推算账期。失败记录不计入实际付款。",
    "zh-TW": "關聯帳期後，成功付款會推進至下一未付款帳期。留空則僅補記歷史，不推算帳期。失敗記錄不計入實際付款。",
    "ja-JP": "請求周期を関連付けると、成功した支払いは次の未払い周期へ進みます。空欄の場合は履歴のみを追加します。失敗した記録は実際の支出に含めません。",
    "en": "Link a billing cycle to advance successful payments to the next unpaid cycle. Leave it blank to record history only. Failed payments are excluded from actual spending."
  },
  "app.savePayment": {
    "zh-CN": "保存付款记录",
    "zh-TW": "儲存付款記錄",
    "ja-JP": "支払い記録を保存",
    "en": "Save payment"
  },
  "app.noLogo": {
    "zh-CN": "暂无图标",
    "zh-TW": "暫無圖示",
    "ja-JP": "アイコンなし",
    "en": "No logo"
  },
  "app.namedNoLogo": {
    "zh-CN": "{name}：暂无图标",
    "zh-TW": "{name}：暫無圖示",
    "ja-JP": "{name}：アイコンなし",
    "en": "{name}: no logo"
  },
  "app.subscription": {
    "zh-CN": "订阅",
    "zh-TW": "訂閱",
    "ja-JP": "サブスクリプション",
    "en": "Subscription"
  },
  "app.noServiceMatch": {
    "zh-CN": "未找到匹配服务，可直接使用自定义名称。",
    "zh-TW": "找不到符合的服務，可直接使用自訂名稱。",
    "ja-JP": "一致するサービスはありません。任意の名前で追加できます。",
    "en": "No matching service. You can use your own name."
  },
  "app.chooseNamedLogo": {
    "zh-CN": "选择 {name} 图标",
    "zh-TW": "選擇 {name} 圖示",
    "ja-JP": "{name} のアイコンを選択",
    "en": "Choose {name} logo"
  },
  "app.noLogoMatch": {
    "zh-CN": "没有匹配的服务，可上传自己的图片或保留中性图标。",
    "zh-TW": "沒有符合的服務，可上傳自己的圖片或保留中性圖示。",
    "ja-JP": "一致するサービスはありません。画像をアップロードするか、共通アイコンを使用できます。",
    "en": "No matching service. Upload an image or keep the neutral icon."
  },
  "app.chooseLogo": {
    "zh-CN": "选择图标",
    "zh-TW": "選擇圖示",
    "ja-JP": "アイコンを選択",
    "en": "Choose logo"
  },
  "app.closeLogo": {
    "zh-CN": "关闭图标选择",
    "zh-TW": "關閉圖示選擇",
    "ja-JP": "アイコン選択を閉じる",
    "en": "Close logo picker"
  },
  "app.currentLogo": {
    "zh-CN": "当前图标",
    "zh-TW": "目前圖示",
    "ja-JP": "現在のアイコン",
    "en": "Current logo"
  },
  "app.canReplaceLogo": {
    "zh-CN": "可替换或移除",
    "zh-TW": "可替換或移除",
    "ja-JP": "変更・削除できます",
    "en": "Replace or remove it"
  },
  "app.noSelectedLogo": {
    "zh-CN": "尚未选择图标",
    "zh-TW": "尚未選擇圖示",
    "ja-JP": "未選択",
    "en": "No logo selected"
  },
  "app.searchLogos": {
    "zh-CN": "搜索服务图标",
    "zh-TW": "搜尋服務圖示",
    "ja-JP": "サービスのアイコンを検索",
    "en": "Search service logos"
  },
  "app.searchAliases": {
    "zh-CN": "搜索中文、英文或常见别名",
    "zh-TW": "搜尋中文、英文或常見別名",
    "ja-JP": "中国語・英語・別名で検索",
    "en": "Search Chinese, English or aliases"
  },
  "app.replaceUpload": {
    "zh-CN": "替换为自定义图片",
    "zh-TW": "替換為自訂圖片",
    "ja-JP": "画像をアップロードして変更",
    "en": "Replace with your image"
  },
  "app.uploadImage": {
    "zh-CN": "上传自己的图片",
    "zh-TW": "上傳自己的圖片",
    "ja-JP": "画像をアップロード",
    "en": "Upload your image"
  },
  "app.removeLogo": {
    "zh-CN": "移除图标",
    "zh-TW": "移除圖示",
    "ja-JP": "アイコンを削除",
    "en": "Remove logo"
  },
  "app.checkingImage": {
    "zh-CN": "正在检查图片…",
    "zh-TW": "正在檢查圖片…",
    "ja-JP": "画像を確認中…",
    "en": "Checking image…"
  },
  "app.uploadNote": {
    "zh-CN": "支持静态 PNG、JPEG、WebP，最大 500 KB，单边不超过 4096 像素。没有可靠品牌图标时使用统一中性图标。",
    "zh-TW": "支援靜態 PNG、JPEG、WebP，最大 500 KB，單邊不超過 4096 像素。沒有可靠品牌圖示時使用統一中性圖示。",
    "ja-JP": "静止画の PNG・JPEG・WebP に対応。最大 500 KB、各辺 4096 ピクセルまでです。信頼できるブランド画像がない場合は共通アイコンを使います。",
    "en": "Static PNG, JPEG or WebP, up to 500 KB and 4096 pixels per side. Services without a reliable brand logo use a neutral icon."
  },
  "app.unsupportedCurrency": {
    "zh-CN": "（未支持换算）",
    "zh-TW": "（不支援換算）",
    "ja-JP": "（換算非対応）",
    "en": " (conversion unavailable)"
  },
  "app.baselineNote": {
    "zh-CN": "部分旧订阅尚未保存成本历史。当前观察只代表今天；记录基线后可持续跟踪，不补造过去的数据。",
    "zh-TW": "部分舊訂閱尚未儲存成本歷史。目前觀察僅代表今天；記錄基準後可持續追蹤，不補造過去的資料。",
    "ja-JP": "一部の既存契約には費用履歴がありません。現在の情報は本日時点のものです。基準を記録すると今後を追跡できますが、過去のデータは生成しません。",
    "en": "Some older subscriptions have no cost history. Current observations represent today only. Record a baseline to track changes going forward; past data is not invented."
  },
  "app.recordBaseline": {
    "zh-CN": "记录当前成本基线",
    "zh-TW": "記錄目前成本基準",
    "ja-JP": "現在の費用を基準として記録",
    "en": "Record current cost baseline"
  },
  "app.monthlyOverview": {
    "zh-CN": "月度成本概览",
    "zh-TW": "月度成本概覽",
    "ja-JP": "月ごとの費用概要",
    "en": "Monthly cost overview"
  },
  "app.recordedMonthly": {
    "zh-CN": "已记录的月均成本",
    "zh-TW": "已記錄的月均成本",
    "ja-JP": "記録済みの月平均費用",
    "en": "Recorded monthly averages"
  },
  "app.unknownCost": {
    "zh-CN": "未记录或无法换算",
    "zh-TW": "未記錄或無法換算",
    "ja-JP": "未記録または換算不可",
    "en": "Not recorded or conversion unavailable"
  },
  "app.partialDates": {
    "zh-CN": "部分日期",
    "zh-TW": "部分日期",
    "ja-JP": "一部の日付",
    "en": "Partial period"
  },
  "app.emptyCostHistory": {
    "zh-CN": "暂无可展示的成本历史",
    "zh-TW": "暫無可顯示的成本歷史",
    "ja-JP": "表示できる費用履歴がありません",
    "en": "No cost history to display"
  },
  "app.chartNote": {
    "zh-CN": "仅展示已记录日期，不补造过去的数据；* 表示部分日期。按当前参考汇率换算，与实际付款独立。",
    "zh-TW": "僅顯示已記錄日期，不補造過去的資料；* 表示部分日期。按目前參考匯率換算，與實際付款分開。",
    "ja-JP": "記録済みの日付のみを表示し、過去のデータは生成しません。* は期間の一部を示します。現在の参考レートで換算し、実際の支払いとは分けて集計します。",
    "en": "Only recorded dates are shown; past data is not invented. * marks a partial period. Costs use current reference rates and are separate from actual payments."
  },
  "app.freshCache": {
    "zh-CN": "本地缓存（24 小时内获取）",
    "zh-TW": "本機快取（24 小時內取得）",
    "ja-JP": "ローカルキャッシュ（24 時間以内に取得）",
    "en": "Local cache (fetched within 24 hours)"
  },
  "app.staleCache": {
    "zh-CN": "旧缓存（超过 24 小时）",
    "zh-TW": "舊快取（超過 24 小時）",
    "ja-JP": "古いキャッシュ（24 時間超過）",
    "en": "Older cache (over 24 hours)"
  },
  "app.emptyCache": {
    "zh-CN": "暂无有效缓存",
    "zh-TW": "暫無有效快取",
    "ja-JP": "有効なキャッシュなし",
    "en": "No valid cache"
  },
  "app.loadingRatesStatus": {
    "zh-CN": "正在获取汇率；{status}",
    "zh-TW": "正在取得匯率；{status}",
    "ja-JP": "為替レートを取得中；{status}",
    "en": "Fetching rates; {status}"
  },
  "app.failedRatesStatus": {
    "zh-CN": "更新失败；{status}",
    "zh-TW": "更新失敗；{status}",
    "ja-JP": "更新失敗；{status}",
    "en": "Update failed; {status}"
  },
  "app.rateManagement": {
    "zh-CN": "参考汇率管理",
    "zh-TW": "參考匯率管理",
    "ja-JP": "参考為替レートの管理",
    "en": "Reference exchange rates"
  },
  "app.refreshing": {
    "zh-CN": "正在刷新…",
    "zh-TW": "正在重新整理…",
    "ja-JP": "更新中…",
    "en": "Refreshing…"
  },
  "app.refreshRates": {
    "zh-CN": "手动刷新汇率",
    "zh-TW": "手動更新匯率",
    "ja-JP": "為替レートを更新",
    "en": "Refresh exchange rates"
  },
  "app.rateDate": {
    "zh-CN": "汇率对应日期",
    "zh-TW": "匯率對應日期",
    "ja-JP": "レート基準日",
    "en": "Rate date"
  },
  "app.notFetched": {
    "zh-CN": "尚未获取",
    "zh-TW": "尚未取得",
    "ja-JP": "未取得",
    "en": "Not fetched"
  },
  "app.lastFetched": {
    "zh-CN": "最近成功获取时间",
    "zh-TW": "最近成功取得時間",
    "ja-JP": "最終取得成功日時",
    "en": "Last successful fetch"
  },
  "app.cacheFailureNote": {
    "zh-CN": "{error}。有缓存时继续使用原缓存；日期不会更新为今天。",
    "zh-TW": "{error}。有快取時繼續使用原快取；日期不會更新為今天。",
    "ja-JP": "{error}。既存のキャッシュがある場合はそのまま使い、日付を今日に置き換えません。",
    "en": "{error}. Existing cached rates remain in use; their date is not changed to today."
  },
  "app.currencyCoverage": {
    "zh-CN": "当前参考数据支持 {count} 种币种。",
    "zh-TW": "目前參考資料支援 {count} 種幣別。",
    "ja-JP": "現在の参考データは {count} 通貨に対応しています。",
    "en": "Current reference data covers {count} currencies.",
    "en-one": "Current reference data covers {count} currency."
  },
  "app.twdUnavailable": {
    "zh-CN": "此接口暂无 TWD 换算，已有原币记录保留。",
    "zh-TW": "此介面暫無 TWD 換算，保留既有原幣記錄。",
    "ja-JP": "この API は現在 TWD の換算に対応していません。元の通貨の記録は保持されます。",
    "en": "This API currently has no TWD conversion. Original-currency records are preserved."
  },
  "app.displayUnsupported": {
    "zh-CN": "当前展示币种未获接口支持，无法换算其他币种。",
    "zh-TW": "目前顯示幣別不受介面支援，無法換算其他幣別。",
    "ja-JP": "表示通貨が API に対応していないため、他の通貨から換算できません。",
    "en": "The display currency is unsupported, so other currencies cannot be converted."
  },
  "app.noCoverage": {
    "zh-CN": "支持列表尚未获取。暂不估算跨币种汇率，同币种金额仍可查看。",
    "zh-TW": "尚未取得支援清單。暫不估算跨幣別匯率，仍可查看同幣別金額。",
    "ja-JP": "対応通貨をまだ取得していません。異なる通貨のレートは推測しませんが、同一通貨の金額は表示できます。",
    "en": "Supported currencies have not been fetched. Cross-currency rates are not estimated; same-currency amounts remain available."
  },
  "app.rateNote": {
    "zh-CN": "来源 Frankfurter v1，每 24 小时检查更新；采用每日参考汇率，不是秒级实时交易报价。历史成功付款使用确认时冻结的汇率，刷新不会改写。",
    "zh-TW": "來源 Frankfurter v1，每 24 小時檢查更新；採用每日參考匯率，不是秒級即時交易報價。歷史成功付款使用確認時凍結的匯率，更新不會改寫。",
    "ja-JP": "Frankfurter v1 の日次参考レートを使用し、24 時間ごとに更新を確認します。リアルタイムの取引レートではありません。過去の成功した支払いは確認時のレートを固定し、更新で変更しません。",
    "en": "Source: Frankfurter v1. Updates are checked every 24 hours using daily reference rates, not live trading quotes. Successful historical payments keep the rates frozen at confirmation."
  },
  "app.confirmOriginalOnly": {
    "zh-CN": "当前无法换算这笔付款（{reason}）。是否只保存原币金额？此记录不会按今后汇率自动回算。",
    "zh-TW": "目前無法換算這筆付款（{reason}）。是否僅儲存原幣金額？此記錄不會按未來匯率自動回算。",
    "ja-JP": "この支払いは現在換算できません（{reason}）。元の通貨の金額だけを保存しますか？今後のレートで自動的に換算されることはありません。",
    "en": "This payment cannot be converted ({reason}). Save only the original amount? This record will not be converted automatically using future rates."
  },
  "app.legacyPaymentFx": {
    "zh-CN": "旧记录未保存确认汇率；不按当前汇率补算。",
    "zh-TW": "舊記錄未儲存確認匯率；不按目前匯率補算。",
    "ja-JP": "以前の記録に確認時のレートがないため、現在のレートで補完しません。",
    "en": "This older record has no confirmed rate; current rates are not applied retroactively."
  },
  "app.unavailablePaymentFx": {
    "zh-CN": "确认时无法换算，原币金额已保留。",
    "zh-TW": "確認時無法換算，已保留原幣金額。",
    "ja-JP": "確認時に換算できなかったため、元の通貨の金額を保持しています。",
    "en": "Conversion was unavailable at confirmation; the original amount is preserved."
  },
  "app.identityPaymentFx": {
    "zh-CN": "原币 {currency} 金额，无需换算；未保存其他币种汇率。",
    "zh-TW": "原幣 {currency} 金額，無須換算；未儲存其他幣別匯率。",
    "ja-JP": "元の {currency} 金額のため換算不要です。他通貨のレートは保存していません。",
    "en": "Original {currency} amount; no conversion needed. No other currency rates were saved."
  },
  "app.frozenPaymentFx": {
    "zh-CN": "确认汇率 {date} · {amount} · 汇率 {rate}（已冻结）",
    "zh-TW": "確認匯率 {date} · {amount} · 匯率 {rate}（已凍結）",
    "ja-JP": "確認時レート {date} · {amount} · レート {rate}（固定済み）",
    "en": "Confirmed rates {date} · {amount} · Rate {rate} (frozen)"
  },
  "app.invalidAmount": {
    "zh-CN": "请输入有效金额，最多保留两位小数。",
    "zh-TW": "請輸入有效金額，最多保留兩位小數。",
    "ja-JP": "小数点以下 2 桁以内の有効な金額を入力してください。",
    "en": "Enter a valid amount with up to two decimal places."
  },
  "app.paidNewDate": {
    "zh-CN": "新续费日期已有成功付款，请选择下一未付款账期。",
    "zh-TW": "新續費日期已有成功付款，請選擇下一個未付款帳期。",
    "ja-JP": "新しい更新日には成功した支払いがあります。次の未払い周期を選択してください。",
    "en": "The new renewal date already has a successful payment. Select the next unpaid cycle."
  },
  "app.confirmCancel": {
    "zh-CN": "标记为已取消？付款历史和原账期会保留。",
    "zh-TW": "標記為已取消？付款歷史和原帳期會保留。",
    "ja-JP": "解約済みにしますか？支払い履歴と元の請求周期は保持されます。",
    "en": "Mark as cancelled? Payment history and the original schedule will be kept."
  },
  "app.confirmRestore": {
    "zh-CN": "恢复订阅？原账期会保留，逾期付款需逐期确认。",
    "zh-TW": "恢復訂閱？原帳期會保留，逾期付款需逐期確認。",
    "ja-JP": "契約を再開しますか？元の請求周期を保持し、延滞分は順に確認します。",
    "en": "Restore subscription? The original schedule is kept; overdue cycles need confirmation one at a time."
  },
  "app.confirmDelete": {
    "zh-CN": "删除此订阅及其付款记录？此操作不可撤销。",
    "zh-TW": "刪除此訂閱及其付款記錄？此操作無法復原。",
    "ja-JP": "この契約と支払い記録を削除しますか？この操作は取り消せません。",
    "en": "Delete this subscription and its payments? This cannot be undone."
  },
  "app.confirmPayment": {
    "zh-CN": "确认 {name} 的 {cycle} 账期已于 {date} 成功付款 {amount}？",
    "zh-TW": "確認 {name} 的 {cycle} 帳期已於 {date} 成功付款 {amount}？",
    "ja-JP": "{name} の {cycle} の請求分について、{date} に {amount} の支払いが成功したことを確認しますか？",
    "en": "Confirm that {amount} was successfully paid for {name}’s {cycle} billing cycle on {date}?"
  },
  "app.confirmFailure": {
    "zh-CN": "记录 {name} 的 {cycle} 账期付款失败？失败不会推进续费日期。",
    "zh-TW": "記錄 {name} 的 {cycle} 帳期付款失敗？失敗不會推進續費日期。",
    "ja-JP": "{name} の {cycle} の支払い失敗を記録しますか？更新日は進みません。",
    "en": "Record a failed payment for {name}’s {cycle} cycle? The renewal date will not advance."
  },
  "app.invalidPaymentDate": {
    "zh-CN": "请输入不晚于今天的真实付款日期。",
    "zh-TW": "請輸入不晚於今天的有效付款日期。",
    "ja-JP": "今日以前の有効な支払日を入力してください。",
    "en": "Enter a valid payment date no later than today."
  },
  "app.invalidCycleDate": {
    "zh-CN": "请输入真实有效的账期日期。",
    "zh-TW": "請輸入有效的帳期日期。",
    "ja-JP": "有効な請求周期の日付を入力してください。",
    "en": "Enter a valid billing cycle date."
  },
  "app.confirmDeleteLinkedPayment": {
    "zh-CN": "删除这条付款记录？关联账期会重新变为待付款。",
    "zh-TW": "刪除這筆付款記錄？關聯帳期會重新變為待付款。",
    "ja-JP": "この支払い記録を削除しますか？関連する請求周期は再び未払いになります。",
    "en": "Delete this payment? Its linked billing cycle will become unpaid again."
  },
  "app.confirmDeletePayment": {
    "zh-CN": "删除这条付款记录？",
    "zh-TW": "刪除這筆付款記錄？",
    "ja-JP": "この支払い記録を削除しますか？",
    "en": "Delete this payment?"
  },
  "app.largeBackup": {
    "zh-CN": "备份文件超过 50MB，请检查文件。",
    "zh-TW": "備份檔案超過 50MB，請檢查檔案。",
    "ja-JP": "バックアップファイルが 50 MB を超えています。確認してください。",
    "en": "The backup exceeds 50 MB. Check the file."
  },
  "app.confirmImport": {
    "zh-CN": "导入会替换当前所有订阅、付款记录和偏好设置，是否继续？",
    "zh-TW": "匯入將取代目前所有訂閱、付款記錄和偏好設定，是否繼續？",
    "ja-JP": "インポートすると、現在のすべての契約・支払い記録・設定を置き換えます。続けますか？",
    "en": "Importing replaces all current subscriptions, payments and preferences. Continue?"
  },
  "app.importFailed": {
    "zh-CN": "导入失败：{error}",
    "zh-TW": "匯入失敗：{error}",
    "ja-JP": "インポートに失敗しました：{error}",
    "en": "Import failed: {error}"
  },
  "app.requiredField": {
    "zh-CN": "请填写此字段。",
    "zh-TW": "請填寫此欄位。",
    "ja-JP": "この項目を入力してください。",
    "en": "Please fill in this field."
  },
  "app.invalidField": {
    "zh-CN": "请输入有效值。",
    "zh-TW": "請輸入有效值。",
    "ja-JP": "有効な値を入力してください。",
    "en": "Please enter a valid value."
  },
  "app.rangeField": {
    "zh-CN": "请输入允许范围内的值。",
    "zh-TW": "請輸入允許範圍內的值。",
    "ja-JP": "指定された範囲内の値を入力してください。",
    "en": "Enter a value within the allowed range."
  },
  "app.subscriptionMissing": {
    "zh-CN": "找不到对应订阅，请刷新后重试。",
    "zh-TW": "找不到對應訂閱，請重新整理後再試。",
    "ja-JP": "対象の契約が見つかりません。再読み込みしてお試しください。",
    "en": "The subscription could not be found. Refresh and try again."
  },
  "app.cycleMismatch": {
    "zh-CN": "对应账期不属于此订阅的续费周期，请检查原始续费日。",
    "zh-TW": "對應帳期不屬於此訂閱的續費週期，請檢查原始續費日。",
    "ja-JP": "対象日がこの契約の請求周期と一致しません。元の更新日を確認してください。",
    "en": "This date does not belong to the subscription’s billing cycle. Check the original renewal date."
  },
  "app.cyclePaid": {
    "zh-CN": "该续费周期已记录付款",
    "zh-TW": "此續費週期已記錄付款",
    "ja-JP": "この請求周期の支払いは記録済みです",
    "en": "This billing cycle already has a payment"
  },
  "app.invalidMonth": {
    "zh-CN": "请选择有效月份。",
    "zh-TW": "請選擇有效月份。",
    "ja-JP": "有効な月を選択してください。",
    "en": "Select a valid month."
  },
  "app.invalidYear": {
    "zh-CN": "请选择有效年份。",
    "zh-TW": "請選擇有效年份。",
    "ja-JP": "有効な年を選択してください。",
    "en": "Select a valid year."
  },
  "app.imageReadFailure": {
    "zh-CN": "图片读取失败，请重试。",
    "zh-TW": "圖片讀取失敗，請重試。",
    "ja-JP": "画像を読み込めませんでした。もう一度お試しください。",
    "en": "The image could not be read. Try again."
  }
});
Object.assign(globalThis.SumiMessages, {
  "app.pendingConversion": {
    "zh-CN": "待换算",
    "zh-TW": "待換算",
    "ja-JP": "換算待ち",
    "en": "Awaiting conversion"
  }
});
Object.assign(globalThis.SumiMessages, {
  "app.namedLogo": {
    "zh-CN": "{name} Logo",
    "zh-TW": "{name} Logo",
    "ja-JP": "{name} のロゴ",
    "en": "{name} Logo"
  }
});
Object.assign(globalThis.SumiMessages, {
  "app.chooseCategory": {"zh-CN":"选择分类","zh-TW":"選擇分類","ja-JP":"カテゴリを選択","en":"Choose a category"},
  "app.presetCategories": {"zh-CN":"内置分类","zh-TW":"內建分類","ja-JP":"標準カテゴリ","en":"Preset categories"},
  "app.categoryHint": {"zh-CN":"选择内置分类，或直接输入自定义分类。","zh-TW":"選擇內建分類，或直接輸入自訂分類。","ja-JP":"標準カテゴリを選択するか、独自のカテゴリを入力できます。","en":"Choose a preset or type your own category."}
});
if(typeof module!=='undefined')module.exports=globalThis.SumiMessages;
