const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'motion.js'), 'utf8');

function boot({saved, reduced=false, blocked=false, legacy=false, noMedia=false, noViewport=false}={}) {
  const frames=[], mediaListeners=[], viewportListeners={}, documentListeners={};
  let writes=0, scrolled=0, nodes=new Map(), themeObserver=null;
  const root={dataset:{theme:'light'},clientHeight:844,style:{setProperty(key,value){this[key]=value;}}};
  const document={documentElement:root,activeElement:null,
    querySelector:selector=>nodes.get(selector),
    querySelectorAll:()=>[...nodes.values()],
    addEventListener:(name,listener)=>{documentListeners[name]=listener;}
  };
  const media={matches:reduced};
  if(legacy) media.addListener=listener=>mediaListeners.push(listener);
  else media.addEventListener=(name,listener)=>mediaListeners.push(listener);
  const viewport={height:844,offsetTop:0,scale:1,addEventListener:(name,listener)=>{viewportListeners[name]=listener;}};
  const context=vm.createContext({document,innerHeight:844,
    localStorage:{getItem(){if(blocked)throw Error('denied');return saved;},setItem(){writes++;}},
    requestAnimationFrame:listener=>frames.push(listener),
    matchMedia:noMedia?undefined:()=>media,visualViewport:noViewport?undefined:viewport,
    addEventListener(){},MutationObserver:class {constructor(callback){themeObserver=callback;}observe(){}}});
  vm.runInContext(source,context);
  function freshNodes(){
    nodes=new Map(['.main','.nav button.active','#modalOverlay','#drawerOverlay','#pickerOverlay','#paymentOverlay'].map(selector=>{
      const classes=new Set();return [selector,{classes,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}];
    }));
  }
  freshNodes();
  return {motion:context.SumiMotion,root,viewport,document,nodes:()=>nodes,writes:()=>writes,
    freshNodes,theme(value){root.dataset.theme=value;themeObserver?.();},media(value){media.matches=value;mediaListeners.forEach(listener=>listener());},
    input(inDialog=true){document.activeElement={tagName:'INPUT',closest:()=>inDialog,scrollIntoView(){scrolled++;}};},
    resize(){viewportListeners.resize?.();},scroll(){viewportListeners.scroll?.();},
    frames:()=>frames.length,flush(){while(frames.length)frames.shift()();},scrolled:()=>scrolled,
    focus(){documentListeners.focusin?.();}
  };
}

test('saved reduction applies before rendering without writing any stored data',()=>{
  const app=boot({saved:JSON.stringify({motion:'reduce',theme:'dark'})});
  assert.equal(app.motion.getMode(),'reduce');
  assert.equal(app.motion.isReduced(),true);
  assert.equal(app.root.dataset.motion,'reduce');
  assert.equal(app.root.dataset.motionPreference,'reduce');
  assert.equal(app.writes(),0);
});

test('system reduce always wins and both modern and older Safari events update immediately',()=>{
  for(const legacy of [false,true]){
    const app=boot({legacy,reduced:true});
    assert.equal(app.motion.getMode(),'system');
    assert.equal(app.motion.isReduced(),true);
    app.media(false);assert.equal(app.root.dataset.motion,'full');
    app.motion.apply('reduce');app.media(true);app.media(false);
    assert.equal(app.root.dataset.motion,'reduce');
    app.motion.apply('system');assert.equal(app.root.dataset.motion,'full');
    app.media(true);assert.equal(app.root.dataset.motion,'reduce');
    assert.equal(app.writes(),0);
  }
});

test('missing APIs and corrupt or invalid preferences leave safe manual motion controls',()=>{
  for(const options of [{blocked:true},{saved:'{broken'},{saved:'[]'},{saved:'null'},{saved:'{"motion":"bounce"}'}]){
    const app=boot({...options,noMedia:true,noViewport:true});
    assert.equal(app.motion.getMode(),'system');
    app.motion.apply('reduce');assert.equal(app.motion.isReduced(),true);
    app.motion.apply('invalid');assert.equal(app.motion.getMode(),'system');
    assert.equal(app.root.style['--viewport-height'],'844px');
    assert.equal(app.writes(),0);
  }
});

test('first paint and data rerenders do not replay page entry; real navigation does',()=>{
  const app=boot();
  app.motion.afterRender({view:'home'});
  assert.equal(app.nodes().get('.main').classes.size,0);
  app.freshNodes();app.motion.afterRender({view:'home'});
  assert.equal(app.nodes().get('.main').classes.size,0);
  app.freshNodes();app.motion.afterRender({view:'list'});
  assert.equal(app.nodes().get('.main').classes.has('sumi-enter-view'),true);
  assert.equal(app.nodes().get('.nav button.active').classes.has('sumi-enter-nav'),true);
  app.freshNodes();app.motion.afterRender({view:'list'});
  assert.equal(app.nodes().get('.main').classes.size,0);
});

test('modals, drawers, nested logo picker and payment edit animate only when opened or changed',()=>{
  const app=boot();app.motion.afterRender({view:'home'});
  const state={view:'home',modal:'new',detailId:'subscription',picker:true,paymentModal:'new'};
  app.motion.afterRender(state);
  for(const selector of ['#modalOverlay','#drawerOverlay','#pickerOverlay','#paymentOverlay']){
    assert.equal(app.nodes().get(selector).classes.has('sumi-enter-overlay'),true,selector);
  }
  app.freshNodes();app.motion.afterRender(state);
  for(const node of app.nodes().values())assert.equal(node.classes.size,0);
  app.motion.afterRender({...state,paymentModal:'other-payment'});
  assert.equal(app.nodes().get('#paymentOverlay').classes.has('sumi-enter-overlay'),true);
  assert.equal(app.nodes().get('#modalOverlay').classes.size,0);
});

