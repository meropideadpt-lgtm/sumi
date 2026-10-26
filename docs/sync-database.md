# 第九阶段 A：数据库、版本与权限基础

本文说明可审核 SQL、离线数据库测试和操作说明；它们已随第九阶段恢复检查点保存为 WIP。**没有对正式 Supabase 执行 SQL，没有创建正式表或 bucket，没有合并/部署应用。** 同分支中的前端同步原稿依赖此协议，仍需完成整体验收、用户审核，并另经用户确认在控制台执行 migration 后才能连通真实云数据。当前不要在正式项目执行脚本。

## 用户必须在 Supabase 控制台完成的步骤

1. 先在现有 sumi 导出完整 JSON 备份（含图片）；不要删除浏览器本地数据。如果项目已经有其他业务表/Storage policies，先导出其定义并检查是否与 `sumi_*` 命名冲突。
2. 审核 `supabase/migrations/202610250001_sync_foundation.sql`。打开自己的 Supabase 项目 → **SQL Editor → New query**，粘贴文件的完整内容并运行。只有此正式 migration 应在项目中执行；**不要执行 `supabase/tests/` 的 bootstrap 或测试夹具**。
3. 在 **Database → Tables** 核对四张 `sumi_*` 表均启用 RLS；在 **Storage** 核对 `sumi-private-logos` 为 **Private**，允许 PNG/JPEG/WebP，大小限制 12 MiB。SQL 会创建本 bucket 的 owner/hash 路径策略和禁止覆盖策略；不需要设置公开 bucket。
4. 业务同步上线前完成实际项目用户 A/B/匿名的隔离验收，最好在独立测试项目进行。真实测试账号和用户密码不提交仓库、不发送给开发工具。本文末尾列出待验收范围。
5. 前端 PR 审核发布后，在设置中先检查本地/云端状态，再明确选择首次上传或恢复。不要仅因新设备为空就上传空集合；前端以独立确认流程处理首次连接。

公开 URL 和 Publishable Key 继续由第八阶段配置使用；**不需要也不应提供数据库密码、Secret Key、service_role Key**。当前应用与 SQL 不使用这些管理员凭据。

## 表与数据兼容

| 表 | 作用 |
| --- | --- |
| `public.sumi_sync_records` | 每个订阅、付款、成本观察、偏好字段或业务扩展字段一行。主键 `(owner_id, kind, id)`，原 ID 与 JSON 字段完整保留。包含 schema_version、revision、seq、updated_at、deleted_at。 |
| `public.sumi_subscription_ids` | `(owner_id,id)` 关联锚点；付款与成本观察通过复合外键关联，防止跨所有者引用。允许保留本地早已删除订阅的旧付款/成本历史，不伪造可见订阅。 |
| `public.sumi_sync_clock` | 每个账号的增量游标；行锁贯穿写事务，保证提交顺序，不会发生取到后续游标后遗漏尚未提交的旧序号。 |
| `public.sumi_sync_operations` | `(owner_id,operation_id)` 成功回执、完整修改内容及结果。断网重试不会重复记账，同时保留已接受的付款修订与冻结汇率 JSON。 |

`kind` 为 `subscriptions`、`payments`、`costHistory`、`preferences`、`extensions`。前三者 payload 是原记录对象；偏好/扩展以原字段名为 id、`{"value": 原字段值}` 为 payload。每条记录独立版本，不能用整个用户 JSON 无条件覆盖另一端。未知业务字段、自定义分类、原始金额精度、付款成功/失败/归档状态和冻结汇率原样保存；服务器不会计算或更新汇率。

删除保留墓碑和递增版本；当前没有自动清除墓碑、回执、锚点或私有图片的任务。旧设备的低版本修改会冲突，不能让已删除记录自动复活。明确选择恢复也必须提交服务器当前版本。删除订阅时有未包含在批次中的活跃付款，或新付款指向已删除的订阅，整批返回关联冲突，要求用户处理。

