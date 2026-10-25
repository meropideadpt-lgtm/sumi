# 第八阶段：私人登录与本地工作区

本阶段增加 Supabase 邮箱密码登录，不增加注册、邀请、社交登录、数据库表、Storage bucket 或自动同步。站点仍为 GitHub Pages 静态网页。首次打开显示全屏登录页，底部始终可以进入本地访客；选择访客后再次打开直接进入访客。设置页可以重新进入登录页、退出当前设备，或切换访客。

## 项目配置（公开参数已填写）

2026-10-25 已将用户提供的 `https://qcboybxjjegdwpbbtbaj.supabase.co` 和对应 `sb_publishable_…` 公开 Publishable Key 写入 `auth-config.js`，登录界面可使用该配置。没有使用数据库密码、Secret Key 或 service_role Key。若以后清空或填写无效配置，仍会禁用登录并保留访客入口。

认证回归使用虚构账号与模拟接口；新增接线测试直接读取仓库配置并拦截所有外部网络，核对 SDK 请求目标与公开 apikey。真实项目 `/auth/v1/settings` 的只读探测被云环境代理以 CONNECT 403 拒绝，尚未核验真实账号、控制台设置或真实 CORS。不能把模拟测试通过解释为真实登录成功。

公开参数已填写，无需再次提供。请在 Supabase Dashboard 打开现有项目并核对以下设置；第 1、2 步仅供以后核对配置来源：

1. **Project Settings → Data API** 复制 Project URL，例如 `https://<project-ref>.supabase.co`。部分控制台版本也在 Connect 面板显示它。
2. **Project Settings → API Keys → Publishable key** 复制以 `sb_publishable_` 开头的值。它是可用于网页的公开配置。不要复制 Secret Key、旧版 service_role JWT、数据库连接串或数据库密码。
3. **Authentication → Sign In / Providers → Email** 启用 Email/password；在 **User Signups** 关闭 **Allow new users to sign up**。同时关闭 Anonymous Sign-Ins 和不使用的其他登录提供商。隐藏注册按钮不能代替服务器关闭注册。
4. **Authentication → Users → Add user / Create new user** 手动创建自己的账号，设置密码并确认邮箱。已有账号无需重复创建。检查用户列表，确保只有自己授权的账号。不要把密码发到仓库或聊天中。
5. **Authentication → URL Configuration** 的 Site URL 设置为 `https://meropideadpt-lgtm.github.io/sumi/`。当前密码登录不使用跳转回调、魔法链接或密码重置页面；不需要配置宽泛通配跳转地址。
6. 如果启用了限制为单个会话的策略，关闭它以便电脑、手机、iPad 分别保持会话。具体有效期以项目配置为准；浏览器存储清理、服务端撤销、长时间离线或刷新令牌失效仍可能要求重新登录。

以下仅是配置格式示例；当前文件已填好。以后需要更换项目时，在独立分支修改 `auth-config.js`：

```js
globalThis.SumiAuthConfig = Object.freeze({
  url: 'https://<project-ref>.supabase.co',
  publishableKey: 'sb_publishable_<public-value>'
});
```

本次已执行 `python scripts/update-pwa-cache.py`：88 个运行时资源，版本 `483df9e1f6c2243c4f46f951`。后续修改配置仍须重新生成清单、运行测试并走 PR 审核。不得在已打包文件中临时替换配置，否则资源摘要与 PWA 缓存不匹配。本阶段不合并或部署；上述控制台设置也尚未代用户执行或核验。

## 会话行为

官方 `@supabase/supabase-js` **2.118.0** 原始 UMD 文件随站点提供，不依赖运行时 CDN。源码地址、npm integrity、文件 SHA-256 和 MIT 许可保存在 `assets/vendor/`；更新 SDK 必须一起更新这些记录及 PWA 清单。

SDK 负责密码登录、令牌存储、自动刷新、并发锁和跨标签页认证事件。应用不保存密码；提交后立即清空密码输入框，UI 层只接收用户 ID、邮箱和状态，不接收令牌。会话按项目隔离保存在浏览器中，JSON 业务备份不包含会话或令牌。

联网恢复时调用 `getSession()` 后再调用 `getUser()` 验证缓存身份；服务端拒绝或返回不同身份时停止进入账号工作区。请求失败仅为网络问题、或设备离线且 SDK 仍有有效缓存会话时，允许继续使用该账号本机记录，设置页标明缓存会话，恢复网络后重新验证。过期会话若无法刷新，可能需联网重新登录；访客始终可用。缓存身份只用于本机分区，不能作为未来云端鉴权依据。

