# 第八阶段验收记录：私人登录

日期：2026-10-24。基于合并 PR #7 后的 `main` 提交 `242d09f197532f1d261823da7f20f944a66d7cba`，独立分支 `feat/private-auth-stage8`。PR #1～#7 已合并；本阶段不更改 main、不合并、不部署。

## 实现与配置状态

- 全屏邮箱密码登录、底部本地访客、四语言、深浅/系统主题、设置页账号状态/退出/访客切换。
- 官方 Supabase SDK 2.118.0，登录、会话恢复、联网身份验证、自动刷新、跨标签页退出、网络/存储错误处理。不保存密码，不将令牌纳入业务备份。
- 工作区按项目和用户 UUID 固定隔离 localStorage、恢复日志、偏好、汇率缓存和 IndexedDB。旧访客键与数据结构保持不变，无自动迁移或上传。账号会话失效时保留页面草稿并暂停写入。
- `/sumi/` 相对路径和完整 PWA 静态缓存保留；认证响应不缓存，记住的访客不需要加载认证 SDK。
- 迁移、稳定 ID、版本、离线 outbox、删除墓碑、冲突、图片和未来 RLS 方案已文档化，未实现云同步或创建任何私人表/bucket。

**2026-10-25 已补入用户提供的 Supabase Project URL 与公开 Publishable Key，并重新生成 PWA 清单，保持现有 PR #8。真实登录、控制台关闭注册和项目权限仍尚未验收。** 新增接线测试读取实际配置文件，但所有外部请求被拦截；认证账号、密码和令牌仍为虚构夹具，不能把测试通过解释为真实账号登录成功。

## 本地测试

最终完整运行结果记录在 PR；执行命令：

```sh
python scripts/update-pwa-cache.py
for file in *.js locales/*.js; do node --check "$file" || exit 1; done
node --test tests/test_*.cjs
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/visual.py
python scripts/build-pages.py --output /path/to/new-artifact-directory
git diff --check
```

| 检查 | 结果 |
| --- | --- |
| JavaScript 语法（含官方 SDK） | 27 个文件通过 |
| Node 全套逻辑回归 | 230 / 230 通过，其中新增认证/隔离 19 项 |
| Python 全套浏览器/打包/发布验证回归 | 共 248 项；最终复跑与远端结果见本阶段 PR |
| 新增登录浏览器专项 | 20 / 20 通过；实际官方 SDK + 模拟 GoTrue API |
| 视觉基线比较 | 60 / 60 通过 |
| 静态构建 | 99 个文件；88 个运行时资源的摘要校验通过 |
| 构建产物 `/sumi/` 本地 HTTP + Chromium 检查 | 99 / 99 文件逐字节匹配，88 个缓存资源，离线重开、四语言货币/分类、55 个品牌资源和 17 个默认图标均通过；无页面异常 |
| 差异空白检查 | 通过 |

初次完整 Python 运行中，247 项通过，1 项发布测试仍按旧版 90 个资源计数；新增认证资源后应为 98（加 `.nojekyll` 共 99）。已修正计数并明确检查认证脚本、SDK 和许可，发布验证专项 14 项通过。完整复跑与对应提交的远端 CI 结果在 PR 描述持续记录，不能把这次初始失败当作完整通过。

新增认证测试覆盖：密码不持久化、恢复时服务端验证和身份不一致拒绝、SDK 自动刷新、无效/过期会话、跨标签页退出保留草稿、并发/迟到认证结果、离线退出、存储失败、账号 A/B/访客隔离、原付款与扩展字段字节保留、账号独立图片库及备份不含令牌。额外两项真实 Chromium Service Worker 测试覆盖登录壳离线打开、缓存账号会话及账号本地记录离线重开。

四语言登录界面在 320/390/820/1440 像素视口、深浅主题及触摸模拟下检查布局、按钮触控尺寸及入口交互；系统主题变化和原生选择节点稳定性覆盖。视觉基线保留旧 50 张中的 45 张，5 张设置页因新增账号面板审核更新，新增 8 张登录页与 2 张账号设置页。

