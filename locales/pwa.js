/* PWA copy is kept separate from bookkeeping and user-owned data. */
globalThis.SumiMessages ||= {};
Object.assign(globalThis.SumiMessages, {
  'pwa.title': {'zh-CN':'安装与离线使用','zh-TW':'安裝與離線使用','ja-JP':'インストールとオフライン','en':'Install & offline access'},
  'pwa.browser': {'zh-CN':'浏览器中使用','zh-TW':'在瀏覽器中使用','ja-JP':'ブラウザで使用中','en':'In browser'},
  'pwa.installed': {'zh-CN':'独立应用模式','zh-TW':'獨立應用程式模式','ja-JP':'アプリモード','en':'Standalone app'},
  'pwa.install': {'zh-CN':'安装 sumi','zh-TW':'安裝 sumi','ja-JP':'sumi をインストール','en':'Install sumi'},
  'pwa.installHelp': {'zh-CN':'可在浏览器菜单中安装；iPhone / iPad Safari 请使用「分享 → 添加到主屏幕」。','zh-TW':'可在瀏覽器選單中安裝；iPhone / iPad Safari 請使用「分享 → 加入主畫面」。','ja-JP':'ブラウザのメニューからインストールできます。iPhone / iPad の Safari では「共有 → ホーム画面に追加」を選びます。','en':'Install from your browser menu. In iPhone / iPad Safari, choose Share → Add to Home Screen.'},
  'pwa.offlineHelp': {'zh-CN':'首次联网缓存完成后可离线打开。离线汇率使用已有缓存；订阅与付款仍保存在此设备，请定期导出备份。','zh-TW':'首次連線快取完成後可離線開啟。離線匯率使用既有快取；訂閱與付款仍儲存在此裝置，請定期匯出備份。','ja-JP':'初回のオンラインキャッシュ完了後はオフラインで開けます。為替は保存済みの値を使用します。契約と支払いはこの端末に保存されるため、定期的にバックアップしてください。','en':'Open offline after the first successful online cache. Offline exchange rates use saved data. Subscriptions and payments stay on this device; export backups regularly.'},
  'pwa.statusPreparing': {'zh-CN':'正在准备离线资源…','zh-TW':'正在準備離線資源…','ja-JP':'オフライン用データを準備中…','en':'Preparing offline resources…'},
  'pwa.statusReady': {'zh-CN':'离线资源已就绪。','zh-TW':'離線資源已就緒。','ja-JP':'オフラインで利用できます。','en':'Offline resources are ready.'},
  'pwa.offlineReady': {'zh-CN':'当前离线，可以继续管理本地订阅。','zh-TW':'目前離線，可以繼續管理本機訂閱。','ja-JP':'オフラインです。この端末の契約は引き続き管理できます。','en':'You are offline. You can continue managing local subscriptions.'},
  'pwa.offlineUnavailable': {'zh-CN':'当前离线，尚未确认离线资源完整；请联网后重试。','zh-TW':'目前離線，尚未確認離線資源完整；請連線後重試。','ja-JP':'オフライン用データをまだ確認できません。オンラインになってから再試行してください。','en':'You are offline and the offline cache is not yet confirmed. Retry when connected.'},
  'pwa.unsupported': {'zh-CN':'此环境暂不支持离线安装，请使用 HTTPS 或本机 localhost。','zh-TW':'此環境暫不支援離線安裝，請使用 HTTPS 或本機 localhost。','ja-JP':'この環境ではオフラインインストールを利用できません。HTTPS または localhost を使用してください。','en':'Offline installation is unavailable here. Use HTTPS or localhost.'},
  'pwa.checkUpdate': {'zh-CN':'检查应用更新','zh-TW':'檢查應用程式更新','ja-JP':'アプリの更新を確認','en':'Check app updates'},
  'pwa.checking': {'zh-CN':'正在检查…','zh-TW':'正在檢查…','ja-JP':'確認中…','en':'Checking…'},
  'pwa.updateReady': {'zh-CN':'新版本已下载。保存或关闭表单后即可更新。','zh-TW':'新版本已下載。儲存或關閉表單後即可更新。','ja-JP':'新しいバージョンをダウンロードしました。フォームを保存または閉じてから更新できます。','en':'An update is downloaded. Save or close open forms before updating.'},
  'pwa.applyUpdate': {'zh-CN':'更新并重新打开','zh-TW':'更新並重新開啟','ja-JP':'更新して再読み込み','en':'Update & reload'},
  'pwa.updating': {'zh-CN':'正在更新…','zh-TW':'正在更新…','ja-JP':'更新中…','en':'Updating…'},
  'pwa.reload': {'zh-CN':'重新打开应用','zh-TW':'重新開啟應用程式','ja-JP':'アプリを再読み込み','en':'Reload app'},
  'pwa.reloadPending': {'zh-CN':'更新已就绪，请保存表单后重新打开应用。','zh-TW':'更新已就緒，請儲存表單後重新開啟應用程式。','ja-JP':'更新を適用しました。フォームを保存してからアプリを再読み込みしてください。','en':'The update is ready. Save your form, then reload the app.'},
  'pwa.busy': {'zh-CN':'请先保存或关闭正在编辑的表单，等待当前操作完成。','zh-TW':'請先儲存或關閉正在編輯的表單，等待目前操作完成。','ja-JP':'編集中のフォームを保存または閉じ、進行中の操作が完了するまでお待ちください。','en':'Save or close your open form and wait for the current operation to finish.'},
  'pwa.tabs': {'zh-CN':'请先关闭其他 sumi 标签页或窗口，再应用更新。','zh-TW':'請先關閉其他 sumi 分頁或視窗，再套用更新。','ja-JP':'ほかの sumi のタブやウィンドウを閉じてから更新してください。','en':'Close other sumi tabs or windows before applying the update.'},
  'pwa.updateFailed': {'zh-CN':'更新未完成，现有版本仍可使用。请联网后重试。','zh-TW':'更新未完成，既有版本仍可使用。請連線後重試。','ja-JP':'更新を完了できませんでした。現在のバージョンは引き続き利用できます。接続後に再試行してください。','en':'The update did not complete. Your current version is still available. Retry when connected.'},
  'pwa.registerFailed': {'zh-CN':'离线资源准备失败，现有数据未改变。请联网后检查应用更新。','zh-TW':'離線資源準備失敗，既有資料未變更。請連線後檢查應用程式更新。','ja-JP':'オフライン用データを準備できませんでした。保存済みデータは変更していません。接続後に更新を確認してください。','en':'Offline setup failed. Saved data is unchanged. Check app updates when connected.'},
  'pwa.installFailed': {'zh-CN':'安装未完成，可以稍后从浏览器菜单重试。','zh-TW':'安裝未完成，可稍後從瀏覽器選單重試。','ja-JP':'インストールを完了できませんでした。ブラウザのメニューから再試行できます。','en':'Installation did not complete. Retry from your browser menu.'}
});
