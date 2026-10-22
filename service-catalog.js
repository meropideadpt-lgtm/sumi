/* Curated service names and locally vendored brand marks; never preset subscription prices. */
const SumiCatalog = (() => {
  const source = [
  {
    "id": "netflix",
    "name": "Netflix",
    "category": "影音娱乐",
    "aliases": [
      "奈飞",
      "网飞",
      "奈飛",
      "Netflix Premium"
    ],
    "logo": "assets/brands/netflix.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/netflix"
    ]
  },
  {
    "id": "youtube-premium",
    "name": "YouTube Premium",
    "category": "影音娱乐",
    "aliases": [
      "YouTube",
      "油管",
      "油管会员",
      "YouTube Red"
    ],
    "logo": "assets/brands/youtube-premium.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/youtube"
    ]
  },
  {
    "id": "disney-plus",
    "name": "Disney+",
    "category": "影音娱乐",
    "aliases": [
      "Disney Plus",
      "迪士尼",
      "迪士尼加"
    ],
    "logo": "assets/brands/disney-plus.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/disneyplus"
    ]
  },
  {
    "id": "bilibili",
    "name": "哔哩哔哩",
    "category": "影音娱乐",
    "aliases": [
      "Bilibili",
      "B站",
      "bili",
      "哔哩哔哩大会员"
    ],
    "logo": "assets/brands/bilibili.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/bilibili"
    ]
  },
  {
    "id": "tencent-video",
    "name": "腾讯视频",
    "category": "影音娱乐",
    "aliases": [
      "Tencent Video",
      "腾讯视频VIP",
      "騰訊視頻"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "iqiyi",
    "name": "爱奇艺",
    "category": "影音娱乐",
    "aliases": [
      "iQIYI",
      "爱奇艺VIP",
      "愛奇藝",
      "aqy"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "youku",
    "name": "优酷",
    "category": "影音娱乐",
    "aliases": [
      "Youku",
      "优酷VIP",
      "優酷"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "mango-tv",
    "name": "芒果 TV",
    "category": "影音娱乐",
    "aliases": [
      "Mango TV",
      "芒果TV",
      "芒果会员"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "apple-tv-plus",
    "name": "Apple TV+",
    "category": "影音娱乐",
    "aliases": [
      "Apple TV Plus",
      "Apple TV",
      "苹果电视",
      "蘋果電視"
    ],
    "logo": "assets/brands/apple-tv-plus.svg",
    "legacyUrls": []
  },
  {
    "id": "prime-video",
    "name": "Prime Video",
    "category": "影音娱乐",
    "aliases": [
      "Amazon Prime Video",
      "亚马逊视频",
      "亞馬遜視頻"
    ],
    "logo": "assets/brands/prime-video.svg",
    "legacyUrls": []
  },
  {
    "id": "crunchyroll",
    "name": "Crunchyroll",
    "category": "影音娱乐",
    "aliases": [
      "脆脆卷",
      "Crunchy Roll"
    ],
    "logo": "assets/brands/crunchyroll.svg",
    "legacyUrls": []
  },
  {
    "id": "spotify",
    "name": "Spotify",
    "category": "音乐音频",
    "aliases": [
      "声田",
      "聲田",
      "Spotify Premium"
    ],
    "logo": "assets/brands/spotify.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/spotify"
    ]
  },
  {
    "id": "apple-music",
    "name": "Apple Music",
    "category": "音乐音频",
    "aliases": [
      "苹果音乐",
      "蘋果音樂",
      "AppleMusic"
    ],
    "logo": "assets/brands/apple-music.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/applemusic"
    ]
  },
  {
    "id": "qq-music",
    "name": "QQ 音乐",
    "category": "音乐音频",
    "aliases": [
      "QQ Music",
      "QQ音乐",
      "绿钻",
      "綠鑽",
      "QQ音樂"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "netease-cloud-music",
    "name": "网易云音乐",
    "category": "音乐音频",
    "aliases": [
      "NetEase Cloud Music",
      "网易云",
      "网抑云",
      "網易雲音樂",
      "wyymusic"
    ],
    "logo": "assets/brands/netease-cloud-music.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/neteasecloudmusic"
    ]
  },
  {
    "id": "youtube-music",
    "name": "YouTube Music",
    "category": "音乐音频",
    "aliases": [
      "油管音乐",
      "YouTube Music Premium",
      "YT Music"
    ],
    "logo": "assets/brands/youtube-music.svg",
    "legacyUrls": []
  },
  {
    "id": "tidal",
    "name": "TIDAL",
    "category": "音乐音频",
    "aliases": [
      "Tidal Music",
      "潮汐音乐"
    ],
    "logo": "assets/brands/tidal.svg",
    "legacyUrls": []
  },
  {
    "id": "deezer",
    "name": "Deezer",
    "category": "音乐音频",
    "aliases": [
      "Deezer Premium"
    ],
    "logo": "assets/brands/deezer.svg",
    "legacyUrls": []
  },
  {
    "id": "ximalaya",
    "name": "喜马拉雅",
    "category": "音乐音频",
    "aliases": [
      "Ximalaya",
      "喜馬拉雅",
      "喜马拉雅VIP",
      "喜马拉雅听书"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "audible",
    "name": "Audible",
    "category": "音乐音频",
    "aliases": [
      "亚马逊有声书",
      "Amazon Audible",
      "有声书Audible"
    ],
    "logo": "assets/brands/audible.svg",
    "legacyUrls": []
  },
  {
    "id": "chatgpt",
    "name": "ChatGPT",
    "category": "AI 工具",
    "aliases": [
      "OpenAI",
      "Chat GPT",
      "GPT",
      "ChatGPT Plus",
      "ChatGPT Pro"
    ],
    "logo": "assets/brands/chatgpt.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/openai"
    ]
  },
  {
    "id": "claude",
    "name": "Claude",
    "category": "AI 工具",
    "aliases": [
      "Anthropic",
      "Claude AI",
      "克劳德",
      "克勞德"
    ],
    "logo": "assets/brands/claude.svg",
    "legacyUrls": []
  },
  {
    "id": "gemini",
    "name": "Gemini",
    "category": "AI 工具",
    "aliases": [
      "Google Gemini",
      "Bard",
      "谷歌AI",
      "双子座",
      "雙子座"
    ],
    "logo": "assets/brands/gemini.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/googlegemini"
    ]
  },
  {
    "id": "perplexity",
    "name": "Perplexity",
    "category": "AI 工具",
    "aliases": [
      "Perplexity AI",
      "Perplexity Pro",
      "PPLX"
    ],
    "logo": "assets/brands/perplexity.svg",
    "legacyUrls": []
  },
  {
    "id": "midjourney",
    "name": "Midjourney",
    "category": "AI 工具",
    "aliases": [
      "Mid Journey",
      "MJ",
      "AI绘画"
    ],
    "logo": "assets/brands/midjourney.svg",
    "legacyUrls": []
  },
  {
    "id": "cursor",
    "name": "Cursor",
    "category": "AI 工具",
    "aliases": [
      "Cursor AI",
      "Cursor Pro",
      "AI编辑器"
    ],
    "logo": "assets/brands/cursor.svg",
    "legacyUrls": []
  },
  {
    "id": "github-copilot",
    "name": "GitHub Copilot",
    "category": "AI 工具",
    "aliases": [
      "Copilot",
      "GitHub AI",
      "代码助手"
    ],
    "logo": "assets/brands/github-copilot.svg",
    "legacyUrls": []
  },
  {
    "id": "grok",
    "name": "Grok",
    "category": "AI 工具",
    "aliases": [
      "xAI",
      "Grok AI",
      "SuperGrok"
    ],
    "logo": "assets/brands/grok.svg",
    "legacyUrls": []
  },
  {
    "id": "poe",
    "name": "Poe",
    "category": "AI 工具",
    "aliases": [
      "Poe AI",
      "Quora Poe"
    ],
    "logo": "assets/brands/poe.svg",
    "legacyUrls": []
  },
  {
    "id": "icloud-plus",
    "name": "iCloud+",
    "category": "云存储",
    "aliases": [
      "iCloud Plus",
      "iCloud",
      "苹果云盘",
      "苹果云存储",
      "蘋果雲"
    ],
    "logo": "assets/brands/icloud-plus.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/icloud"
    ]
  },
  {
    "id": "google-one",
    "name": "Google One",
    "category": "云存储",
    "aliases": [
      "谷歌One",
      "谷歌云存储",
      "GoogleOne"
    ],
    "logo": "assets/brands/google-one.svg",
    "legacyUrls": []
  },
  {
    "id": "dropbox",
    "name": "Dropbox",
    "category": "云存储",
    "aliases": [
      "多宝箱",
      "Dropbox Plus",
      "Dropbox Professional"
    ],
    "logo": "assets/brands/dropbox.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/dropbox"
    ]
  },
  {
    "id": "onedrive",
    "name": "OneDrive",
    "category": "云存储",
    "aliases": [
      "Microsoft OneDrive",
      "微软云盘",
      "微軟雲盤"
    ],
    "logo": "assets/brands/onedrive.svg",
    "legacyUrls": []
  },
  {
    "id": "baidu-netdisk",
    "name": "百度网盘",
    "category": "云存储",
    "aliases": [
      "Baidu Netdisk",
      "百度云盘",
      "百度云",
      "百度網盤"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "aliyun-drive",
    "name": "阿里云盘",
    "category": "云存储",
    "aliases": [
      "Aliyun Drive",
      "阿里云盘会员",
      "阿里雲盤"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "mega",
    "name": "MEGA",
    "category": "云存储",
    "aliases": [
      "Mega.nz",
      "MEGA Pro",
      "兆盘"
    ],
    "logo": "assets/brands/mega.svg",
    "legacyUrls": []
  },
  {
    "id": "proton-drive",
    "name": "Proton Drive",
    "category": "云存储",
    "aliases": [
      "ProtonDrive",
      "Proton 云盘"
    ],
    "logo": "assets/brands/proton-drive.svg",
    "legacyUrls": []
  },
  {
    "id": "wps",
    "name": "WPS",
    "category": "办公效率",
    "aliases": [
      "WPS Office",
      "金山办公",
      "金山WPS",
      "WPS会员"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "microsoft-365",
    "name": "Microsoft 365",
    "category": "办公效率",
    "aliases": [
      "Office 365",
      "Microsoft365",
      "微软365",
      "微軟365",
      "MS365"
    ],
    "logo": "assets/brands/microsoft-365.svg",
    "legacyUrls": []
  },
  {
    "id": "notion",
    "name": "Notion",
    "category": "办公效率",
    "aliases": [
      "Notion Plus",
      "Notion AI",
      "笔记Notion"
    ],
    "logo": "assets/brands/notion.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/notion"
    ]
  },
  {
    "id": "evernote",
    "name": "Evernote",
    "category": "办公效率",
    "aliases": [
      "Evernote Personal",
      "Evernote Professional"
    ],
    "logo": "assets/brands/evernote.svg",
    "legacyUrls": []
  },
  {
    "id": "todoist",
    "name": "Todoist",
    "category": "办公效率",
    "aliases": [
      "Todoist Pro",
      "待办Todoist"
    ],
    "logo": "assets/brands/todoist.svg",
    "legacyUrls": []
  },
  {
    "id": "ticktick",
    "name": "TickTick",
    "category": "办公效率",
    "aliases": [
      "滴答清单",
      "滴答清單",
      "Tick Tick"
    ],
    "logo": "assets/brands/ticktick.svg",
    "legacyUrls": []
  },
  {
    "id": "grammarly",
    "name": "Grammarly",
    "category": "办公效率",
    "aliases": [
      "Grammarly Pro",
      "Grammarly Premium",
      "语法助手"
    ],
    "logo": "assets/brands/grammarly.svg",
    "legacyUrls": []
  },
  {
    "id": "zoom",
    "name": "Zoom",
    "category": "办公效率",
    "aliases": [
      "Zoom Workplace",
      "Zoom Pro",
      "视频会议Zoom"
    ],
    "logo": "assets/brands/zoom.svg",
    "legacyUrls": []
  },
  {
    "id": "playstation-plus",
    "name": "PlayStation Plus",
    "category": "游戏",
    "aliases": [
      "PS Plus",
      "PSPlus",
      "PSN会员",
      "PlayStationPlus",
      "索尼会员"
    ],
    "logo": "assets/brands/playstation-plus.svg",
    "legacyUrls": []
  },
  {
    "id": "nintendo-switch-online",
    "name": "Nintendo Switch Online",
    "category": "游戏",
    "aliases": [
      "NSO",
      "任天堂会员",
      "任天堂联机",
      "Switch Online"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "xbox-game-pass",
    "name": "Xbox Game Pass",
    "category": "游戏",
    "aliases": [
      "XGP",
      "Game Pass",
      "PC Game Pass",
      "微软游戏通行证"
    ],
    "logo": "assets/brands/xbox-game-pass.svg",
    "legacyUrls": []
  },
  {
    "id": "ea-play",
    "name": "EA Play",
    "category": "游戏",
    "aliases": [
      "EAPlay",
      "EA会员",
      "EA Play Pro"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "ubisoft-plus",
    "name": "Ubisoft+",
    "category": "游戏",
    "aliases": [
      "Ubisoft Plus",
      "育碧",
      "育碧会员",
      "Uplay Plus"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "figma",
    "name": "Figma",
    "category": "设计",
    "aliases": [
      "Figma Professional",
      "Figma Pro",
      "协作设计"
    ],
    "logo": "assets/brands/figma.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/figma"
    ]
  },
  {
    "id": "adobe",
    "name": "Adobe",
    "category": "设计",
    "aliases": [
      "Adobe Creative Cloud",
      "Creative Cloud",
      "Adobe CC",
      "Adobe全家桶",
      "奥多比"
    ],
    "logo": "assets/brands/adobe.svg",
    "legacyUrls": []
  },
  {
    "id": "canva",
    "name": "Canva",
    "category": "设计",
    "aliases": [
      "Canva Pro",
      "可画",
      "可畫",
      "Canva可画"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "sketch",
    "name": "Sketch",
    "category": "设计",
    "aliases": [
      "Sketch Design",
      "Sketch设计"
    ],
    "logo": "assets/brands/sketch.svg",
    "legacyUrls": []
  },
  {
    "id": "framer",
    "name": "Framer",
    "category": "设计",
    "aliases": [
      "Framer Design",
      "Framer Pro"
    ],
    "logo": "assets/brands/framer.svg",
    "legacyUrls": []
  },
  {
    "id": "webflow",
    "name": "Webflow",
    "category": "设计",
    "aliases": [
      "Web Flow",
      "Webflow CMS"
    ],
    "logo": "assets/brands/webflow.svg",
    "legacyUrls": []
  },
  {
    "id": "duolingo",
    "name": "Duolingo",
    "category": "学习教育",
    "aliases": [
      "多邻国",
      "多鄰國",
      "Super Duolingo",
      "Duolingo Max"
    ],
    "logo": "assets/brands/duolingo.svg",
    "legacyUrls": []
  },
  {
    "id": "coursera",
    "name": "Coursera",
    "category": "学习教育",
    "aliases": [
      "Coursera Plus",
      "课程时代",
      "課程時代"
    ],
    "logo": "assets/brands/coursera.svg",
    "legacyUrls": []
  },
  {
    "id": "udemy",
    "name": "Udemy",
    "category": "学习教育",
    "aliases": [
      "Udemy Personal",
      "优达米",
      "線上課程Udemy"
    ],
    "logo": "assets/brands/udemy.svg",
    "legacyUrls": []
  },
  {
    "id": "skillshare",
    "name": "Skillshare",
    "category": "学习教育",
    "aliases": [
      "Skill Share",
      "技能分享"
    ],
    "logo": "assets/brands/skillshare.svg",
    "legacyUrls": []
  },
  {
    "id": "brilliant",
    "name": "Brilliant",
    "category": "学习教育",
    "aliases": [
      "Brilliant.org",
      "Brilliant Premium"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "dedao",
    "name": "得到",
    "category": "学习教育",
    "aliases": [
      "Dedao",
      "得到听书",
      "得到会员"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "zhihu-vip",
    "name": "知乎盐选会员",
    "category": "学习教育",
    "aliases": [
      "知乎",
      "知乎会员",
      "盐选会员",
      "盐选",
      "Zhihu",
      "Zhihu VIP"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "shanbay",
    "name": "扇贝",
    "category": "学习教育",
    "aliases": [
      "Shanbay",
      "扇贝单词",
      "扇贝阅读",
      "扇貝"
    ],
    "logo": null,
    "legacyUrls": []
  },
  {
    "id": "github",
    "name": "GitHub",
    "category": "开发工具",
    "aliases": [
      "Git Hub",
      "GitHub Pro",
      "GitHub Team",
      "代码托管GitHub"
    ],
    "logo": "assets/brands/github.svg",
    "legacyUrls": [
      "https://cdn.simpleicons.org/github"
    ]
  },
  {
    "id": "jetbrains",
    "name": "JetBrains",
    "category": "开发工具",
    "aliases": [
      "Jet Brains",
      "IntelliJ IDEA",
      "PyCharm",
      "WebStorm",
      "全家桶JetBrains"
    ],
    "logo": "assets/brands/jetbrains.svg",
    "legacyUrls": []
  },
  {
    "id": "gitlab",
    "name": "GitLab",
    "category": "开发工具",
    "aliases": [
      "Git Lab",
      "GitLab Premium",
      "GitLab Ultimate"
    ],
    "logo": "assets/brands/gitlab.svg",
    "legacyUrls": []
  },
  {
    "id": "replit",
    "name": "Replit",
    "category": "开发工具",
    "aliases": [
      "Repl.it",
      "Replit Core",
      "Repl It"
    ],
    "logo": "assets/brands/replit.svg",
    "legacyUrls": []
  },
  {
    "id": "vercel",
    "name": "Vercel",
    "category": "开发工具",
    "aliases": [
      "Vercel Pro",
      "Zeit",
      "前端部署"
    ],
    "logo": "assets/brands/vercel.svg",
    "legacyUrls": []
  },
  {
    "id": "sentry",
    "name": "Sentry",
    "category": "开发工具",
    "aliases": [
      "Sentry.io",
      "错误监控",
      "异常监控"
    ],
    "logo": "assets/brands/sentry.svg",
    "legacyUrls": []
  },
  {
    "id": "postman",
    "name": "Postman",
    "category": "开发工具",
    "aliases": [
      "Postman API",
      "API调试",
      "接口测试"
    ],
    "logo": "assets/brands/postman.svg",
    "legacyUrls": []
  },
  {
    "id": "docker",
    "name": "Docker",
    "category": "开发工具",
    "aliases": [
      "Docker Pro",
      "Docker Team",
      "Docker Desktop",
      "容器Docker"
    ],
    "logo": "assets/brands/docker.svg",
    "legacyUrls": []
  }
];
  const normalize = value => typeof value === 'string'
    ? value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu, '') : '';
  const all = Object.freeze(source.map(entry => Object.freeze({...entry,
    aliases:Object.freeze([...entry.aliases]), legacyUrls:Object.freeze([...entry.legacyUrls])})));
  const byId = new Map(all.map(entry => [entry.id,entry]));
  const indexed = all.map((entry,index) => ({entry,index,
    terms:[entry.name,entry.id,...entry.aliases].map(normalize), category:normalize(entry.category)}));
  const exact = new Map(), queries = new Map(), queryLimit = 64;
  for(const item of indexed)for(const term of item.terms)if(!exact.has(term))exact.set(term,item.entry);
  function get(id) { return typeof id === 'string' ? byId.get(id) || null : null; }
  function findExact(value) {
    const query=normalize(value);
    return query ? exact.get(query) || null : null;
  }
  function search(value, {limit=12} = {}) {
    const query=normalize(value), count=Number.isFinite(limit) ? Math.max(0,Math.min(all.length,Math.floor(limit))) : 12;
    if (!query) return all.slice(0,count);
    let matches=queries.get(query);
    if(matches)queries.delete(query);
    else {
      // Iteration keeps catalogue order inside each rank without temporary
      // entry objects or sorting on every keystroke.
      const ranks=[[],[],[],[]];
      for(const item of indexed) {
        const rank=item.terms.includes(query) ? 0 : item.terms.some(term => term.startsWith(query)) ? 1
          : item.terms.some(term => term.includes(query)) ? 2 : item.category.includes(query) ? 3 : 4;
        if(rank<4)ranks[rank].push(item.entry);
      }
      matches=Object.freeze(ranks.flat());
    }
    queries.set(query,matches);
    if(queries.size>queryLimit)queries.delete(queries.keys().next().value);
    return matches.slice(0,count);
  }
  return Object.freeze({all,get,findExact,search,normalize});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiCatalog;
