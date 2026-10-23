const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../service-catalog.js');
const root = path.resolve(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'assets/brands/manifest.json'),'utf8'));

test('catalog contains 72 unique services across all nine subscription categories without prices', () => {
  assert.equal(catalog.all.length,72);
  assert.equal(new Set(catalog.all.map(item=>item.id)).size,72);
  assert.equal(new Set(catalog.all.map(item=>item.name)).size,72);
  assert.deepEqual([...new Set(catalog.all.map(item=>item.category))].sort(),
    ['影音娱乐','音乐音频','AI 工具','云存储','办公效率','游戏','设计','学习教育','开发工具'].sort());
  for(const item of catalog.all){
    assert.match(item.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(item.name.trim()&&item.category.trim());
    assert.ok(item.aliases.length>0&&item.aliases.every(alias=>typeof alias==='string'&&alias.trim()));
    assert.deepEqual(Object.keys(item).sort(),['id','name','category','aliases','logo','legacyUrls'].sort());
  }
});

test('required Chinese and international services are available by their accurate names or common aliases', () => {
  for(const name of ['Netflix','YouTube Premium','Spotify','Apple Music','iCloud+','ChatGPT','Claude',
    'Gemini','Disney+','Bilibili','腾讯视频','爱奇艺','QQ 音乐','网易云音乐','WPS','Microsoft 365',
    'Google One','GitHub','Notion','Figma','Adobe','PlayStation Plus','Nintendo Switch Online']){
    assert.ok(catalog.findExact(name),name);
  }
});

test('search matches Chinese, English and common aliases without requiring generated names', () => {
  for(const [query,id] of [['奈飞','netflix'],['网飞','netflix'],['B站','bilibili'],['QQ音乐','qq-music'],
    ['绿钻','qq-music'],['Office 365','microsoft-365'],['苹果云盘','icloud-plus'],['PS Plus','playstation-plus'],
    ['NSO','nintendo-switch-online'],['NetEase Cloud Music','netease-cloud-music']]){
    assert.equal(catalog.search(query)[0]?.id,id,query);
  }
});

test('normalization handles case, fullwidth input, punctuation and spacing', () => {
  for(const query of ['ｇｉｔｈｕｂ',' GIT HUB ','Git-Hub','github']) assert.equal(catalog.search(query)[0]?.id,'github');
  assert.equal(catalog.findExact('ＱＱ　音樂')?.id,'qq-music');
  assert.equal(catalog.findExact('  Apple-Music  ')?.id,'apple-music');
  assert.equal(catalog.findExact('iCloud +')?.id,'icloud-plus');
});

test('exact matches outrank prefixes and substring matches and results are deterministic', () => {
  const ids = catalog.search('GitHub').map(item=>item.id);
  assert.equal(ids[0],'github');
  assert.ok(ids.indexOf('github-copilot')>0);
  assert.equal(catalog.search('Music')[0].id,'apple-music');
  assert.deepEqual(catalog.search('Google').map(item=>item.id),catalog.search('Google').map(item=>item.id));
  assert.equal(catalog.search('视频')[0].id,'zoom'); // prefix alias precedes a contained word
  assert.ok(catalog.search('视频').findIndex(item=>item.id==='tencent-video')>0);
});

test('search limits, category lookup and no matches preserve custom-name freedom', () => {
  assert.equal(catalog.search('',{limit:80}).length,72);
  assert.equal(catalog.search('').length,12);
  assert.equal(catalog.search('音乐',{limit:2}).length,2);
  assert.equal(catalog.search('',{limit:0}).length,0);
  assert.equal(catalog.search('',{limit:-5}).length,0);
  assert.equal(catalog.search('',{limit:500}).length,72);
  assert.ok(catalog.search('学习教育',{limit:80}).every(item=>item.category==='学习教育'));
  assert.deepEqual(catalog.search('我自己的家庭服务 998877'),[]);
  assert.equal(catalog.findExact('我自己的家庭服务 998877'),null);
});

test('catalog entries and arrays cannot be changed by selection or callers', () => {
  const selected=catalog.get('netflix');
  assert.equal(selected,catalog.findExact('奈飞'));
  assert.ok(Object.isFrozen(catalog)&&Object.isFrozen(catalog.all)&&Object.isFrozen(selected));
  assert.ok(Object.isFrozen(selected.aliases)&&Object.isFrozen(selected.legacyUrls));
  assert.throws(()=>selected.aliases.push('changed'),TypeError);
  const results=catalog.search('Netflix');results.pop();
  assert.equal(catalog.search('Netflix')[0],selected);
  assert.equal(catalog.get('__proto__'),null);
  assert.equal(catalog.get('constructor'),null);
  assert.equal(catalog.get(null),null);
});

test('every actual logo has a pinned source, exact local bytes and its license metadata', () => {
  const withLogo=catalog.all.filter(item=>item.logo);
  assert.equal(withLogo.length,55);
  assert.equal(manifest.assets.length,55);
  assert.equal(new Set(manifest.assets.map(item=>item.id)).size,55);
  for(const entry of withLogo){
    assert.equal(entry.logo,`assets/brands/${entry.id}.svg`);
    const asset=manifest.assets.find(item=>item.id===entry.id);
    assert.equal(asset.path,entry.logo);
    const bytes=fs.readFileSync(path.join(root,entry.logo));
    assert.equal(asset.bytes,bytes.length,entry.id);
    assert.equal(asset.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),entry.id);
    assert.match(asset.revision,/^[0-9a-f]{40}$/);
    assert.match(asset.downloadUrl,/^https:\/\/(raw\.githubusercontent\.com|registry\.npmjs\.org)\//);
    assert.ok(['CC0-1.0','MIT','Apache-2.0'].includes(asset.collection));
    assert.match(asset.licenseUrl,/^https:\/\/github\.com\//);
    if(asset.provider==='lobe-icons')assert.ok(asset.downloadUrl.includes(asset.version));
    else assert.ok(asset.downloadUrl.includes(asset.revision));
  }
});

test('unavailable brand marks are explicit nulls and never guessed or replaced by a parent brand', () => {
  const missing=catalog.all.filter(item=>item.logo===null);
  assert.equal(missing.length,17);
  assert.equal(manifest.unavailable.length,17);
  for(const entry of missing){
    assert.ok(manifest.unavailable.find(item=>item.id===entry.id)?.reason);
    assert.deepEqual(entry.legacyUrls,[]);
  }
  for(const id of ['qq-music','tencent-video','baidu-netdisk','nintendo-switch-online']){
    assert.equal(catalog.get(id).logo,null);
  }
});

test('bundled SVGs are static self-contained geometry without executable or network content', () => {
  const allowed=new Set(['svg','path','g','defs','title','desc','rect','circle','ellipse','polygon','polyline',
    'linearGradient','radialGradient','stop','clipPath','mask','style']);
  for(const asset of manifest.assets){
    const svg=fs.readFileSync(path.join(root,asset.path),'utf8');
    assert.match(svg,/<svg\b[^>]*\bviewBox="[^"]+"/);
    assert.doesNotMatch(svg,/<!DOCTYPE|<!ENTITY|javascript:|@import|@font-face|\bon[a-z]+\s*=/i,asset.id);
    for(const tag of svg.matchAll(/<\/?([A-Za-z][\w:-]*)\b/g))assert.ok(allowed.has(tag[1]),asset.id+': '+tag[1]);
    for(const href of svg.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/g))assert.match(href[2],/^#[A-Za-z_][\w:.-]*$/);
    for(const url of svg.matchAll(/url\((.*?)\)/gi))assert.match(url[1],/^#[A-Za-z_][\w:.-]*$/);
  }
  const files=fs.readdirSync(path.join(root,'assets/brands')).filter(name=>name.endsWith('.svg'));
  assert.equal(files.length,manifest.assets.length);
});

test('license notices, original hashes and monochrome derivations remain documented', () => {
  for(const file of ['LICENSE-simple-icons.txt','DISCLAIMER-simple-icons.md','LICENSE-lobe-icons.txt',
    'LICENSE-dashboard-icons.txt','LICENSE-primer-octicons.txt']){
    assert.ok(fs.readFileSync(path.join(root,'assets/brands',file),'utf8').length>500,file);
  }
  const modifications=manifest.assets.filter(asset=>asset.modifications.length);
  assert.deepEqual(modifications.map(asset=>asset.id).sort(),
    ['adobe','disney-plus','google-one','microsoft-365','onedrive','playstation-plus','prime-video','xbox-game-pass']);
  for(const asset of modifications){
    assert.match(asset.originalSha256,/^[a-f0-9]{64}$/);
    assert.notEqual(asset.sha256,asset.originalSha256);
    assert.ok(asset.modifications.some(note=>note.includes('单色适配')),asset.id);
  }
  assert.match(modifications.find(asset=>asset.id==='google-one').modifications[0],/viewBox/);
  const copilot=manifest.assets.find(asset=>asset.id==='github-copilot');
  assert.equal(copilot.brandLicense.type,'MIT');
  assert.ok(fs.existsSync(path.join(root,copilot.brandLicense.noticeFile)));
});

test('built-in SVG marks contain no gradients, colored fills or shadow effects', () => {
  for(const asset of manifest.assets){
    const svg=fs.readFileSync(path.join(root,asset.path),'utf8');
    assert.doesNotMatch(svg,/<(?:linearGradient|radialGradient|filter)\b|\bfilter\s*=|box-shadow|drop-shadow/i,asset.id);
    for(const fill of svg.matchAll(/\bfill\s*=\s*["']([^"']+)["']/g)){
      assert.ok(['#000','currentColor','none'].includes(fill[1]),asset.id+': '+fill[1]);
    }
    assert.doesNotMatch(svg,/(?:fill|stroke)\s*:\s*(?:#|rgb|hsl)/i,asset.id);
  }
});

test('legacy URL mappings are exact same-brand URLs and do not invent parent-brand associations', () => {
  const urls=catalog.all.flatMap(entry=>entry.legacyUrls);
  assert.equal(new Set(urls).size,urls.length);
  assert.ok(urls.every(url=>/^https:\/\/cdn\.simpleicons\.org\/[a-z0-9]+$/.test(url)));
  assert.ok(catalog.get('github').legacyUrls.includes('https://cdn.simpleicons.org/github'));
  assert.ok(!urls.includes('https://cdn.simpleicons.org/google'));
  assert.ok(!urls.includes('https://cdn.simpleicons.org/microsoft'));
  assert.ok(!urls.includes('https://cdn.simpleicons.org/anthropic'));
});