## HTTP / RPC 协议

使用现有官方 Supabase SDK 的认证会话调用 `rpc`。两个函数都要求必需的 `p_expected_owner`，它是本机工作区的固定 UUID，用来阻止 SDK 在请求前瞬间切换账号导致误写另一工作区。服务器先验证它等于 `auth.uid()`，不相等或为空即拒绝并且不读写任何同步数据。真正 `owner_id` 始终由经过服务端 JWT 验证后的 `auth.uid()` 获取，不信任客户端声明的所有权。客户端在 change 中提交 `owner_id` 等额外 envelope 字段也会拒绝；旧的无 fence RPC overload 会删除（仅函数定义，不动数据）。

`public.sumi_sync_pull(p_expected_owner uuid, p_after bigint = 0, p_limit integer = 500)`：

```json
{"version":1,"cursor":"12","more":false,"records":[
  {"kind":"subscriptions","id":"old-id","payload":{"id":"old-id"},"revision":2,"deleted":false,"seq":"12"}
]}
```

示例 payload 仅示意协议；实际业务对象必须满足原模型。按每账号 seq 严格升序返回；最大 1000 行/页。`seq` 与 `cursor` 使用十进制字符串，防止 JavaScript 大整数精度丢失。返回完整分页后，客户端仍须验证所有业务/图片数据才提交本地游标。游标超过当前账号服务端上限会报错，不会默默返回“空云端”。

`public.sumi_sync_push(p_expected_owner uuid, p_operation_id uuid, p_changes jsonb)` 接收最多 1000 项、8 MiB 的原子批次：

```json
[{"kind":"preferences","id":"language","baseRevision":0,"payload":{"value":"en"},"deleted":false}]
```

成功返回 `{"ok":true,"records":[完整服务器记录]}`。同 operation ID / 同内容重试返回原回执；换内容复用 ID 会拒绝。每条变化取得独立 seq，付款历史和其续费日期放在同一业务批次时一起成功或一起失败。客户端不能绕开 RPC 直接写表。

版本或业务冲突返回：

```json
{"ok":false,"conflicts":[{"kind":"payments","id":"payment-id","baseRevision":1,
 "reason":"revision","remote":{"kind":"payments","id":"payment-id","payload":{},"revision":2,"deleted":false,"seq":"15"}}]}
```

`reason` 可以是 `revision`、`paid-cycle`、`parent-deleted` 或 `dependent-records`。不存在的 remote 为 null；关联/重复付款冲突的 remote 可能指向不同记录，因此必须按整个业务批次处理，不应简单逐字段“最后写入胜出”。任何冲突都不会部分写入本批记录或递增游标。业务校验错误用 SQLSTATE 22023 报错，未认证为 28000 或函数权限拒绝。

成功付款的 `(owner, subscription_id, cycleDate)` 唯一，包含旧归档账期；失败付款不占用成功账期。数据库约束可延迟到批次完成检查，允许同一批次删除/移动账期而不因顺序导致假冲突。

## RLS 与安全边界

四张私人表均 ENABLE + FORCE RLS。表策略同时具有 `USING (auth.uid() = owner_id)` 和 `WITH CHECK`。authenticated 只获 `sumi_sync_records` 的 SELECT 权限；其他直接读写权限撤销，所有变更经 CAS RPC。额外 trigger 禁止修改 owner_id。

RPC 使用 SECURITY DEFINER 是为了保持最小权限、让客户端不能直接改版本/游标/回执；函数固定 `search_path = pg_catalog`、所有表/辅助函数完全限定 schema、不拼接动态 SQL、从 `auth.uid()` 派生 owner 并额外校验固定工作区 fence。PUBLIC 和 anon 的 EXECUTE 已撤销，只有 authenticated 可调用。私有辅助 schema/函数不授权浏览器角色。

