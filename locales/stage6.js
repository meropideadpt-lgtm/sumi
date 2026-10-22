/* Stage-six presentation strings; stored subscription fields remain unchanged. */
globalThis.SumiMessages ||= {};
Object.assign(globalThis.SumiMessages, {
  'stage6.importBusy': {'zh-CN':'页面有新的更改或未完成的表单，导入已停止。请保存或关闭表单后重新导入。','zh-TW':'頁面有新的變更或未完成的表單，匯入已停止。請儲存或關閉表單後重新匯入。','ja-JP':'ページの変更または入力中のフォームがあるため、読み込みを中止しました。保存するかフォームを閉じて、もう一度読み込んでください。','en':'The page changed or a form is still open, so the import was stopped. Save or close the form and import again.'},
  'stage6.motion': {'zh-CN':'动态效果','zh-TW':'動態效果','ja-JP':'アニメーション','en':'Motion'},
  'stage6.motion.system': {'zh-CN':'跟随系统','zh-TW':'跟隨系統','ja-JP':'システムに合わせる','en':'Follow system'},
  'stage6.motion.reduce': {'zh-CN':'减少动态效果','zh-TW':'減少動態效果','ja-JP':'動きを減らす','en':'Reduce motion'},
  'stage6.uploadNote': {
    'zh-CN':'支持 PNG、JPEG、WebP，原图最大 12MB、8192 像素边长及 4000 万像素。自动压缩至最长 512 像素，优先保存在本机图片存储中；导出备份会包含图片。',
    'zh-TW':'支援 PNG、JPEG、WebP，原圖最大 12MB、8192 像素邊長及 4000 萬像素。自動壓縮至最長 512 像素，優先儲存在本機圖片儲存空間；匯出備份會包含圖片。',
    'ja-JP':'PNG・JPEG・WebPに対応。元画像は12MB、各辺8192ピクセル、4000万画素まで。長辺512ピクセル以下に圧縮して端末に保存します。書き出すバックアップには画像も含まれます。',
    'en':'PNG, JPEG or WebP, up to 12MB, 8192 pixels per side and 40 megapixels. Images are compressed to at most 512 pixels and stored on this device. Exported backups include the images.'
  },
  'stage6.missingLogo': {
    'zh-CN':'部分自定义 Logo 暂时无法读取，订阅和付款数据仍保留。请检查浏览器存储权限，或从完整备份恢复图片。',
    'zh-TW':'部分自訂 Logo 暫時無法讀取，訂閱和付款資料仍保留。請檢查瀏覽器儲存權限，或從完整備份還原圖片。',
    'ja-JP':'一部のカスタムロゴを読み込めません。サブスクリプションと支払いデータは保持されています。ブラウザーの保存権限を確認するか、完全なバックアップから画像を復元してください。',
    'en':'Some custom logos could not be read. Subscription and payment data is retained. Check browser storage permissions or restore the images from a complete backup.'
  }
});
