/* Small local SVG set: consistent strokes, no external icon/font dependency. */
function sumiIcon(name) {
  const paths = {
    home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-6h4v6h5V9"/>',
    list:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    stats:'<path d="M4 20h17M7 16v-5M12 16V5M17 16V8"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 18h2"/>',
    settings:'<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="3"/><circle cx="9" cy="17" r="3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    'chevron-left':'<path d="m15 5-7 7 7 7"/>',
    'chevron-right':'<path d="m9 5 7 7-7 7"/>',
    bell:'<path d="M5 9a7 7 0 0 1 14 0v5l2 3H3l2-3Z"/><path d="M9 21h6"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    service:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    edit:'<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>',
    warning:'<path d="M12 3 2 21h20Z"/><path d="M12 9v5M12 18h.01"/>'
  };
  const path = Object.hasOwn(paths,name) ? paths[name] : paths.list;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}