图片 bucket 是 Private，文件路径 `<auth.uid()>/<sha256>.png|jpg|webp`，不可修改/覆盖已存在的哈希路径；重复上传可下载并验证同一内容后复用。读/插入/删除都受当前 owner 路径约束。restrictive policy 会在项目已有宽泛 permissive policy 时继续拦截跨账号访问及覆盖，并保留其他 bucket 的既有规则。客户端不自动删除云图片；SQL 的 owner DELETE 权限仅表达所属用户的合法管理权限。

**SQL 无法解码对象字节或验证实际 SHA-256 内容。** Storage 服务的 bucket 限制约束 MIME/大小；客户端还必须检查类型、实际解码和内容哈希，并在下载后重新验证。测试中 Storage 表是兼容字段的模拟，不能证明真实 Storage HTTP upload/download/sign URL 服务已联调。已有项目中的其他 SECURITY DEFINER 函数、管理员角色和服务端自定义逻辑不在此 migration 的审计范围内。

## 重复执行、停用与回滚

migration 在事务内执行；重复执行会保留现有记录、墓碑、版本、回执和图片，仅重建本模块自己的函数/policies 并确保 bucket 为私有。既有不兼容同名表或缺少 Supabase 标准字段会使事务失败，应审查错误而非手动删除数据后重试。

需要撤回同步时，先阻止新写入并保留本机/云端备份，再在 SQL Editor 执行 `supabase/rollback/202610250001_disable_sync.sql`。该脚本只撤销浏览器角色的同步 API/表访问并增加禁止本 bucket 操作的 restrictive policy；**不删除任何表、业务行、墓碑、回执或图片，不关闭 RLS**。客户端随后显示错误/待同步，离线本地数据和队列应保留。

确认要恢复时重新执行 forward migration，它会撤销停用 policy 并恢复原权限/函数，数据保持原位置。彻底移除表或 bucket 是另一个破坏性决策，本文不提供自动 DROP/DELETE 脚本。

## 本地可重复验证

```sh
bash scripts/test-sync-db.sh
```

脚本使用固定摘要的 PostgreSQL 17 Alpine 镜像，启动临时 `--network none` 容器，通过本地 Docker socket / `docker exec psql` 操作。测试角色和 auth.uid/Storage schema 仅在此一次性容器内模拟；不读取 DATABASE_URL、正式项目 URL 或任何正式账号密码。容器中的 trust 认证只用于无外网、无映射端口的临时测试。

CI 就绪检查使用容器内 TCP `SELECT 1`，排除官方镜像初始化期间的临时 socket 服务；总期限 60 秒，每次探测最长 3 秒。SQL/RLS 测试失败不重试。运行日志及失败的 PostgreSQL 日志、容器 State、并发日志保存在 `tests/artifacts/sync-database/`，CI 上传为保留 7 天的 `sync-database-diagnostics` artifact。不会导出容器环境变量。

验证启动竞态及诊断保留：

```sh
SUMI_TEST_DB_STARTUP=1 python -m unittest discover -s tests -p test_sync_db_runner.py -v
```

测试覆盖 A/B/匿名读写隔离、默认 PUBLIC EXECUTE 撤销、owner 注入和重分配、A/B 令牌与 expected-owner 不匹配/空值拒绝、同文本 ID 跨账号隔离、复合外键、重复 operation、整批冲突回滚、付款周期唯一、失败/归档付款、历史 JSON/冻结汇率原样保存、墓碑/关联冲突、分页、并发时钟提交顺序、已有宽泛 Storage policy 防御、哈希路径/上传/覆盖/删除隔离、重复 migration 与非破坏性停用/恢复。

真实 Supabase 仍必须验收：项目中 actual RLS + Storage API（A 自己 CRUD，B 和匿名不能读写/签名/覆盖 A 图片）、JWT 到期/撤销、浏览器 fetch/CORS、私有下载、真实图片 MIME/尺寸拒绝，以及电脑/iPad/Android 的跨设备完整同步。**未对正式项目运行这些步骤，未验证真实 Safari/iPadOS 云同步。**
