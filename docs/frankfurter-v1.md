# Frankfurter v1 接入记录

本阶段使用指定的 `https://api.frankfurter.dev/v1/latest` 和 `/v1/currencies`，无需 API Key、账号或付费。以下将官方源码核对、确定性测试和真实网络验证分开记录。

## 已核对的官方资料

官方仓库为 [lineofflight/frankfurter](https://github.com/lineofflight/frankfurter)，本轮核对固定提交 `fe133cda3a235dca38a88da2eb70126ce1044b8a`：

| 依据 | 核对内容 |
| --- | --- |
| [v1 OpenAPI](https://github.com/lineofflight/frankfurter/blob/fe133cda3a235dca38a88da2eb70126ce1044b8a/lib/public/v1/openapi.json) | `/latest` 与 `/currencies` 契约、默认基准 EUR、参考币种枚举 |
| [Quote::Base](https://github.com/lineofflight/frankfurter/blob/fe133cda3a235dca38a88da2eb70126ce1044b8a/lib/versions/v1/quote/base.rb) | 默认 `amount: 1.0`、`base: "EUR"`，报价和重定基准的计算 |
| [Quote::EndOfDay](https://github.com/lineofflight/frankfurter/blob/fe133cda3a235dca38a88da2eb70126ce1044b8a/lib/versions/v1/quote/end_of_day.rb) | 返回 `amount`、`base`、`date`、`rates`；使用 ECB 参考数据 |
| [CurrencyNames](https://github.com/lineofflight/frankfurter/blob/fe133cda3a235dca38a88da2eb70126ce1044b8a/lib/versions/v1/currency_names.rb) | 币种目录来自 ECB 数据并包含 EUR，实际目录随数据变化 |
| [v1 路由与弃用声明](https://github.com/lineofflight/frankfurter/blob/fe133cda3a235dca38a88da2eb70126ce1044b8a/lib/versions/v1.rb) | v1 标记 deprecated，弃用时间戳对应 2026-05-18，后继版本为 v2 |

默认 `/latest` 响应结构为：

```text
{
  amount: 1,
  base: "EUR",
  date: "YYYY-MM-DD",
  rates: { <币种代码>: <正数参考汇率>, ... }
}
```

这是源码核对得到的结构说明，不是本轮抓取的真实响应。默认 EUR 基准可能不在 `rates` 内，客户端仅为基准币种补入数学定义的 `EUR: 1`。其他缺失币种不能补成 1。

`/currencies` 是币种代码到完整名称的 JSON 对象。该固定提交的 v1 OpenAPI 包含 CNY、USD、JPY、HKD、EUR、GBP、KRW，没有 TWD；运行时仍以实际币种目录和本次有效报价的共同覆盖范围为准，不能将 v2 的更大币种范围当成 v1 支持范围。目录与报价可能不完全一致；目录中的币种缺少本次报价时，保留其他有效报价并明确提示该币种无法换算，不混用不同日期来补齐。

v1 已被官方标记弃用，但本轮仍保留指定版本。将来迁移 v2 应单独审查响应结构、数据来源和历史兼容性，不能静默替换。

## 当前真实请求验证状态

2026-10-22，在本轮云环境中请求以下地址，均于代理 CONNECT 阶段返回 HTTP 403：

- `https://frankfurter.dev/`
- `https://api.frankfurter.dev/v1/latest`
- `https://api.frankfurter.dev/v1/currencies`

因此本轮尚未验证真实响应内容、实时币种目录或部署站点的浏览器跨域行为。不能将官方源码核对或测试模拟称为真实 API 联调成功。环境草稿已记录 `frankfurter.dev` 与 `api.frankfurter.dev` 的网络需求；应用不需要任何密钥。

环境允许访问后，可执行下列只读检查，保持 TLS 验证开启：

```sh
curl --fail-with-body --silent --show-error --max-time 20 https://api.frankfurter.dev/v1/latest
curl --fail-with-body --silent --show-error --max-time 20 https://api.frankfurter.dev/v1/currencies
```

随后还需在部署页面检查浏览器获取、手动刷新、离线回退，以及日期与币种覆盖提示。遇到 HTTP、解析或结构错误，应保留最近一次成功缓存，不能放宽校验来让请求看似成功。

## 缓存与异常处理

- 缓存键为 `sumi-fx-cache-v1`，包含有效报价、币种目录、参考日期及成功获取时间。
- 24 小时内的成功缓存不重复自动请求；手动刷新可以主动更新。并发刷新合并为同一个请求过程，失败后自动重试有五分钟冷却。
- 启动、恢复可见和周期检查仅判断是否需要更新；接口没有请求成功时不会更新成功时间。
- 网络失败、超时、非成功 HTTP、无效 JSON、错误基准/金额、非法日期、非正数/非有限汇率等不替换最近一次成功缓存。
- 旧缓存继续可用，但显示其原始参考日期、最近成功获取时间及旧缓存状态。周末或节假日获取时间较新，不表示参考日期也变成当天。
- 缓存保存失败会提示：当前页面可能持有有效数据，但刷新后不能保证离线可用。业务订阅和付款数据使用独立存储，不因汇率缓存失败被覆盖。
- 同币种金额无需换算，数学汇率为 1；跨币种没有有效覆盖时返回明确的不可换算状态，不能以 1:1 或演示常数代替。

## 历史付款与统计

付款确认时保存 `fxSnapshot`，包括原币金额/币种、展示币种、当时汇率矩阵、参考日期、获取与确认时间、汇率和换算结果。刷新汇率不会改写它；切换展示币种也只使用这笔付款自己的冻结矩阵。修改历史金额时只依据原冻结数据重算，修改非金额字段不重抓当前汇率。

没有确认汇率的旧付款保留原始内容；确认时无法换算的新付款在用户明确选择后记录不可换算原因。它们可以按原币显示，但不会在以后获取汇率后自动补算或伪装为已冻结金额。实际付款汇总会保留次数，并明确标记尚未换算的记录。

摊销成本统计使用已观察到的订阅配置及当前参考汇率，与实际付款的冻结金额分开计算。没有过去配置或汇率的信息时，不会复制当前成本生成历史曲线。

## 测试范围

Node 和浏览器测试使用确定性响应，覆盖换算、24 小时缓存、并发去重、离线/失败回退、缺失币种、无效接口响应、历史冻结、展示币种切换及备份往返。浏览器用例拦截 Frankfurter 请求，不依赖外网；测试中的数值不是供应商的真实报价。

真实 API 联调与 Safari/iPadOS 设备验证仍需单独完成。参考汇率不是秒级实时交易报价，也不保证与支付平台实际结算汇率相同。
