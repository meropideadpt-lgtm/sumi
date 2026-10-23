# 预置目录与品牌 Logo 来源

第四阶段提供 **72 个预置服务、9 个类别**：影音娱乐、音乐音频、AI 工具、云存储、办公效率、游戏、设计、学习教育与开发工具。目录不包含价格、币种、周期或续费日期；选择服务只帮助填写身份信息，仍允许自由输入自定义名称。

其中 **55 项使用有来源的 SVG 品牌轮廓，17 项使用统一的中性应用网格图标**。内置图标统一为扁平单色：浅色主题深色、深色主题浅色；默认图标不声称是服务 Logo，也不使用 emoji、名称首字母或绘制的近似品牌图案。用户上传图片保持原图与原有存储格式。

## 来源与许可核对

本轮从下列固定版本取得文件，直接随网站发布。浏览器加载预置 Logo 不依赖外部 CDN、API Key 或第三方请求。

| 来源 | 固定版本 | 集合许可与保留文件 |
| --- | --- | --- |
| [Simple Icons](https://github.com/simple-icons/simple-icons/tree/955f17f35634cd58de1748204059bce380d379af) | npm `simple-icons@16.35.0`，提交 `955f17f35634cd58de1748204059bce380d379af` | [CC0 1.0](../assets/brands/LICENSE-simple-icons.txt) 及 [原项目声明](../assets/brands/DISCLAIMER-simple-icons.md) |
| [Lobe Icons](https://github.com/lobehub/lobe-icons/tree/7eb8d8c5203a2cc57c7acbb0212f436d9a609305) | npm `@lobehub/icons-static-svg@1.97.0`，提交 `7eb8d8c5203a2cc57c7acbb0212f436d9a609305` | [MIT，保留 LobeHub 版权声明](../assets/brands/LICENSE-lobe-icons.txt) |
| [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons/tree/320c819da84048d5a3066e2578bfa83be9019fdf) | 提交 `320c819da84048d5a3066e2578bfa83be9019fdf` | [Apache 2.0](../assets/brands/LICENSE-dashboard-icons.txt)；固定来源没有单独 NOTICE 文件 |

两个 npm 压缩包均核对了 registry 元数据提供的 SHA-512 完整性。每个本地 SVG 的 SHA-256、原始路径、下载地址、来源提交、集合许可、已提供的品牌许可/规范链接和修改记录保存在 [manifest.json](../assets/brands/manifest.json)。GitHub Copilot 在 Simple Icons 中另标记为 MIT；同时保留 [Primer Octicons 的 MIT 声明](../assets/brands/LICENSE-primer-octicons.txt)。

集合许可不等同于所有品牌权利的授权。Simple Icons 明确说明：集合采用 CC0，不表示每个品牌标志都没有第三方许可、商标或品牌规范限制；商标权没有因此被放弃。Dashboard Icons 也说明标志用于识别，不表示品牌背书。本轮检查了来源、集合许可证、源项目已有的单独许可元数据和可追溯性，不宣称已经获得每家品牌的商业授权或逐一核验官网的最新品牌条款。公开发布和后续品牌更新时应继续遵守对应规范并响应权利人要求。

## 资产处理与加载

- 第二轮优化统一为单色轮廓。原本单色的 47 个 SVG 保持文件不变；8 个复杂 SVG（Disney+、Xbox Game Pass、PlayStation Plus、Google One、Microsoft 365、OneDrive、Adobe、Prime Video）移除颜色、渐变、背景或光影，仍使用原始路径坐标。PlayStation Plus 以原按键符号作镂空并移除立体投影，Disney+ 调整 viewBox 以适配去除背景后的内容。Google One 保留第四阶段补充的 viewBox。逐项处理说明、原始与当前 SHA-256 均记录在 manifest 中。
- 只有精确匹配目录路径（包括旧 URL 的同品牌映射）的图片使用内置单色主题样式，背景透明；自定义 data URL、IndexedDB 引用及其他原有图片不应用单色滤镜。未改变目录路径、订阅 Logo 字段或上传数据。
- YouTube Premium 使用其 YouTube 播放标志，iCloud+ 使用 iCloud 云形标志，ChatGPT 使用其采用的 OpenAI 结形标志。目录没有将这些标志称为套餐专属徽章。
- 目录中的 Adobe 代表 Adobe 品牌，不冒充 Photoshop 等单独应用的图标。腾讯视频、QQ 音乐、百度网盘等具体服务没有被腾讯/QQ/百度母品牌标志替代。
- 预置标志是本地静态 SVG 文件。已检查 XML 可解析性、尺寸和自包含性；没有脚本、事件属性、`foreignObject`、嵌入图片、外部引用、动画或远程字体。55 个文件均已通过 Chromium 解码与人工总览检查；这不等于真实 Safari/iPadOS 设备验证。
- 搜索和选择使用稳定目录 ID。旧数据中可精确匹配到同一品牌的原 Simple Icons URL 可在显示时使用本地资产，旧 localStorage 字符串不因此被重写。旧 `anthropic`、`google`、`microsoft` 地址没有被当成 Claude、Google One、Microsoft 365 的同一标志映射。
- 图片不可读取或未知 Logo 使用统一的中性应用网格 SVG，不使用浏览器损坏图片或“图片”占位符；已加载内置资源保留 `<img>` 的解码与错误处理机制。图片失败不影响订阅数据。用户自行上传的图片与本目录品牌资产分开验证。

## 暂无可靠标志的目录项

以下服务已保留名称、类别和别名检索，但所核对来源未提供可可靠匹配该具体服务的标志，因此使用中性占位图。它们仍可选择，并可上传用户自己的图片：

腾讯视频、爱奇艺、优酷、芒果 TV、QQ 音乐、喜马拉雅、百度网盘、阿里云盘、WPS、Nintendo Switch Online、EA Play、Ubisoft+、Canva、Brilliant、得到、知乎盐选会员、扇贝。

## 已打包标志清单

下表链接均指向固定来源或固定 npm 包；更细的官方品牌来源、规范链接和哈希见 manifest。未提供单独品牌许可元数据时，不能推断其不存在。

| 服务 | 本地文件 | 来源 | 集合许可 |
| --- | --- | --- | --- |
| Netflix | [netflix.svg](../assets/brands/netflix.svg) | [simple-icons: icons/netflix.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/netflix.svg) | CC0-1.0 |
| YouTube Premium | [youtube-premium.svg](../assets/brands/youtube-premium.svg) | [simple-icons: icons/youtube.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/youtube.svg) | CC0-1.0 |
| Disney+ | [disney-plus.svg](../assets/brands/disney-plus.svg) | [dashboard-icons: svg/disney-plus.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/disney-plus.svg) | Apache-2.0 |
| 哔哩哔哩 | [bilibili.svg](../assets/brands/bilibili.svg) | [simple-icons: icons/bilibili.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/bilibili.svg) | CC0-1.0 |
| Apple TV+ | [apple-tv-plus.svg](../assets/brands/apple-tv-plus.svg) | [dashboard-icons: svg/apple-tv-plus.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/apple-tv-plus.svg) | Apache-2.0 |
| Prime Video | [prime-video.svg](../assets/brands/prime-video.svg) | [dashboard-icons: svg/prime-video-alt.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/prime-video-alt.svg) | Apache-2.0 |
| Crunchyroll | [crunchyroll.svg](../assets/brands/crunchyroll.svg) | [simple-icons: icons/crunchyroll.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/crunchyroll.svg) | CC0-1.0 |
| Spotify | [spotify.svg](../assets/brands/spotify.svg) | [simple-icons: icons/spotify.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/spotify.svg) | CC0-1.0 |
| Apple Music | [apple-music.svg](../assets/brands/apple-music.svg) | [simple-icons: icons/applemusic.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/applemusic.svg) | CC0-1.0 |
| 网易云音乐 | [netease-cloud-music.svg](../assets/brands/netease-cloud-music.svg) | [simple-icons: icons/neteasecloudmusic.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/neteasecloudmusic.svg) | CC0-1.0 |
| YouTube Music | [youtube-music.svg](../assets/brands/youtube-music.svg) | [simple-icons: icons/youtubemusic.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/youtubemusic.svg) | CC0-1.0 |
| TIDAL | [tidal.svg](../assets/brands/tidal.svg) | [simple-icons: icons/tidal.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/tidal.svg) | CC0-1.0 |
| Deezer | [deezer.svg](../assets/brands/deezer.svg) | [simple-icons: icons/deezer.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/deezer.svg) | CC0-1.0 |
| Audible | [audible.svg](../assets/brands/audible.svg) | [simple-icons: icons/audible.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/audible.svg) | CC0-1.0 |
| ChatGPT | [chatgpt.svg](../assets/brands/chatgpt.svg) | [lobe-icons: icons/openai.svg](https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.97.0.tgz) | MIT |
| Claude | [claude.svg](../assets/brands/claude.svg) | [simple-icons: icons/claude.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/claude.svg) | CC0-1.0 |
| Gemini | [gemini.svg](../assets/brands/gemini.svg) | [simple-icons: icons/googlegemini.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/googlegemini.svg) | CC0-1.0 |
| Perplexity | [perplexity.svg](../assets/brands/perplexity.svg) | [simple-icons: icons/perplexity.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/perplexity.svg) | CC0-1.0 |
| Midjourney | [midjourney.svg](../assets/brands/midjourney.svg) | [lobe-icons: icons/midjourney.svg](https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.97.0.tgz) | MIT |
| Cursor | [cursor.svg](../assets/brands/cursor.svg) | [lobe-icons: icons/cursor.svg](https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.97.0.tgz) | MIT |
| GitHub Copilot | [github-copilot.svg](../assets/brands/github-copilot.svg) | [simple-icons: icons/githubcopilot.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/githubcopilot.svg) | CC0-1.0 |
| Grok | [grok.svg](../assets/brands/grok.svg) | [lobe-icons: icons/grok.svg](https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.97.0.tgz) | MIT |
| Poe | [poe.svg](../assets/brands/poe.svg) | [simple-icons: icons/poe.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/poe.svg) | CC0-1.0 |
| iCloud+ | [icloud-plus.svg](../assets/brands/icloud-plus.svg) | [simple-icons: icons/icloud.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/icloud.svg) | CC0-1.0 |
| Google One | [google-one.svg](../assets/brands/google-one.svg) | [dashboard-icons: svg/google-one.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/google-one.svg) | Apache-2.0 |
| Dropbox | [dropbox.svg](../assets/brands/dropbox.svg) | [simple-icons: icons/dropbox.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/dropbox.svg) | CC0-1.0 |
| OneDrive | [onedrive.svg](../assets/brands/onedrive.svg) | [dashboard-icons: svg/microsoft-onedrive.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/microsoft-onedrive.svg) | Apache-2.0 |
| MEGA | [mega.svg](../assets/brands/mega.svg) | [simple-icons: icons/mega.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/mega.svg) | CC0-1.0 |
| Proton Drive | [proton-drive.svg](../assets/brands/proton-drive.svg) | [simple-icons: icons/protondrive.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/protondrive.svg) | CC0-1.0 |
| Microsoft 365 | [microsoft-365.svg](../assets/brands/microsoft-365.svg) | [dashboard-icons: svg/microsoft-365.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/microsoft-365.svg) | Apache-2.0 |
| Notion | [notion.svg](../assets/brands/notion.svg) | [simple-icons: icons/notion.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/notion.svg) | CC0-1.0 |
| Evernote | [evernote.svg](../assets/brands/evernote.svg) | [simple-icons: icons/evernote.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/evernote.svg) | CC0-1.0 |
| Todoist | [todoist.svg](../assets/brands/todoist.svg) | [simple-icons: icons/todoist.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/todoist.svg) | CC0-1.0 |
| TickTick | [ticktick.svg](../assets/brands/ticktick.svg) | [simple-icons: icons/ticktick.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/ticktick.svg) | CC0-1.0 |
| Grammarly | [grammarly.svg](../assets/brands/grammarly.svg) | [simple-icons: icons/grammarly.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/grammarly.svg) | CC0-1.0 |
| Zoom | [zoom.svg](../assets/brands/zoom.svg) | [simple-icons: icons/zoom.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/zoom.svg) | CC0-1.0 |
| PlayStation Plus | [playstation-plus.svg](../assets/brands/playstation-plus.svg) | [dashboard-icons: svg/playstation-plus.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/playstation-plus.svg) | Apache-2.0 |
| Xbox Game Pass | [xbox-game-pass.svg](../assets/brands/xbox-game-pass.svg) | [dashboard-icons: svg/xbox-game-pass.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/xbox-game-pass.svg) | Apache-2.0 |
| Figma | [figma.svg](../assets/brands/figma.svg) | [simple-icons: icons/figma.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/figma.svg) | CC0-1.0 |
| Adobe | [adobe.svg](../assets/brands/adobe.svg) | [dashboard-icons: svg/adobe.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/320c819da84048d5a3066e2578bfa83be9019fdf/svg/adobe.svg) | Apache-2.0 |
| Sketch | [sketch.svg](../assets/brands/sketch.svg) | [simple-icons: icons/sketch.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/sketch.svg) | CC0-1.0 |
| Framer | [framer.svg](../assets/brands/framer.svg) | [simple-icons: icons/framer.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/framer.svg) | CC0-1.0 |
| Webflow | [webflow.svg](../assets/brands/webflow.svg) | [simple-icons: icons/webflow.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/webflow.svg) | CC0-1.0 |
| Duolingo | [duolingo.svg](../assets/brands/duolingo.svg) | [simple-icons: icons/duolingo.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/duolingo.svg) | CC0-1.0 |
| Coursera | [coursera.svg](../assets/brands/coursera.svg) | [simple-icons: icons/coursera.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/coursera.svg) | CC0-1.0 |
| Udemy | [udemy.svg](../assets/brands/udemy.svg) | [simple-icons: icons/udemy.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/udemy.svg) | CC0-1.0 |
| Skillshare | [skillshare.svg](../assets/brands/skillshare.svg) | [simple-icons: icons/skillshare.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/skillshare.svg) | CC0-1.0 |
| GitHub | [github.svg](../assets/brands/github.svg) | [simple-icons: icons/github.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/github.svg) | CC0-1.0 |
| JetBrains | [jetbrains.svg](../assets/brands/jetbrains.svg) | [simple-icons: icons/jetbrains.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/jetbrains.svg) | CC0-1.0 |
| GitLab | [gitlab.svg](../assets/brands/gitlab.svg) | [simple-icons: icons/gitlab.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/gitlab.svg) | CC0-1.0 |
| Replit | [replit.svg](../assets/brands/replit.svg) | [simple-icons: icons/replit.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/replit.svg) | CC0-1.0 |
| Vercel | [vercel.svg](../assets/brands/vercel.svg) | [simple-icons: icons/vercel.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/vercel.svg) | CC0-1.0 |
| Sentry | [sentry.svg](../assets/brands/sentry.svg) | [simple-icons: icons/sentry.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/sentry.svg) | CC0-1.0 |
| Postman | [postman.svg](../assets/brands/postman.svg) | [simple-icons: icons/postman.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/postman.svg) | CC0-1.0 |
| Docker | [docker.svg](../assets/brands/docker.svg) | [simple-icons: icons/docker.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/955f17f35634cd58de1748204059bce380d379af/icons/docker.svg) | CC0-1.0 |

## 更新方式

更换标志时同时更新固定来源、许可声明、哈希和目录对应关系；不要仅把 URL 指向 `latest`。新增别名应核对它确实对应同一服务，例如 Evernote 与印象笔记不是可直接互换的同一账号服务。品牌移除或来源不再可靠时，将目录项的 `logo` 设为 `null` 并记录原因，订阅原始数据继续保留。

`tests/test_catalog.cjs` 验证目录规模、分类、别名/全角搜索、排序与限量、无价格字段、不可变性、每个资产及其来源哈希、静态 SVG 安全约束、无渐变/彩色填充、许可证文件和缺失品牌的显式空值。`tests/test_icons_round2.py` 验证全部内置图标真实解码像素为单色且非空、浅深色/跟随系统显示、失败默认图标，以及旧自定义图片与原始数据不变。
