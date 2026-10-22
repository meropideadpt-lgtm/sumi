# GitHub Pages 部署与实机试用

本次只发布现有网页版，基于六阶段已合并的 main；不新增原生应用、账号或云同步。应用的运行文件是静态 HTML/CSS/JavaScript，生产环境无需 npm 安装或后端，因此 GitHub Pages 合适。默认项目站点地址为 `https://meropideadpt-lgtm.github.io/sumi/`，必须以实际部署及 HTTP 验证确认是否上线。

## 一次性设置与自动部署

仓库管理员进入 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。部署使用内置 `GITHUB_TOKEN` 和 OIDC，不需要提供个人访问令牌。若环境保护要求批准，查看仓库 **Settings → Environments → github-pages** 和 Actions 运行中的 **Review deployments**，按仓库既有规则批准；不要为发布关闭既有保护。

工作流 `Static app checks` 在推送 main 时先执行全部测试，再执行 `deploy-pages`。也可在 **Actions → Static app checks → Run workflow**，选择 main 并运行。部署任务只对 main 启用，PR 和其他分支无法发布。仅同一发布环境的部署串行运行，正在发布的版本不会被强制中断；部署前再次确认当前提交仍是 main 最新版本，避免旧的慢速测试运行覆盖更新的版本。部署完成后，工作流从 GitHub 运行器实际请求公开网站，将页面、JavaScript、CSS、Logo、语言文件、Manifest、Service Worker 和品牌许可的内容与已验证产物逐项比较；404、错误页面或资源版本不一致都会使线上验证失败。

`deploy-pages` 使用 `actions/configure-pages@v5`、`actions/upload-pages-artifact@v3`、`actions/deploy-pages@v4`。网站尚未启用或令牌受限时，工作流明确失败；已通过的应用测试不代表部署成功。开启 Pages 后可重新运行失败任务，或者手动运行 main 的完整工作流。

## 发布内容与路径

`python scripts/build-pages.py` 验证 `sw-assets.js` 中每项资源的 SHA-256 后复制到 `_site/`。构建不会重新生成或变换应用文件，避免部分发布或换行变化破坏缓存完整性。目录包含 82 项 PWA 静态资源、`sw.js`、`sw-assets.js`、品牌来源与许可证文件、`.nojekyll`；不包含测试、Git 历史、本地备份或用户数据。

脚本、样式、品牌 Logo、语言资源、Manifest 图标使用相对地址；Manifest 的 `id`、`scope`、`start_url` 为 `./`。Service Worker 注册范围由站点目录解析为 `/sumi/`，不会接管同域其他项目。页面没有服务端路由，五个页面由现有应用内部切换，因此不需要服务器重写或复制首页到 404。

修改运行时文件后必须重新运行 `python scripts/update-pwa-cache.py` 并提交生成清单；文档、工作流、发布脚本改变无需重生成运行时清单。旧的完整离线版本在更新下载或校验失败时继续保留。下载完的新版本仍按现有设置入口主动更新，未保存的表单和其他标签页会阻止刷新。

## 2～3 天真实设备试用

1. 在原网址导出完整 JSON 备份，在 Pages 新网址导入。订阅原币金额、历史付款冻结汇率和图片随备份转移；旧网址数据不会自动读取到新域名。不同浏览器及手机/iPad 之间不自动同步。最新参考汇率缓存不包含在业务备份中，新网址需重新获取；历史付款的冻结汇率不受影响。同一个 `github.io` 域名的不同路径共享浏览器存储，因此 `/sumi/` 与同域预览路径不是独立账户。
2. 在线完成添加、编辑、取消/恢复、成功/失败付款、付款历史、统计筛选、多语言、深浅外观、Logo 上传及刷新后保留等操作；先使用少量测试数据，保留原始备份。
3. 在设置页记录汇率日期、最近获取时间和缓存状态，手动刷新；确认网页内实际 fetch/CORS 可用。失败时应保留旧缓存并明确提示，不把旧数据标为最新。
4. 等离线资源准备完成后，通过 Safari 的分享菜单「添加到主屏幕」，关闭页面再离线重开；测试本地订阅、付款历史、品牌图标和上传图片。没有成功完成首次缓存时，不能保证离线启动。
5. 检查竖屏手机首页仍紧凑且保留全部重要提醒；测试 iPad 竖横屏、软键盘、表单滚动、减少动态效果及系统深色模式变化。
6. 如有后续必要修复，先导出备份，再通过设置页主动更新；浏览器清除站点数据、私密模式及系统存储回收仍可能删除本机数据。

云环境的 Chromium 模拟不是真实 Safari/iPadOS。真实系统安装、照片方向、触控输入、键盘和存储回收只能由设备验收。若云环境策略阻止访问 `meropideadpt-lgtm.github.io` 或 Frankfurter，需将“部署已成功”和“此环境已实际联网验证”分开记录，不能把受限环境的 CONNECT 403 当作网站自身响应。
