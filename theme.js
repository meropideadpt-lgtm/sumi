/* Apply the saved appearance before rendering. This module never writes user data. */
const SumiTheme = (() => {
  const modes = ['light', 'dark', 'system'];
  const document = globalThis.document;
  let mode = 'light';
  let media = null;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(globalThis.SumiWorkspace?.preferenceKey() || 'sumi-prefs-v1') || 'null');
    if (saved && typeof saved === 'object' && modes.includes(saved.theme)) mode = saved.theme;
  } catch { /* An unreadable preference cannot block the light default or app recovery. */ }
  try {
    media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') || null;
  } catch { /* System appearance is optional; light remains a usable fallback. */ }

  const resolved = () => mode === 'system' ? media?.matches ? 'dark' : 'light' : mode;
  function update() {
    const theme = resolved();
    if (!document?.documentElement) return theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = mode;
    document.documentElement.style.colorScheme = theme;
    // Also cover the interval before the stylesheet loads on a cold page visit.
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#141a23' : '#f9fbff';
    document.body?.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141a23' : '#ffffff');
    return theme;
  }
  function apply(value) {
    mode = modes.includes(value) ? value : 'light';
    return update();
  }
  function systemChanged() {
    if (mode === 'system') update();
  }
  if (typeof media?.addEventListener === 'function') media.addEventListener('change', systemChanged);
  else if (typeof media?.addListener === 'function') media.addListener(systemChanged);
  if (document?.readyState === 'loading') document.addEventListener('DOMContentLoaded', update, {once:true});
  update();
  return Object.freeze({apply, getMode: () => mode, resolved});
})();
if (typeof globalThis !== 'undefined') globalThis.SumiTheme = SumiTheme;
if (typeof module !== 'undefined' && module.exports) module.exports = SumiTheme;
