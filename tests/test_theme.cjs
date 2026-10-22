const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'theme.js'), 'utf8');

function boot({theme, saved, dark = false, blocked = false, legacy = false, early = false, noMedia = false} = {}) {
  let writes = 0;
  const mediaListeners = [];
  const readyListeners = [];
  const classes = new Set();
  const meta = {content: '#ffffff', setAttribute(name,value) { this[name] = value; }};
  const body = {classList:{toggle(name,enabled) { if(enabled) classes.add(name); else classes.delete(name); }}};
  const document = {
    documentElement:{dataset:{},style:{}},
    readyState: early ? 'loading' : 'complete',
    body: early ? null : body,
    querySelector: () => meta,
    addEventListener(name,listener) { if(name === 'DOMContentLoaded') readyListeners.push(listener); }
  };
  const media = {matches:dark};
  if(legacy) media.addListener = listener => mediaListeners.push(listener);
  else media.addEventListener = (name,listener) => { if(name === 'change') mediaListeners.push(listener); };
  const storage = {
    getItem(key) {
      assert.equal(key, 'sumi-prefs-v1');
      if(blocked) throw new Error('Storage denied');
      return saved ?? (theme === undefined ? null : JSON.stringify({theme}));
    },
    setItem() { writes++; },
    removeItem() { writes++; }
  };
  const context = vm.createContext({document,localStorage:storage,matchMedia:noMedia ? undefined : () => media});
  vm.runInContext(source, context);
  return {
    theme: context.SumiTheme, document, classes, meta,
    writes: () => writes,
    change(value) { media.matches = value; for(const listener of mediaListeners) listener({matches:value}); },
    ready() { document.body = body; document.readyState = 'complete'; for(const listener of readyListeners) listener(); }
  };
}

test('a fresh visit stays light even when the system is dark and writes nothing', () => {
  const app=boot({dark:true});
  assert.equal(app.theme.getMode(),'light');
  assert.equal(app.theme.resolved(),'light');
  assert.equal(app.document.documentElement.dataset.theme,'light');
  assert.equal(app.document.documentElement.style.colorScheme,'light');
  assert.equal(app.classes.has('dark'),false);
  assert.equal(app.writes(),0);
});

test('legacy dark preference applies before body and stylesheet are available', () => {
  const app=boot({theme:'dark',early:true});
  assert.equal(app.document.body,null);
  assert.equal(app.document.documentElement.dataset.theme,'dark');
  assert.equal(app.document.documentElement.style.backgroundColor,'#141a23');
  assert.equal(app.document.documentElement.style.colorScheme,'dark');
  assert.equal(app.meta.content,'#141a23');
  app.ready();
  assert.equal(app.classes.has('dark'),true);
  assert.equal(app.writes(),0);
});

test('system appearance tracks both transitions without rewriting preferences', () => {
  const app=boot({theme:'system',dark:true});
  assert.equal(app.theme.getMode(),'system');
  assert.equal(app.theme.resolved(),'dark');
  app.change(false);
  assert.equal(app.theme.resolved(),'light');
  assert.equal(app.classes.has('dark'),false);
  assert.equal(app.meta.content,'#ffffff');
  assert.equal(app.document.documentElement.dataset.themePreference,'system');
  app.change(true);
  assert.equal(app.theme.resolved(),'dark');
  assert.equal(app.classes.has('dark'),true);
  assert.equal(app.writes(),0);
});

test('manual selections override subsequent system events until system is selected again', () => {
  const app=boot({theme:'system',dark:false});
  app.theme.apply('dark');
  app.change(true);app.change(false);
  assert.equal(app.theme.getMode(),'dark');
  assert.equal(app.theme.resolved(),'dark');
  assert.equal(app.classes.has('dark'),true);
  app.theme.apply('light');app.change(true);
  assert.equal(app.theme.resolved(),'light');
  assert.equal(app.classes.has('dark'),false);
  app.theme.apply('system');
  assert.equal(app.theme.resolved(),'dark');
  assert.equal(app.writes(),0);
});

test('older Safari media listeners receive system appearance changes', () => {
  const app=boot({theme:'system',legacy:true});
  app.change(true);
  assert.equal(app.document.documentElement.dataset.theme,'dark');
  app.change(false);
  assert.equal(app.document.documentElement.dataset.theme,'light');
});

test('unreadable or invalid stored preferences safely retain the light default', () => {
  for(const options of [{blocked:true},{saved:'{broken'},{saved:'[]'},{saved:'null'},{theme:'neon'}]) {
    const app=boot({...options,dark:true});
    assert.equal(app.theme.getMode(),'light');
    assert.equal(app.theme.resolved(),'light');
    assert.equal(app.writes(),0);
  }
});

test('missing system appearance support and invalid explicit mode remain usable', () => {
  const app=boot({theme:'system',noMedia:true});
  assert.equal(app.theme.getMode(),'system');
  assert.equal(app.theme.resolved(),'light');
  app.theme.apply('dark');
  assert.equal(app.theme.resolved(),'dark');
  app.theme.apply('unsupported');
  assert.equal(app.theme.getMode(),'light');
  assert.equal(app.theme.resolved(),'light');
});