会话被其他标签页退出或切换账号时，当前账号页面锁定且暂停写入，未保存表单保留在页面中。重新登录相同账号才能恢复；不同账号不能解锁原工作区。主动切换工作区会重载页面，先阻止未完成表单/导入/导出等操作。异步登录响应不会把已经选择访客的页面切回账号。

退出使用 SDK 的 `scope: 'local'`，仅退出当前设备。断网退出仍清除此设备的认证缓存，并明确提示服务端撤销未完成；它不意味着已有访问令牌立刻在所有地方失效。退出不删除任何业务记录或图片。切换到访客与退出登录是两个操作：切换访客保留账号会话，之后可以自动恢复。

认证请求带 `cache: 'no-store'` 和取消/超时控制；Service Worker 只缓存本域静态资源，不缓存认证响应、令牌或用户业务数据。首次离线使用仍要求先完成静态资源缓存。

## 数据隔离与兼容

| 内容 | 访客 | 账号 |
| --- | --- | --- |
| 订阅、付款、成本历史 | 原 `sumi-data-v1` | 下述账号前缀 + `sumi-data-v1` |
| 偏好设置 | 原 `sumi-prefs-v1` | 账号前缀 + `sumi-prefs-v1` |
| 保存恢复日志 | 原 `sumi-write-journal-v1` | 账号前缀 + `sumi-write-journal-v1` |
| 汇率缓存 | 原 `sumi-fx-cache-v1` | 账号前缀 + `sumi-fx-cache-v1` |
| IndexedDB 图片 | 原 `sumi-logo-assets-v1` | `sumi-logo-assets-v1:<encoded-project-origin>:<user-uuid>` |

账号前缀为 `sumi-account-v1:<encoded-project-origin>:<user-uuid>:`。项目 origin 用 `encodeURIComponent` 编码，UUID 转小写。认证缓存另用 `sumi-auth-v1:<encoded-project-origin>`；工作区选择另用 `sumi-workspace-choice-v1`（包含版本 1），登录页外观另用 `sumi-login-prefs-v1`。标签页优先记住自己的工作区，当前打开的工作区不会被其他标签页的选择自动替换。

旧访客键、记录标识、业务字段、付款金额与冻结汇率、备份版本 1、旧内嵌图片和内容哈希引用均不迁移、不删除。登录和退出不会改写访客业务字节；首次账号工作区为空是预期行为，不能把访客数据自动当成云端或账号数据。

现有 JSON 导入/导出作用于当前工作区；导入确认和恢复流程保持不变。可以显式导出访客备份再导入账号工作区，但这仍只是本机复制，导入会按现有提示替换目标工作区，其他设备不会自动收到数据。密码、会话、工作区前缀不进入普通业务备份。

这些分区防止程序在身份切换时误覆盖数据，不是浏览器本地数据加密：能控制该浏览器/同源脚本的人仍能读本机存储。未来服务器必须验证 JWT 并执行 RLS，不能信任客户端传入的 user ID。下一阶段设计见 [云同步准备](cloud-sync-design.md)。

## 真实设备与服务验收（尚未完成）

- 先导出原访客 JSON 备份。发布经审核版本后选择访客，核对订阅、付款历史、冻结汇率和自定义图片；断网新增/编辑/导出仍可用。
- 控制台确认关闭注册、账号已创建且邮箱已确认后，在电脑、手机、iPad 分别用自己的账号登录；刷新、关闭重开、后台停留超过令牌有效期后返回，检查会话恢复。不要把登录密码或令牌记录到截图/日志。
- 首次账号数据应为空；添加账号测试记录，切回访客核对旧记录，再返回账号核对测试记录。只导入可丢弃的备份进行导入测试。
- 两个标签页登录同一账号，在一个页打开未保存表单，在另一个页退出。前者应锁定、保留草稿，重登相同账号后可继续。
- 完成 PWA 缓存后断网重开，检查访客入口、有效缓存账号会话及离线退出提示；恢复网络后检查重新验证。过期令牌无法离线刷新属于预期限制。
- iPadOS Safari / 添加到主屏幕：四语言、深浅主题、原生下拉连续选择、密码自动填充、软键盘、旋转、触摸和 VoiceOver。当前 Chromium 模拟视口不能替代这些检查。
- 当前没有创建或读取私人数据库表/bucket，故没有本阶段 RLS 策略可执行测试；已有 Supabase 项目的表、权限和控制台设置也未核验。任何后续私有表/bucket 必须先通过 [RLS 验收矩阵](cloud-sync-design.md#rls-是启用云端业务读写的前置条件)。