## 文件清单

新增运行时：`auth-config.js`、`workspace.js`、`auth.js`、`access.js`、`locales/auth.js`、原版 `supabase-sdk.js`，以及 `assets/vendor/LICENSE-supabase.txt` / `supabase.json` 来源与摘要。

修改运行时：`index.html`、`app.js`、`logo-store.js`、`theme.js`、`motion.js`、`styles.css`、生成的 `sw-assets.js`。`scripts/build-pages.py` 增加打包 SDK 许可和来源记录；没有修改部署触发规则。

新增测试：`tests/test_auth.cjs`、`tests/auth_support.py`、`tests/test_auth_browser.py`。修改 `tests/browser_support.py`、`test_category_picker.py`、`test_select_regression.py`、`test_stage4.py` 的访客启动夹具；原有业务断言保留。扩展 `test_stage6_pwa.py`、`test_pages_verify.py`、`visual.py`；增加/更新 15 张已审核基线。

新增文档：本记录、[私人登录与控制台设置](private-auth.md)、[后续同步设计](cloud-sync-design.md)；更新 `README.md` 和 `tests/README.md`。

## 限制与待验收

- **尚未完成真实 iPadOS Safari / iPhone / macOS Safari 设备验证。** Chromium 触摸和视口模拟不是实机；软键盘、自动填充、原生下拉、VoiceOver、后台长时间挂起、主屏幕 PWA 存储行为需复测。
- **尚未完成真实 Supabase 联调。** 公开配置已填写；控制台禁止注册并创建/确认自己的账号后，需在各设备实际登录、刷新、退出、断网重开和恢复网络验收；无需分享密码。控制台操作没有代执行。
- **未创建私人表或 bucket，没有远端 RLS 测试结果。** 已有项目权限无法据当前测试推断；后续启用云端业务读写前必须按设计中的 A/B/匿名矩阵验证 RLS。
- 同一账号在不同设备的业务数据仍独立。本机分区不加密，不能防止控制该浏览器或同源脚本的人读取本地内容。
- 离线缓存会话仅允许本地使用；过期/失效刷新令牌可能要求联网重登。离线退出无法保证服务端立即撤销令牌，界面已明确提示。
- Frankfurter 回归使用模拟接口；本阶段未新增真实网络/CORS 验收。原跨标签页严格同时业务写入等存储限制仍然存在。
- GitHub 远端 CI 最终状态和对应提交以 PR 检查记录为准；部署任务应跳过。此分支未发布到线上。

## 2026-10-25 公开配置补充

修改 `auth-config.js` 和生成的 `sw-assets.js`，88 个缓存资源，版本从 `8c98984b421c66d944ec16c3` 更新为 `483df9e1f6c2243c4f46f951`。未改动业务逻辑、存储结构或旧工作区键。新增 `test_published_public_config_connects_sdk_and_preserves_guest_data` 直接加载仓库配置，验证按钮启用、SDK 的目标 URL/apikey、账号隔离及切回访客后原数据保持不变；所有外部网络被拦截，不会实际尝试登录。

当前云环境网络代理拒绝真实项目的 `/auth/v1/settings` 请求（CONNECT 403），因此控制台设置、真实 CORS、账号密码登录与真实设备测试仍未完成。模拟测试与实际网络探测的结论分开记录。最终本地测试与新提交的远端 CI 结果见 [PR #8](https://github.com/meropideadpt-lgtm/sumi/pull/8)。本次不创建新 PR，不合并或部署。

本次本地结果：27 个 JS 文件语法检查通过；Node 完整套件 **230/230**；认证、原订阅/存储、PWA、打包与发布校验的 Python 回归 **92/92**（107.320 秒，其中认证 21 项）；99 个文件构建与 88 个资源摘要核验通过；`git diff --check` 通过。完整 Python 套件与视觉截图交由本提交的远端 CI 执行，最终结果记录在 PR 描述，不沿用旧提交的 CI 状态。