test('reduced motion suppresses all entries but still tracks navigation state',()=>{
  const app=boot({reduced:true});app.motion.afterRender({view:'home'});
  app.motion.afterRender({view:'settings',modal:'new',picker:true,detailId:'s',paymentModal:'new'});
  for(const node of app.nodes().values())assert.equal(node.classes.size,0);
  app.media(false);app.motion.afterRender({view:'settings',modal:'new',picker:true,detailId:'s',paymentModal:'new'});
  for(const node of app.nodes().values())assert.equal(node.classes.size,0);
});

test('theme changes receive a subtle crossfade without replaying the page entry',()=>{
  const app=boot();app.motion.afterRender({view:'settings'});
  app.root.dataset.theme='dark';app.motion.afterRender({view:'settings'});
  assert.equal(app.nodes().get('.main').classes.has('sumi-theme-change'),true);
  assert.equal(app.nodes().get('.main').classes.has('sumi-enter-view'),false);
  assert.equal(app.root.dataset.themeChanging,'true');
  app.flush();assert.equal(app.root.dataset.themeChanging,undefined);
});

test('visual viewport resize and scroll coalesce and reveal a focused dialog field',()=>{
  const app=boot();app.input();app.viewport.height=390;app.viewport.offsetTop=24;
  app.resize();app.scroll();app.focus();
  assert.equal(app.frames(),1);app.flush();
  assert.equal(app.root.style['--viewport-height'],'390px');
  assert.equal(app.root.style['--viewport-offset'],'24px');
  assert.equal(app.root.dataset.keyboard,'open');
  assert.equal(app.scrolled(),1);
  app.viewport.height=844;app.viewport.offsetTop=0;app.resize();app.flush();
  assert.equal(app.root.dataset.keyboard,'closed');
  assert.equal(app.scrolled(),1);
});

test('pinch zoom and unfocused resize do not masquerade as keyboard opening',()=>{
  const app=boot();app.viewport.height=390;app.viewport.offsetTop=80;
  app.resize();app.flush();assert.equal(app.root.dataset.keyboard,'closed');
  app.input();app.viewport.scale=2;app.resize();app.flush();
  assert.equal(app.root.style['--viewport-height'],'844px');
  assert.equal(app.root.style['--viewport-offset'],'0px');
  assert.equal(app.root.dataset.keyboard,'closed');assert.equal(app.scrolled(),0);
});

test('close waits for the existing overlay exit, guards repeat requests and calls back once',async()=>{
  const app=boot();let complete, cancelled=0, closed=0;
  const node=app.nodes().get('#modalOverlay');
  node.animate=()=>({finished:new Promise(resolve=>{complete=resolve;}),cancel(){cancelled++;}});
  const pending=app.motion.close('#modalOverlay',()=>closed++);
  assert.equal(closed,0);
  assert.equal(app.motion.close('#modalOverlay',()=>closed+=10),pending);
  complete();await pending;
  assert.equal(closed,1);assert.equal(cancelled,1);
});

test('cancelled or unsupported animations cannot block closing',async()=>{
  const app=boot();let closed=0;
  app.nodes().get('#modalOverlay').animate=()=>({finished:Promise.reject(Error('cancelled')),cancel(){}});
  await app.motion.close('#modalOverlay',()=>closed++);
  await app.motion.close('#pickerOverlay',()=>closed++);
  await app.motion.close('#missing',()=>closed++);
  app.nodes().get('#modalOverlay').animate=()=>{throw Error('unavailable');};
  await app.motion.close('#modalOverlay',()=>closed++);
  assert.equal(closed,4);
});

test('reduced motion closes immediately and also finishes an in-flight exit',async()=>{
  const app=boot();let closed=0;
  app.nodes().get('#modalOverlay').animate=()=>({finished:new Promise(()=>{}),cancel(){}});
  const pending=app.motion.close('#modalOverlay',()=>closed++);
  app.media(true);
  assert.equal(closed,1);await pending;
  const immediate=app.motion.close('#modalOverlay',()=>closed++);
  assert.equal(closed,2);await immediate;
});

test('entry scopes are removed after the page animation so later list updates stay still',()=>{
  const app=boot();app.motion.afterRender({view:'home'});
  const node=app.nodes().get('.main'),listeners={};
  node.addEventListener=(name,callback)=>{listeners[name]=callback;};
  node.removeEventListener=(name)=>{delete listeners[name];};
  app.motion.afterRender({view:'list'});
  listeners.animationend({target:{}});
  assert.equal(node.classes.has('sumi-enter-view'),true);
  listeners.animationend({target:node});
  assert.equal(node.classes.has('sumi-enter-view'),false);
  assert.equal(Object.keys(listeners).length,0);
});


test('system theme mutations suppress color interpolation without rerendering the open form',()=>{
  const app=boot();app.motion.afterRender({view:'home',modal:'new'});
  const form=app.nodes().get('#modalOverlay');
  app.theme('dark');
  assert.equal(app.root.dataset.themeChanging,'true');
  assert.equal(form.classes.has('sumi-theme-change'),true);
  assert.equal(app.nodes().get('#modalOverlay'),form);
  app.theme('light');app.flush();
  assert.equal(app.root.dataset.themeChanging,undefined);
  assert.equal(app.writes(),0);
});
