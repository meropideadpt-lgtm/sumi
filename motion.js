/* Restrained UI motion and visible-viewport bounds. No business data is written. */
const SumiMotion = (() => {
  const document = globalThis.document;
  const root = document?.documentElement;
  const viewport = globalThis.visualViewport;
  let mode = 'system', media = null, previous = null, scheduled = false;
  const closing = new Map();
  let observedTheme = root?.dataset.theme, themeFrame = 0;
  const frame = globalThis.requestAnimationFrame?.bind(globalThis) || (callback => globalThis.setTimeout?.(callback, 0));
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem('sumi-prefs-v1') || 'null');
    if (saved?.motion === 'reduce') mode = 'reduce';
  } catch { /* Storage recovery belongs to the data store; motion stays usable. */ }
  try { media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null; }
  catch { /* Browsers without the media query retain the manual option. */ }
  const isReduced = () => mode === 'reduce' || Boolean(media?.matches);
  function update() {
    if (root) {
      root.dataset.motion = isReduced() ? 'reduce' : 'full';
      root.dataset.motionPreference = mode;
    }
    if (isReduced()) for (const item of closing.values()) item.cancel();
    return isReduced();
  }
  function apply(value) {
    mode = value === 'reduce' ? 'reduce' : 'system';
    return update();
  }
  function markNode(node, name) {
    if (!node) return;
    node.classList.add(name);
    let timer = null;
    const cleanup = event => {
      if (event && event.target !== node) return;
      node.classList.remove(name);
      node.removeEventListener?.('animationend', cleanup);
      node.removeEventListener?.('animationcancel', cleanup);
      if (timer !== null) globalThis.clearTimeout?.(timer);
    };
    node.addEventListener?.('animationend', cleanup);
    node.addEventListener?.('animationcancel', cleanup);
    // Remove the entry scope before later in-place search/list updates.
    timer = globalThis.setTimeout?.(cleanup, 350) ?? null;
  }
  function mark(selector, name) { markNode(document?.querySelector(selector), name); }
  function themeChanged() {
    if (!root || root.dataset.theme === observedTheme) return;
    observedTheme = root.dataset.theme;
    const token = ++themeFrame;
    // Foreground/background interpolation can pass through an unreadable midpoint.
    // Switch the paired colors together, then use a subtle whole-surface crossfade.
    root.dataset.themeChanging = 'true';
    if (!isReduced()) document?.querySelectorAll('.shell,.overlay,.drawer-overlay').forEach(node => markNode(node, 'sumi-theme-change'));
    frame(() => frame(() => { if (token === themeFrame) delete root.dataset.themeChanging; }));
  }
  function afterRender(state = {}) {
    const current = {
      view:state.view || '', modal:state.modal || '', detailId:state.detailId || '',
      picker:Boolean(state.picker), paymentModal:state.paymentModal || '', theme:root?.dataset.theme
    };
    if (!isReduced()) {
      // A data refresh or search rerender must not animate the whole page again.
      if (previous && previous.view !== current.view) {
        mark('.main', 'sumi-enter-view');
        mark('.nav button.active', 'sumi-enter-nav');
      }
      if (current.modal && current.modal !== previous?.modal) mark('#modalOverlay', 'sumi-enter-overlay');
      if (current.detailId && current.detailId !== previous?.detailId) mark('#drawerOverlay', 'sumi-enter-overlay');
      if (current.picker && !previous?.picker) mark('#pickerOverlay', 'sumi-enter-overlay');
      if (current.paymentModal && current.paymentModal !== previous?.paymentModal) mark('#paymentOverlay', 'sumi-enter-overlay');

    }
    if (previous && current.theme !== previous.theme) themeChanged();
    previous = current;
  }
  function close(selector, callback) {
    const node = document?.querySelector(selector);
    if (!node || isReduced() || typeof node.animate !== 'function') {
      callback();
      return Promise.resolve();
    }
    if (closing.has(node)) return closing.get(node).promise;
    let resolve, finished = false, timer = null;
    const animations = [];
    const promise = new Promise(done => { resolve = done; });
    const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const finish = () => {
      if (finished) return;
      finished = true;
      closing.delete(node);
      if (timer !== null) globalThis.clearTimeout?.(timer);
      node.removeEventListener?.('click', block, true);
      node.removeEventListener?.('keydown', block, true);
      for (const animation of animations) animation.cancel();
      try { callback(); } finally { resolve(); }
    };
    closing.set(node, {promise, cancel:finish});
    // Keep the overlay in place to intercept a second click while its contents fade.
    // No cloned forms or duplicate IDs are created, and no business state is delayed.
    node.addEventListener?.('click', block, true);
    node.addEventListener?.('keydown', block, true);
    try {
      const options = {duration:140, easing:'cubic-bezier(.2,.7,.2,1)', fill:'forwards'};
      animations.push(node.animate([{opacity:1},{opacity:0}], options));
      const surface = node.querySelector?.('.drawer,.modal');
      if (surface?.animate) {
        const drawer = surface.classList.contains('drawer');
        animations.push(surface.animate([{transform:'none'}, {transform:drawer?'translateX(10px)':'translateY(4px)'}], options));
      }
      Promise.all(animations.map(animation => animation.finished)).then(finish, finish);
      // A detached tab or browser animation cancellation must never leave close stuck.
      timer = globalThis.setTimeout?.(finish, 250) ?? null;
    } catch { finish(); }
    return promise;
  }
  function editable(node) {
    return Boolean(node && (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable));
  }
  function updateViewport() {
    scheduled = false;
    if (!root) return;
    const layoutHeight = Math.max(Number(globalThis.innerHeight) || 0, Number(root.clientHeight) || 0);
    const unzoomed = !viewport || !Number.isFinite(viewport.scale) || viewport.scale <= 1.05;
    const visibleHeight = unzoomed && viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : layoutHeight;
    const offset = unzoomed && viewport && Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
    if (visibleHeight > 0) root.style.setProperty('--viewport-height', `${Math.round(visibleHeight)}px`);
    root.style.setProperty('--viewport-offset', `${Math.round(offset)}px`);
    const keyboard = unzoomed && editable(document.activeElement) && layoutHeight - visibleHeight > 120;
    root.dataset.keyboard = keyboard ? 'open' : 'closed';
    // The dialog itself scrolls, so the focused control remains reachable above a keyboard.
    // Avoid moving the document on ordinary focus, desktop resize or pinch zoom.
    if (keyboard && document.activeElement?.closest?.('.modal,.drawer')) {
      document.activeElement.scrollIntoView?.({block:'nearest', inline:'nearest', behavior:'auto'});
    }
  }
  function scheduleViewport() {
    if (scheduled) return;
    scheduled = true;
    frame(updateViewport);
  }
  if (typeof media?.addEventListener === 'function') media.addEventListener('change', update);
  else if (typeof media?.addListener === 'function') media.addListener(update);
  viewport?.addEventListener?.('resize', scheduleViewport, {passive:true});
  viewport?.addEventListener?.('scroll', scheduleViewport, {passive:true});
  globalThis.addEventListener?.('resize', scheduleViewport, {passive:true});
  document?.addEventListener?.('focusin', scheduleViewport);
  document?.addEventListener?.('focusout', scheduleViewport);
  if (root && typeof globalThis.MutationObserver === 'function') {
    new globalThis.MutationObserver(themeChanged).observe(root, {attributes:true, attributeFilter:['data-theme']});
  }
  update();
  updateViewport();
  return Object.freeze({apply, getMode:() => mode, isReduced, afterRender, close});
})();
if (typeof globalThis !== 'undefined') globalThis.SumiMotion = SumiMotion;
if (typeof module !== 'undefined' && module.exports) module.exports = SumiMotion;
