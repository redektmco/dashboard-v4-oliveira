/* @ds-bundle: {"format":4,"namespace":"V4OliveiraCoDesignSystem_e5d2e0","components":[{"name":"ClientDetail","sourcePath":"ui_kits/bi-desktop/ClientDetail.jsx"},{"name":"ClientDossie","sourcePath":"ui_kits/bi-desktop/ClientDossie.jsx"},{"name":"ClientMeetings","sourcePath":"ui_kits/bi-desktop/ClientMeetings.jsx"},{"name":"ClientTable","sourcePath":"ui_kits/bi-desktop/ClientTable.jsx"},{"name":"Identity","sourcePath":"ui_kits/bi-desktop/Identity.jsx"},{"name":"Overview","sourcePath":"ui_kits/bi-desktop/Overview.jsx"},{"name":"Sidebar","sourcePath":"ui_kits/bi-desktop/Sidebar.jsx"},{"name":"SquadPerformance","sourcePath":"ui_kits/bi-desktop/SquadPerformance.jsx"},{"name":"Topbar","sourcePath":"ui_kits/bi-desktop/Topbar.jsx"},{"name":"App","sourcePath":"ui_kits/bi-mobile/App.jsx"}],"sourceHashes":{"slides/deck-stage.js":"0c125b8b1e23","ui_kits/bi-desktop/ClientDetail.jsx":"6c5f85ccaf4a","ui_kits/bi-desktop/ClientDossie.jsx":"d82747befbe9","ui_kits/bi-desktop/ClientMeetings.jsx":"d3a16a094ce2","ui_kits/bi-desktop/ClientTable.jsx":"36c394be1381","ui_kits/bi-desktop/Identity.jsx":"c33987bf4875","ui_kits/bi-desktop/Overview.jsx":"8c1ba40709a4","ui_kits/bi-desktop/Sidebar.jsx":"a34e7fa6c8e0","ui_kits/bi-desktop/SquadPerformance.jsx":"4bd3e140b96a","ui_kits/bi-desktop/Topbar.jsx":"b5c1f39211f2","ui_kits/bi-desktop/components.jsx":"5a65f580a1ff","ui_kits/bi-desktop/health-score.js":"42e73f866029","ui_kits/bi-desktop/mock-data.js":"c3a306e4ec6e","ui_kits/bi-desktop/store.js":"0bdf6b905126","ui_kits/bi-mobile/App.jsx":"7e00fe122948","ui_kits/bi-mobile/ios-frame.jsx":"d67eb3ffe562"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.V4OliveiraCoDesignSystem_e5d2e0 = window.V4OliveiraCoDesignSystem_e5d2e0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// slides/deck-stage.js
try { (() => {
/**
 * <deck-stage> — reusable web component for HTML decks.
 *
 * Handles:
 *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">
 *      and posts {slideIndexChanged: N} to the parent window on nav.
 *  (b) keyboard navigation — ←/→, PgUp/PgDn, Space, Home/End, number keys.
 *      On touch devices, tapping the left/right half of the stage goes
 *      prev/next — taps on links, buttons and other interactive slide
 *      content are left alone.
 *  (c) press R to reset to slide 0 (with a tasteful keyboard hint).
 *  (d) bottom-center overlay showing slide count + hints, fades out on idle.
 *  (e) auto-scaling — inner canvas is a fixed design size (default 1920×1080)
 *      scaled with `transform: scale()` to fit the viewport, letterboxed.
 *      Set the `noscale` attribute to render at authored size (1:1) — the
 *      PPTX exporter sets this so its DOM capture sees unscaled geometry.
 *  (f) print — `@media print` lays every slide out as its own page at the
 *      design size, so the browser's Print → Save as PDF produces a clean
 *      one-page-per-slide PDF with no extra setup.
 *  (g) thumbnail rail — resizable left-hand column of per-slide thumbnails
 *      (static clones). Click to navigate; ↑/↓ with a thumbnail focused to
 *      step between slides; drag to reorder; right-click for
 *      Skip / Move up / Move down / Delete (opens a Cancel/Delete confirm
 *      dialog). Drag the rail's right edge to resize; width persists to
 *      localStorage. Skipped slides carry `data-deck-skip`, are dimmed in
 *      the rail, omitted from prev/next navigation, and hidden at print.
 *      The rail is suppressed in presenting mode, in the host's Preview
 *      mode (ViewerMode='none'), on `noscale`, on narrow viewports
 *      (≤640px), and via the `no-rail` attribute. Rail mutations dispatch
 *      a `deckchange`
 *      CustomEvent on the element: detail = {action, from, to, slide}.
 *
 * Slides are HIDDEN, not unmounted. Non-active slides stay in the DOM with
 * `visibility: hidden` + `opacity: 0`, so their state (videos, iframes,
 * form inputs, React trees) is preserved across navigation.
 *
 * Lifecycle event — the component dispatches a `slidechange` CustomEvent on
 * itself whenever the active slide changes (including the initial mount).
 * The event bubbles and composes out of shadow DOM, so you can listen on
 * the <deck-stage> element or on document:
 *
 *   document.querySelector('deck-stage').addEventListener('slidechange', (e) => {
 *     e.detail.index         // new 0-based index
 *     e.detail.previousIndex // previous index, or -1 on init
 *     e.detail.total         // total slide count
 *     e.detail.slide         // the new active slide element
 *     e.detail.previousSlide // the prior slide element, or null on init
 *     e.detail.reason        // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
 *   });
 *
 * Persistence: none at the deck level. The host app keeps the current slide
 * in its own URL (?slide=) and re-delivers it via location.hash on load, so a
 * bare load with no hash always starts at slide 1.
 *
 * Usage:
 *   <style>deck-stage:not(:defined){visibility:hidden}</style>
 *   <deck-stage width="1920" height="1080">
 *     <section data-label="Title">...</section>
 *     <section data-label="Agenda">...</section>
 *   </deck-stage>
 *   <script src="deck-stage.js"></script>
 *
 * The :not(:defined) rule prevents a flash of the first slide at its
 * authored styles before this script runs and attaches the shadow root.
 *
 * Slides are the direct element children of <deck-stage>. Each slide is
 * automatically tagged with:
 *   - data-screen-label="NN Label"   (1-indexed, for comment flow)
 *   - data-om-validate="no_overflowing_text,no_overlapping_text,slide_sized_text"
 */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';
  const FINE_POINTER_MQ = matchMedia('(hover: hover) and (pointer: fine)');
  const NARROW_MQ = matchMedia('(max-width: 640px)');
  // Slide-authored controls that should keep a tap instead of it navigating.
  const INTERACTIVE_SEL = 'a[href], button, input, select, textarea, summary, label, video[controls], audio[controls], [role="button"], [onclick], [tabindex]:not([tabindex^="-"]), [contenteditable]:not([contenteditable="false" i])';
  const pad2 = n => String(n).padStart(2, '0');

  // Label precedence: data-label → data-screen-label (number stripped) → first heading → "Slide".
  const getSlideLabel = el => {
    const explicit = el.getAttribute('data-label');
    if (explicit) return explicit;
    const existing = el.getAttribute('data-screen-label');
    if (existing) return existing.replace(/^\s*\d+\s*/, '').trim() || existing;
    const h = el.querySelector('h1, h2, h3, [data-title]');
    const t = h && (h.textContent || '').trim().slice(0, 40);
    if (t) return t;
    return 'Slide';
  };
  const stylesheet = `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    /* connectedCallback holds this until document.fonts.ready (capped 2s) so
     * the first visible paint has the deck's real typography + final rail
     * layout. opacity (not visibility) so the active slide can't un-hide
     * itself via the ::slotted([data-deck-active]) visibility:visible rule.
     * Only the stage/rail hide — the black :host background stays, so the
     * iframe doesn't flash the page's default white. */
    :host([data-fonts-pending]) .stage,
    :host([data-fonts-pending]) .rail { opacity: 0; pointer-events: none; }

    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas {
      position: relative;
      transform-origin: center center;
      flex-shrink: 0;
      background: #fff;
      will-change: transform;
    }

    /* Slides live in light DOM (via <slot>) so authored CSS still applies.
       We absolutely position each slotted child to stack them. */
    ::slotted(*) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    .overlay {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translate(-50%, 6px) scale(0.92);
      filter: blur(6px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #000;
      color: #fff;
      border-radius: 999px;
      font-size: 12px;
      font-feature-settings: "tnum" 1;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease;
      transform-origin: center bottom;
      z-index: 2147483000;
      user-select: none;
    }
    .overlay[data-visible] {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
      filter: blur(0);
    }

    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      margin: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 28px;
      border-radius: 999px;
      color: rgba(255,255,255,0.72);
      transition: background 140ms ease, color 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn:focus-visible { outline: none; }
    .btn::-moz-focus-inner { border: 0; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      padding: 0 10px 0 12px;
      gap: 6px;
      color: rgba(255,255,255,0.72);
    }
    .btn.reset .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      line-height: 1;
      color: rgba(255,255,255,0.88);
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }

    .count {
      font-variant-numeric: tabular-nums;
      color: #fff;
      font-weight: 500;
      padding: 0 8px;
      min-width: 42px;
      text-align: center;
      font-size: 12px;
    }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; font-weight: 400; }
    .count .total { color: rgba(255,255,255,0.55); }

    .divider {
      width: 1px;
      height: 14px;
      background: rgba(255,255,255,0.18);
      margin: 0 2px;
    }

    /* ── Thumbnail rail ──────────────────────────────────────────────────
       Fixed column on the left; each thumbnail is a static deep-clone of
       the light-DOM slide scaled into a 16:9 (or design-aspect) frame. The
       stage re-fits around it (see _fit); hidden during present / noscale
       / print so capture geometry and fullscreen output are unchanged. */
    .rail {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--deck-rail-w, 188px);
      background: #141414;
      border-right: 1px solid rgba(255,255,255,0.08);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 2147482500;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.18) transparent;
    }
    .rail::-webkit-scrollbar { width: 8px; }
    .rail::-webkit-scrollbar-track { background: transparent; margin: 2px; }
    .rail::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.18);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    .rail::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.28);
      border: 2px solid transparent;
      background-clip: content-box;
    }
    :host([no-rail]) .rail,
    :host([noscale]) .rail { display: none; }
    .rail[data-presenting] { display: none; }
    @media (max-width: 640px) {
      .rail, .rail-resize { display: none; }
    }
    /* User-driven show/hide (the TweaksPanel toggle) slides instead of
       popping. Transitions are gated on :host([data-rail-anim]) — set only
       for the 200ms around the toggle — so window-resize and rail-width
       drag (which also call _fit) don't lag behind the cursor. */
    .rail[data-user-hidden] { transform: translateX(-100%); }
    :host([data-rail-anim]) .rail { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .stage { transition: left 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .canvas { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    /* transition shorthand replaces rather than merges — repeat the base
       .overlay opacity/transform/filter transitions so visibility changes
       during the 200ms toggle window still fade instead of popping. */
    :host([data-rail-anim]) .overlay {
      transition: margin-left 200ms cubic-bezier(.3,.7,.4,1),
                  opacity 260ms ease,
                  transform 260ms cubic-bezier(.2,.8,.2,1),
                  filter 260ms ease;
    }

    .thumb {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .thumb .num {
      width: 16px;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      color: rgba(255,255,255,0.55);
      padding-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .thumb .frame {
      position: relative;
      flex: 1;
      min-width: 0;
      aspect-ratio: var(--deck-aspect);
      background: #fff;
      border-radius: 4px;
      outline: 2px solid transparent;
      outline-offset: 0;
      overflow: hidden;
      transition: outline-color 120ms ease;
    }
    .thumb:hover .frame { outline-color: rgba(255,255,255,0.25); }
    .thumb { outline: none; }
    .thumb:focus-visible .frame { outline-color: rgba(255,255,255,0.5); }
    .thumb[data-current] .num { color: #fff; }
    .thumb[data-current] .frame { outline-color: #D97757; }
    .thumb[data-dragging] { opacity: 0.35; }
    .thumb::before {
      content: '';
      position: absolute;
      left: 24px;
      right: 0;
      height: 3px;
      border-radius: 2px;
      background: #D97757;
      opacity: 0;
      pointer-events: none;
    }
    .thumb[data-drop="before"]::before { top: -8px; opacity: 1; }
    .thumb[data-drop="after"]::before { bottom: -8px; opacity: 1; }
    .thumb[data-skip] .frame { opacity: 0.35; }
    .thumb[data-skip] .frame::after {
      content: 'Skipped';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .ctxmenu {
      position: fixed;
      min-width: 150px;
      padding: 4px;
      background: #242424;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 2147483100;
      display: none;
      font-size: 12px;
    }
    .ctxmenu[data-open] { display: block; }
    .ctxmenu button {
      display: block;
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      font: inherit;
      text-align: left;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ctxmenu button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .ctxmenu button:disabled { opacity: 0.35; cursor: default; }
    .ctxmenu hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 4px 2px;
    }

    .rail-resize {
      position: fixed;
      left: calc(var(--deck-rail-w, 188px) - 3px);
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2147482600;
      touch-action: none;
    }
    .rail-resize:hover,
    .rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
    :host([no-rail]) .rail-resize,
    :host([noscale]) .rail-resize,
    .rail[data-presenting] + .rail-resize,
    .rail[data-user-hidden] + .rail-resize { display: none; }

    /* Delete-confirm popup — matches the SPA's ConfirmDialog layout
       (title + message body, depressed footer with Cancel / Delete). */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .confirm-backdrop[data-open] { display: flex; }
    .confirm {
      width: 320px;
      max-width: calc(100vw - 32px);
      background: #2a2a2a;
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: inherit;
      animation: deck-confirm-in 0.18s ease;
    }
    @keyframes deck-confirm-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .confirm .body { padding: 20px 20px 16px; }
    .confirm .title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .confirm .msg { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.65); }
    .confirm .footer {
      padding: 14px 20px;
      background: #1f1f1f;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .confirm button {
      appearance: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .confirm .cancel {
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.8);
    }
    .confirm .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm .danger {
      background: #c96442;
      border: 1px solid rgba(0,0,0,0.15);
      color: #fff;
      box-shadow: 0 1px 3px rgba(166,50,68,0.3), 0 2px 6px rgba(166,50,68,0.18);
    }
    .confirm .danger:hover { background: #b5563a; }

    /* ── Print: one page per slide, no chrome ────────────────────────────
       The screen layout stacks every slide at inset:0 inside a scaled
       canvas; for print we want them in document flow at the authored
       design size so the browser paginates one slide per sheet. The
       @page size is set from the width/height attributes via the inline
       <style id="deck-stage-print-page"> that connectedCallback injects
       into <head> (the @page at-rule has no effect inside shadow DOM). */
    @media print {
      :host {
        position: static;
        inset: auto;
        background: none;
        overflow: visible;
        color: inherit;
      }
      .stage { position: static; display: block; }
      .canvas {
        transform: none !important;
        width: auto !important;
        height: auto !important;
        background: none;
        will-change: auto;
      }
      ::slotted(*) {
        position: relative !important;
        inset: auto !important;
        width: var(--deck-design-w) !important;
        height: var(--deck-design-h) !important;
        box-sizing: border-box !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
        overflow: hidden;
      }
      /* :last-child alone isn't enough once data-deck-skip hides the
         trailing slide(s) — the last *visible* slide still carries
         break-after:page and prints a blank sheet. _markLastVisible()
         maintains data-deck-last-visible on the last non-skipped slide. */
      ::slotted(*:last-child),
      ::slotted([data-deck-last-visible]) {
        break-after: auto;
        page-break-after: auto;
      }
      ::slotted([data-deck-skip]) { display: none !important; }
      .overlay, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
    }
  `;
  class DeckStage extends HTMLElement {
    static get observedAttributes() {
      return ['width', 'height', 'noscale', 'no-rail'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._index = 0;
      this._slides = [];
      this._notes = [];
      this._hideTimer = null;
      this._mouseIdleTimer = null;
      this._menuIndex = -1;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onTap = this._onTap.bind(this);
      this._onMessage = this._onMessage.bind(this);
      // Capture-phase close so a click anywhere dismisses the menu, but
      // ignore clicks that land inside the menu itself — otherwise the
      // capture handler runs before the menu's own (bubble) handler and
      // clears _menuIndex out from under it.
      this._onDocClick = e => {
        if (this._menu && e.composedPath && e.composedPath().includes(this._menu)) return;
        this._closeMenu();
      };
    }
    get designWidth() {
      return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT;
    }
    get designHeight() {
      return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT;
    }
    connectedCallback() {
      // Presenter-view popup loads deckUrl?_snthumb=...#N for its prev/cur/
      // next thumbnails — the rail has no business rendering inside those
      // (wrong scale, and it offsets the stage so the thumb shows a gutter).
      if (/[?&]_snthumb=/.test(location.search)) this.setAttribute('no-rail', '');
      this._render();
      this._loadNotes();
      this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, {
        passive: true
      });
      window.addEventListener('message', this._onMessage);
      window.addEventListener('click', this._onDocClick, true);
      this.addEventListener('click', this._onTap);
      // Initial collection + layout happens via slotchange, which fires on mount.
      this._enableRail();
      // Hold the stage hidden until webfonts are ready so the first visible
      // paint has the deck's real typography — the :not(:defined) guard in
      // the page HTML only covers custom-element upgrade, not font load.
      // Capped so a 404'd font URL can't blank the deck indefinitely.
      this.setAttribute('data-fonts-pending', '');
      const reveal = () => this.removeAttribute('data-fonts-pending');
      // rAF first: fonts.ready is a pre-resolved promise until layout has
      // resolved the slotted text's font-family and pushed a FontFace into
      // 'loading'. Reading it here in connectedCallback (parse-time) would
      // settle the race in a microtask before any font fetch starts.
      requestAnimationFrame(() => {
        Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2000))]).then(reveal, reveal);
      });
    }
    _enableRail() {
      // Idempotent — older host builds still post __omelette_rail_enabled.
      // no-rail guard keeps the observers/stylesheet walk off the cheap path
      // for presenter-popup thumbnail iframes (up to 9 per view).
      if (this._railEnabled || this.hasAttribute('no-rail')) return;
      this._railEnabled = true;
      // Per-viewer preference — restored alongside rail width. Default on;
      // only a stored '0' (from the TweaksPanel toggle) hides it.
      this._railVisible = true;
      try {
        if (localStorage.getItem('deck-stage.railVisible') === '0') this._railVisible = false;
      } catch (e) {}
      // Live thumbnail updates: watch the light-DOM slides for content
      // edits and re-clone just the affected thumb(s), debounced. Ignore
      // the data-deck-* / data-screen-label / data-om-validate attributes
      // this component itself writes so nav and skip don't trigger
      // spurious refreshes.
      const OWN_ATTRS = /^data-(deck-|screen-label$|om-validate$)/;
      this._liveDirty = new Set();
      this._liveObserver = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && OWN_ATTRS.test(r.attributeName || '')) continue;
          let n = r.target;
          while (n && n.parentElement !== this) n = n.parentElement;
          if (n && this._slideSet && this._slideSet.has(n)) this._liveDirty.add(n);
        }
        if (this._liveDirty.size && !this._liveTimer) {
          this._liveTimer = setTimeout(() => {
            this._liveTimer = null;
            this._liveDirty.forEach(s => this._refreshThumb(s));
            this._liveDirty.clear();
          }, 200);
        }
      });
      this._liveObserver.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      // Lazy thumbnail materialization — clone the slide only when its
      // frame scrolls into (or near) the rail viewport. rootMargin gives
      // ~4 thumbs of pre-load so fast scrolling doesn't flash blanks.
      this._railObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.target.__deckThumb) {
            this._materialize(e.target.__deckThumb);
          }
        });
      }, {
        root: this._rail,
        rootMargin: '400px 0px'
      });
      // Tweaks typically change CSS vars / attrs OUTSIDE <deck-stage>
      // (on <html>, <body>, a wrapper div, or a <style> tag), which
      // _liveObserver can't see. Re-snapshot author CSS (constructable
      // sheet is shared by reference, so one replaceSync updates every
      // thumb shadow root) and re-sync each thumb host's attrs + custom
      // properties. In-slide DOM mutations are _liveObserver's job.
      // Debounced so slider drags don't thrash.
      this._onTweakChange = () => {
        clearTimeout(this._tweakTimer);
        this._tweakTimer = setTimeout(() => {
          this._snapshotAuthorCss();
          // One getComputedStyle for the whole batch — each
          // getPropertyValue read below reuses the same computed style
          // as long as nothing invalidates layout between thumbs.
          const cs = getComputedStyle(this);
          (this._thumbs || []).forEach(t => {
            if (t.host) this._syncThumbHostAttrs(t.host, cs);
          });
        }, 120);
      };
      window.addEventListener('tweakchange', this._onTweakChange);
      this._snapshotAuthorCss();
      // Build the rail now that it's enabled — slotchange already fired,
      // so _renderRail's early-return skipped the initial build.
      this._syncRailHidden();
      this._renderRail();
      this._fit();
    }

    /** Snapshot document stylesheets into a constructable sheet that each
     *  thumbnail's nested shadow root adopts — so author CSS styles the
     *  cloned slide content without touching this component's chrome.
     *  Cross-origin sheets throw on .cssRules — skip them. Re-callable:
     *  the existing constructable sheet is reused via replaceSync so every
     *  already-adopted shadow root picks up the fresh CSS without re-adopt. */
    _snapshotAuthorCss() {
      // :root in an adopted sheet inside a shadow root matches nothing
      // (only the document root qualifies), so author rules like
      // `:root[data-voice="modern"] .serif` never reach the clones.
      // Rewrite :root → :host and mirror <html>'s data-*/class/lang onto
      // each thumb host (see _syncThumbHostAttrs) so the same selectors
      // match inside the thumbnail's shadow tree.
      const authorCss = Array.from(document.styleSheets).map(sh => {
        try {
          return Array.from(sh.cssRules).map(r => r.cssText).join('\n');
        } catch (e) {
          return '';
        }
      }).join('\n')
      // The shadow host is featureless outside the functional :host(...)
      // form, so any compound on :root — [attr], .class, #id, :pseudo —
      // must become :host(<compound>) not :host<compound>. Same for the
      // html type selector (Tailwind class-strategy dark mode emits
      // html.dark; Pico uses html[data-theme]), which has nothing to
      // match inside the thumb's shadow tree.
      .replace(/:root((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)/g, ':host($1)').replace(/:root\b/g, ':host').replace(/(^|[\s,>~+(}])html((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)(?![-\w])/g, '$1:host($2)').replace(/(^|[\s,>~+(}])html(?![-\w])/g, '$1:host');
      // Every custom property the author references. _syncThumbHostAttrs
      // mirrors each one's *computed* value at <deck-stage> onto the
      // thumb host so the live value wins over the :host default above
      // regardless of which ancestor the tweak wrote to (<html>, <body>,
      // a wrapper div, or the deck-stage element itself all inherit
      // down to getComputedStyle(this)).
      this._authorVars = new Set(authorCss.match(/--[\w-]+/g) || []);
      try {
        if (!this._adoptedSheet) this._adoptedSheet = new CSSStyleSheet();
        this._adoptedSheet.replaceSync(authorCss);
      } catch (e) {
        this._adoptedSheet = null;
        this._authorCss = authorCss;
      }
    }
    _syncThumbHostAttrs(host, cs) {
      const de = document.documentElement;
      // setAttribute overwrites but can't delete — an attr removed from
      // <html> (toggleAttribute off, classList emptied) would linger on
      // the host and :host([data-*]) / :host(.foo) rules would keep
      // matching. Remove stale mirrored attrs first; iterate backward
      // because removeAttribute mutates the live NamedNodeMap.
      for (let i = host.attributes.length - 1; i >= 0; i--) {
        const n = host.attributes[i].name;
        if ((n.startsWith('data-') || n === 'class' || n === 'lang') && !de.hasAttribute(n)) {
          host.removeAttribute(n);
        }
      }
      for (const a of de.attributes) {
        if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'lang') {
          host.setAttribute(a.name, a.value);
        }
      }
      // The :root→:host rewrite in _snapshotAuthorCss pins each custom
      // property to its stylesheet default on the thumb host, shadowing
      // the live value that would otherwise inherit. Tweaks can write the
      // live value on any ancestor — <html>, <body>, a wrapper div, the
      // deck-stage element — so read it as the *computed* value at
      // <deck-stage> (which sees the whole inheritance chain) rather than
      // trying to guess which element the author wrote to. Inline on the
      // host beats the :host{} rule. remove-stale covers vars dropped
      // from the stylesheet between snapshots.
      const vars = this._authorVars || new Set();
      for (let i = host.style.length - 1; i >= 0; i--) {
        const p = host.style[i];
        if (p.startsWith('--') && !vars.has(p)) host.style.removeProperty(p);
      }
      const live = cs || getComputedStyle(this);
      vars.forEach(p => {
        const v = live.getPropertyValue(p);
        if (v) host.style.setProperty(p, v.trim());else host.style.removeProperty(p);
      });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('click', this._onDocClick, true);
      this.removeEventListener('click', this._onTap);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._mouseIdleTimer) clearTimeout(this._mouseIdleTimer);
      if (this._liveTimer) clearTimeout(this._liveTimer);
      if (this._tweakTimer) clearTimeout(this._tweakTimer);
      if (this._railAnimTimer) clearTimeout(this._railAnimTimer);
      if (this._scaleRaf) cancelAnimationFrame(this._scaleRaf);
      if (this._liveObserver) this._liveObserver.disconnect();
      if (this._railObserver) this._railObserver.disconnect();
      if (this._onTweakChange) window.removeEventListener('tweakchange', this._onTweakChange);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px';
        this._canvas.style.height = this.designHeight + 'px';
        this._canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
        this._canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
        if (this._rail) {
          this._rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
        }
        this._fit();
        this._scaleThumbs();
        this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot);
      stage.appendChild(canvas);

      // Overlay: compact, solid black, with clickable controls.
      const overlay = document.createElement('div');
      overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      overlay.setAttribute('aria-label', 'Deck controls');
      overlay.setAttribute('data-omelette-chrome', '');
      overlay.innerHTML = `
        <button class="btn prev" type="button" aria-label="Previous slide" title="Previous (←)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>
        </button>
        <span class="count" aria-live="polite"><span class="current">1</span><span class="sep">/</span><span class="total">1</span></span>
        <button class="btn next" type="button" aria-label="Next slide" title="Next (→)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <span class="divider"></span>
        <button class="btn reset" type="button" aria-label="Reset to first slide" title="Reset (R)">Reset<span class="kbd">R</span></button>
      `;
      overlay.querySelector('.prev').addEventListener('click', () => this._advance(-1, 'click'));
      overlay.querySelector('.next').addEventListener('click', () => this._advance(1, 'click'));
      overlay.querySelector('.reset').addEventListener('click', () => this._go(0, 'click'));

      // Thumbnail rail + context menu. Thumbnails are populated in
      // _renderRail() after _collectSlides().
      const rail = document.createElement('div');
      rail.className = 'rail export-hidden';
      rail.setAttribute('data-omelette-chrome', '');
      rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
      // Edge auto-scroll while dragging a thumb near the rail's top/bottom
      // so off-screen drop targets are reachable. Native dragover fires
      // continuously while the pointer is stationary, so a per-event nudge
      // (ramped by edge proximity) is enough — no rAF loop needed.
      rail.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        const r = rail.getBoundingClientRect();
        const EDGE = 40;
        const dt = e.clientY - r.top;
        const db = r.bottom - e.clientY;
        if (dt < EDGE) rail.scrollTop -= Math.ceil((EDGE - dt) / 3);else if (db < EDGE) rail.scrollTop += Math.ceil((EDGE - db) / 3);
      });
      const menu = document.createElement('div');
      menu.className = 'ctxmenu export-hidden';
      menu.setAttribute('data-omelette-chrome', '');
      menu.innerHTML = `
        <button type="button" data-act="skip">Skip slide</button>
        <button type="button" data-act="up">Move up</button>
        <button type="button" data-act="down">Move down</button>
        <hr>
        <button type="button" data-act="delete">Delete slide</button>
      `;
      menu.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        const i = this._menuIndex;
        this._closeMenu();
        if (act === 'skip') this._toggleSkip(i);else if (act === 'up') this._moveSlide(i, i - 1);else if (act === 'down') this._moveSlide(i, i + 1);else if (act === 'delete') this._openConfirm(i);
      });
      menu.addEventListener('contextmenu', e => e.preventDefault());

      // Rail resize handle — drag to set --deck-rail-w, persisted to
      // localStorage so the width survives reloads.
      const resize = document.createElement('div');
      resize.className = 'rail-resize export-hidden';
      resize.setAttribute('data-omelette-chrome', '');
      resize.addEventListener('pointerdown', e => {
        e.preventDefault();
        resize.setPointerCapture(e.pointerId);
        resize.setAttribute('data-dragging', '');
        const move = ev => this._setRailWidth(ev.clientX);
        const up = () => {
          resize.removeEventListener('pointermove', move);
          resize.removeEventListener('pointerup', up);
          resize.removeEventListener('pointercancel', up);
          resize.removeAttribute('data-dragging');
          try {
            localStorage.setItem('deck-stage.railWidth', String(this._railPx));
          } catch (err) {}
        };
        resize.addEventListener('pointermove', move);
        resize.addEventListener('pointerup', up);
        resize.addEventListener('pointercancel', up);
      });

      // Delete-confirm dialog — mirrors the SPA's ConfirmDialog layout.
      const confirm = document.createElement('div');
      confirm.className = 'confirm-backdrop export-hidden';
      confirm.setAttribute('data-omelette-chrome', '');
      confirm.innerHTML = `
        <div class="confirm" role="dialog" aria-modal="true">
          <div class="body">
            <div class="title">Delete slide?</div>
            <div class="msg">This slide will be removed from the deck.</div>
          </div>
          <div class="footer">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger">Delete</button>
          </div>
        </div>
      `;
      confirm.addEventListener('click', e => {
        if (e.target === confirm) this._closeConfirm();
      });
      confirm.querySelector('.cancel').addEventListener('click', () => this._closeConfirm());
      confirm.querySelector('.danger').addEventListener('click', () => {
        const i = this._confirmIndex;
        this._closeConfirm();
        this._deleteSlide(i);
      });
      this._root.append(style, rail, resize, stage, overlay, menu, confirm);
      this._canvas = canvas;
      this._stage = stage;
      this._slot = slot;
      this._overlay = overlay;
      this._rail = rail;
      this._resize = resize;
      this._menu = menu;
      this._confirm = confirm;
      this._countEl = overlay.querySelector('.current');
      this._totalEl = overlay.querySelector('.total');

      // Restore persisted rail width.
      let rw = 188;
      try {
        const s = localStorage.getItem('deck-stage.railWidth');
        if (s) rw = parseInt(s, 10) || rw;
      } catch (err) {}
      this._setRailWidth(rw);
      this._syncRailHidden();
    }
    _setRailWidth(px) {
      const w = Math.max(120, Math.min(360, Math.round(px)));
      this._railPx = w;
      this.style.setProperty('--deck-rail-w', w + 'px');
      this._fit();
      // _scaleThumbs forces a sync layout (frame.offsetWidth) then writes
      // N transforms. During a resize drag this runs per-pointermove;
      // coalesce to one per frame.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }

    /** @page must live in the document stylesheet — it's a no-op inside
     *  shadow DOM. Inject/update a single <head> style tag so the print
     *  sheet matches the design size and Save-as-PDF yields one slide per
     *  page with no margins. */
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
      }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; overflow: visible !important; height: auto !important; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    }
    _onSlotChange() {
      // Rail mutations (delete/move) already reconcile synchronously and
      // emit slidechange with reason 'api'; skip the async slotchange that
      // would otherwise re-broadcast with reason 'init'.
      if (this._squelchSlotChange) {
        this._squelchSlotChange = false;
        return;
      }
      this._collectSlides();
      this._restoreIndex();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'init'
      });
      this._fit();
    }
    _collectSlides() {
      const assigned = this._slot.assignedElements({
        flatten: true
      });
      this._slides = assigned.filter(el => {
        // Skip template/style/script nodes even if someone slots them.
        const tag = el.tagName;
        return tag !== 'TEMPLATE' && tag !== 'SCRIPT' && tag !== 'STYLE';
      });
      this._slideSet = new Set(this._slides);
      this._slides.forEach((slide, i) => {
        const n = i + 1;
        slide.setAttribute('data-screen-label', `${pad2(n)} ${getSlideLabel(slide)}`);

        // Validation attribute for comment flow / auto-checks.
        if (!slide.hasAttribute('data-om-validate')) {
          slide.setAttribute('data-om-validate', VALIDATE_ATTR);
        }
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
      this._markLastVisible();
      this._renderRail();
    }

    /** Tag the last non-skipped slide so print CSS can drop its
     *  break-after (see the @media print comment above — :last-child
     *  alone matches a hidden skipped slide). */
    _markLastVisible() {
      let last = null;
      this._slides.forEach(s => {
        s.removeAttribute('data-deck-last-visible');
        if (!s.hasAttribute('data-deck-skip')) last = s;
      });
      if (last) last.setAttribute('data-deck-last-visible', '');
    }
    _loadNotes() {
      const tag = document.getElementById('speaker-notes');
      if (!tag) {
        this._notes = [];
        return;
      }
      try {
        const parsed = JSON.parse(tag.textContent || '[]');
        if (Array.isArray(parsed)) this._notes = parsed;
      } catch (e) {
        console.warn('[deck-stage] Failed to parse #speaker-notes JSON:', e);
        this._notes = [];
      }
    }
    _restoreIndex() {
      // The host's ?slide= param is delivered as a #<int> hash (1-indexed) on
      // the iframe src. No hash → slide 1; the deck itself keeps no position
      // state across loads.
      const h = (location.hash || '').match(/^#(\d+)$/);
      if (h) {
        const n = parseInt(h[1], 10) - 1;
        if (n >= 0 && n < this._slides.length) this._index = n;
      }
    }
    _applyIndex({
      showOverlay = true,
      broadcast = true,
      reason = 'init'
    } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex == null ? -1 : this._prevIndex;
      const curr = this._index;
      // Keep the iframe's own hash in sync so an in-iframe location.reload()
      // (reload banner path in viewer-handle.ts) lands on the current slide,
      // not the stale deep-link hash from initial load.
      try {
        history.replaceState(null, '', '#' + (curr + 1));
      } catch (e) {}
      this._slides.forEach((s, i) => {
        if (i === curr) s.setAttribute('data-deck-active', '');else s.removeAttribute('data-deck-active');
      });
      if (this._countEl) this._countEl.textContent = String(curr + 1);
      // Follow-scroll on every navigation (init deep-link, keyboard, click,
      // tap, external goTo) — the only time we *don't* want the rail to
      // track current is after a rail-internal mutation, where _renderRail
      // has already restored the user's scroll position and yanking back to
      // current would undo it.
      this._syncRail(reason !== 'mutation');
      if (broadcast) {
        // (1) Legacy: host-window postMessage for speaker-notes renderers.
        try {
          window.postMessage({
            slideIndexChanged: curr,
            deckTotal: this._slides.length,
            deckSkipped: this._skippedIndices()
          }, '*');
        } catch (e) {}

        // (2) In-page CustomEvent on the <deck-stage> element itself.
        //     Bubbles and composes out of shadow DOM so slide code can listen:
        //       document.querySelector('deck-stage').addEventListener('slidechange', e => {
        //         e.detail.index, e.detail.previousIndex, e.detail.total, e.detail.slide, e.detail.reason
        //       });
        const detail = {
          index: curr,
          previousIndex: prev,
          total: this._slides.length,
          slide: this._slides[curr] || null,
          previousSlide: prev >= 0 ? this._slides[prev] || null : null,
          reason: reason // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
        };
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail,
          bubbles: true,
          composed: true
        }));
      }
      this._prevIndex = curr;
      if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() {
      // Host posts __omelette_presenting while in fullscreen/tab presentation
      // mode — suppress the nav footer entirely (both hover and slide-change
      // flash) so the audience sees clean slides.
      if (!this._overlay || this._presenting) return;
      this._overlay.setAttribute('data-visible', '');
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._overlay.removeAttribute('data-visible');
      }, OVERLAY_HIDE_MS);
    }
    _railWidth() {
      // State-based, no offsetWidth: the first _fit() can run before the
      // rail has had layout on some load paths, and a 0 there paints the
      // slide full-width for one frame before the post-slotchange _fit()
      // corrects it.
      if (!this._railEnabled || !this._railVisible || this.hasAttribute('no-rail') || this.hasAttribute('noscale') || this._presenting || this._previewMode || NARROW_MQ.matches) return 0;
      return this._railPx || 0;
    }
    _fit() {
      if (!this._canvas) return;
      const stage = this._canvas.parentElement;
      // PPTX export sets noscale so the DOM capture sees authored-size
      // geometry — the scaled canvas is in shadow DOM, so the exporter's
      // resetTransformSelector can't reach .canvas.style.transform directly.
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        if (stage) stage.style.left = '0';
        if (this._overlay) this._overlay.style.marginLeft = '0';
        return;
      }
      const rw = this._railWidth();
      if (stage) stage.style.left = rw + 'px';
      // Overlay is centred on the viewport via left:50% + translate(-50%);
      // marginLeft shifts the centre by rw/2 so it lands in the middle of
      // the [rw, innerWidth] stage region.
      if (this._overlay) this._overlay.style.marginLeft = rw / 2 + 'px';
      const vw = window.innerWidth - rw;
      const vh = window.innerHeight;
      const s = Math.min(vw / this.designWidth, vh / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() {
      this._fit();
      // Crossing the narrow-viewport breakpoint reveals the rail — rerun the
      // thumbnail scale the same way _setRailWidth does.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }
    _onMouseMove() {
      // Keep overlay visible while mouse moves; hide after idle.
      this._flashOverlay();
    }
    _onMessage(e) {
      const d = e.data;
      if (d && typeof d.__omelette_presenting === 'boolean') {
        this._presenting = d.__omelette_presenting;
        if (this._presenting && this._overlay) {
          this._overlay.removeAttribute('data-visible');
          if (this._hideTimer) clearTimeout(this._hideTimer);
        }
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Host's Preview segment (ViewerMode='none'): the rail's drag-reorder /
      // right-click skip-delete affordances are editing chrome, so hide it
      // while the user is just looking at the deck. Same hard-hide path as
      // presenting; independent of the user's _railVisible preference so
      // returning to Edit restores whatever they had.
      if (d && typeof d.__omelette_preview_mode === 'boolean') {
        if (d.__omelette_preview_mode === this._previewMode) return;
        this._previewMode = d.__omelette_preview_mode;
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Per-viewer show/hide, driven by the TweaksPanel's auto-injected
      // "Thumbnail rail" toggle (or any author script). Independent of
      // whether the Tweaks panel itself is open — closing the panel
      // doesn't change rail visibility. Persists alongside rail width.
      if (d && d.type === '__deck_rail_visible' && typeof d.on === 'boolean') {
        if (d.on === this._railVisible) return;
        this._railVisible = d.on;
        try {
          localStorage.setItem('deck-stage.railVisible', d.on ? '1' : '0');
        } catch (e) {}
        // Arm the transition, commit it, then flip state — otherwise the
        // browser coalesces both writes and nothing animates on show.
        this.setAttribute('data-rail-anim', '');
        void (this._rail && this._rail.offsetHeight);
        this._syncRailHidden();
        this._fit();
        this._scaleThumbs();
        clearTimeout(this._railAnimTimer);
        this._railAnimTimer = setTimeout(() => this.removeAttribute('data-rail-anim'), 220);
      }
      if (d && d.type === '__omelette_rail_enabled') this._enableRail();
    }
    _syncRailHidden() {
      if (!this._rail) return;
      // data-presenting is the hard hide (display:none) for flag-off,
      // presentation mode, and the host's Preview segment — instant, no
      // transition. data-user-hidden is the soft hide (translateX(-100%))
      // for the viewer's rail toggle, so show/hide slides under
      // :host([data-rail-anim]).
      const hard = !this._railEnabled || this._presenting || this._previewMode;
      if (hard) this._rail.setAttribute('data-presenting', '');else this._rail.removeAttribute('data-presenting');
      if (!this._railVisible) this._rail.setAttribute('data-user-hidden', '');else this._rail.removeAttribute('data-user-hidden');
      // translateX hide leaves thumbs (tabIndex=0) in the tab order —
      // inert keeps them unfocusable while the rail is off-screen.
      this._rail.inert = hard || !this._railVisible;
    }
    _onTap(e) {
      // Touch-only — keyboard + the overlay toolbar cover nav on desktop.
      if (FINE_POINTER_MQ.matches) return;
      // Only taps that land on the stage (slide content or letterbox); the
      // overlay / rail / menus are siblings with their own click handlers.
      const path = e.composedPath();
      if (!this._stage || !path.includes(this._stage)) return;
      // Let interactive slide content keep the tap. composedPath (not
      // e.target.closest) so we see through open shadow roots — a <button>
      // inside a slide-authored custom element retargets e.target to the
      // host but still appears in the composed path.
      if (e.defaultPrevented) return;
      for (const n of path) {
        if (n === this._stage) break;
        if (n.matches && n.matches(INTERACTIVE_SEL)) return;
      }
      e.preventDefault();
      const rw = this._railWidth();
      const mid = rw + (window.innerWidth - rw) / 2;
      this._advance(e.clientX < mid ? -1 : 1, 'tap');
    }
    _onKey(e) {
      // Ignore when the user is typing.
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Confirm dialog swallows nav keys while open; Escape cancels. Enter
      // is left to the focused button's native activation so Tab→Cancel
      // →Enter activates Cancel, not the window-level confirm path.
      if (this._confirm && this._confirm.hasAttribute('data-open')) {
        if (e.key === 'Escape') {
          this._closeConfirm();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Escape' && this._menu && this._menu.hasAttribute('data-open')) {
        this._closeMenu();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      let handled = true;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
        this._advance(1, 'keyboard');
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        this._advance(-1, 'keyboard');
      } else if (key === 'Home') {
        this._go(0, 'keyboard');
      } else if (key === 'End') {
        this._go(this._slides.length - 1, 'keyboard');
      } else if (key === 'r' || key === 'R') {
        this._go(0, 'keyboard');
      } else if (/^[0-9]$/.test(key)) {
        // 1..9 jump to that slide; 0 jumps to 10.
        const n = key === '0' ? 9 : parseInt(key, 10) - 1;
        if (n < this._slides.length) this._go(n, 'keyboard');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        this._flashOverlay();
      }
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) {
        this._flashOverlay();
        return;
      }
      this._index = clamped;
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason
      });
    }

    /** Step forward/back skipping any slide marked data-deck-skip. Falls
     *  back to _go's clamp-at-ends behaviour (flash overlay) when there's
     *  nothing further in that direction. */
    _advance(dir, reason) {
      if (!this._slides.length) return;
      let i = this._index + dir;
      while (i >= 0 && i < this._slides.length && this._slides[i].hasAttribute('data-deck-skip')) {
        i += dir;
      }
      if (i < 0 || i >= this._slides.length) {
        this._flashOverlay();
        return;
      }
      this._go(i, reason);
    }

    // ── Thumbnail rail ────────────────────────────────────────────────────
    //
    // Thumbs are keyed by slide element and reused across _renderRail()
    // calls, so a reorder/delete is an O(changed) DOM shuffle instead of an
    // O(N) teardown-and-re-clone. Each thumb starts as a lightweight shell
    // (num + empty frame); the clone is materialized lazily by an
    // IntersectionObserver when the frame scrolls into (or near) view, so
    // only visible-ish slides pay the clone + image-decode cost.

    _renderRail() {
      if (!this._rail || !this._railEnabled) {
        this._thumbs = [];
        return;
      }
      // FLIP: record each *materialized* thumb's top before the reconcile.
      // Off-screen (non-materialized) thumbs don't need the animation and
      // skipping their getBoundingClientRect saves a forced layout per
      // off-screen thumb on large decks.
      const prevTops = new Map();
      (this._thumbs || []).forEach(({
        thumb,
        slide,
        host
      }) => {
        if (host) prevTops.set(slide, thumb.getBoundingClientRect().top);
      });
      const st = this._rail.scrollTop;

      // Reconcile: reuse thumbs that already exist for a slide, create
      // shells for new slides, drop thumbs for removed slides.
      const bySlide = new Map();
      (this._thumbs || []).forEach(t => bySlide.set(t.slide, t));
      const next = [];
      this._slides.forEach(slide => {
        let t = bySlide.get(slide);
        if (t) bySlide.delete(slide);else t = this._makeThumb(slide);
        next.push(t);
      });
      // Orphans — slides removed since last render.
      bySlide.forEach(t => {
        if (this._railObserver) this._railObserver.unobserve(t.frame);
        t.thumb.remove();
      });
      // Put thumbs into document order to match _slides. insertBefore on
      // an already-correctly-placed node is a no-op, so this is cheap
      // when nothing moved.
      next.forEach((t, i) => {
        const want = t.thumb;
        const at = this._rail.children[i];
        if (at !== want) this._rail.insertBefore(want, at || null);
        t.i = i;
        t.num.textContent = String(i + 1);
        if (t.slide.hasAttribute('data-deck-skip')) t.thumb.setAttribute('data-skip', '');else t.thumb.removeAttribute('data-skip');
      });
      this._thumbs = next;
      this._rail.scrollTop = st;
      if (prevTops.size) {
        const moved = [];
        this._thumbs.forEach(({
          thumb,
          slide
        }) => {
          const old = prevTops.get(slide);
          if (old == null) return;
          const dy = old - thumb.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          thumb.style.transition = 'none';
          thumb.style.transform = `translateY(${dy}px)`;
          moved.push(thumb);
        });
        if (moved.length) {
          // Commit the inverted positions before flipping the transition
          // on — otherwise the browser coalesces both style writes and
          // nothing animates.
          void this._rail.offsetHeight;
          moved.forEach(t => {
            t.style.transition = 'transform 180ms cubic-bezier(.2,.7,.3,1)';
            t.style.transform = '';
          });
          setTimeout(() => moved.forEach(t => {
            t.style.transition = '';
          }), 220);
        }
      }
      requestAnimationFrame(() => this._scaleThumbs());
      this._syncRail(false);
    }

    /** Create a lightweight thumb shell for one slide. The clone is
     *  materialized later by the IntersectionObserver. Event handlers
     *  look up the thumb's *current* index (via _thumbs.indexOf) so the
     *  same element can be reused across reorders. */
    _makeThumb(slide) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.tabIndex = 0;
      const num = document.createElement('div');
      num.className = 'num';
      const frame = document.createElement('div');
      frame.className = 'frame';
      thumb.append(num, frame);
      const entry = {
        thumb,
        num,
        frame,
        slide,
        clone: null,
        host: null,
        i: -1
      };
      // entry.i is refreshed on every _renderRail reconcile pass, so
      // handlers read the thumb's current position without an O(N) scan.
      const idx = () => entry.i;
      thumb.addEventListener('click', () => this._go(idx(), 'click'));
      // ↑/↓ step through the rail when a thumb has focus. _go clamps at the
      // ends and _applyIndex→_syncRail scrolls the new current thumb into
      // view; we move focus to it (preventScroll — _syncRail already
      // scrolled) so a held key walks the whole list. stopPropagation keeps
      // this out of the window-level _onKey nav handler.
      thumb.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        this._go(idx() + (e.key === 'ArrowDown' ? 1 : -1), 'keyboard');
        const cur = this._thumbs && this._thumbs[this._index];
        if (cur) cur.thumb.focus({
          preventScroll: true
        });
      });
      thumb.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._openMenu(idx(), e.clientX, e.clientY);
      });
      thumb.draggable = true;
      thumb.addEventListener('dragstart', e => {
        this._dragFrom = idx();
        thumb.setAttribute('data-dragging', '');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(this._dragFrom));
        } catch (err) {}
      });
      thumb.addEventListener('dragend', () => {
        thumb.removeAttribute('data-dragging');
        this._clearDrop();
        this._dragFrom = null;
      });
      thumb.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = thumb.getBoundingClientRect();
        this._setDrop(idx(), e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      });
      thumb.addEventListener('drop', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        const i = idx();
        const r = thumb.getBoundingClientRect();
        let to = e.clientY >= r.top + r.height / 2 ? i + 1 : i;
        if (this._dragFrom < to) to--;
        const from = this._dragFrom;
        this._clearDrop();
        this._dragFrom = null;
        if (to !== from) this._moveSlide(from, to);
      });
      if (this._railObserver) this._railObserver.observe(frame);
      frame.__deckThumb = entry;
      return entry;
    }

    /** Lazily build the clone for a thumb that has scrolled into view. */
    _materialize(entry) {
      if (entry.host) return;
      const dw = this.designWidth,
        dh = this.designHeight;
      let clone = entry.slide.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-deck-active');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Neuter heavy media; replace <video> with its poster so the box
      // keeps a visual. <iframe>/<audio> become empty placeholders.
      clone.querySelectorAll('iframe, audio, object, embed').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('srcdoc');
        el.removeAttribute('data');
        el.innerHTML = '';
      });
      clone.querySelectorAll('video').forEach(el => {
        if (!el.poster) {
          el.removeAttribute('src');
          el.innerHTML = '';
          return;
        }
        const img = document.createElement('img');
        img.src = el.poster;
        img.alt = '';
        img.style.cssText = el.style.cssText + ';object-fit:cover;width:100%;height:100%;';
        img.className = el.className;
        el.replaceWith(img);
      });
      // Images: defer decode and let the browser pick the smallest
      // srcset candidate for the ~140px thumb. Same-URL clones reuse the
      // slide's decoded bitmap (URL-keyed cache), so the remaining cost
      // is paint/composite — lazy+async keeps that off the main thread.
      clone.querySelectorAll('img').forEach(el => {
        el.loading = 'lazy';
        el.decoding = 'async';
        if (el.srcset) el.sizes = (this._railPx || 188) + 'px';
      });
      // Custom elements inside the slide would have their
      // connectedCallback fire when the clone is appended. Replace them
      // with inert boxes so a component-heavy deck doesn't run N copies
      // of each component's mount logic in the rail. Children are
      // preserved so layout-wrapper elements (<my-column><h2>…</h2>)
      // still show their authored content; the querySelectorAll NodeList
      // is static, so nested custom elements in the moved subtree are
      // still visited on later iterations.
      const neuter = el => {
        const box = document.createElement('div');
        box.style.cssText = (el.getAttribute('style') || '') + ';background:rgba(0,0,0,0.06);border:1px dashed rgba(0,0,0,0.15);';
        box.className = el.className;
        // Preserve theming/i18n hooks so [data-*] / :lang() / [dir]
        // descendant selectors still match the neutered root.
        for (const a of el.attributes) {
          const n = a.name;
          if (n.startsWith('data-') || n.startsWith('aria-') || n === 'lang' || n === 'dir' || n === 'role' || n === 'title') {
            box.setAttribute(n, a.value);
          }
        }
        while (el.firstChild) box.appendChild(el.firstChild);
        return box;
      };
      // querySelectorAll('*') returns descendants only — a custom-element
      // slide root (<my-slide>…</my-slide>) would slip through and upgrade
      // on append. Swap the root first.
      if (clone.tagName.includes('-')) clone = neuter(clone);
      clone.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes('-')) el.replaceWith(neuter(el));
      });
      clone.style.cssText += ';position:absolute;top:0;left:0;transform-origin:0 0;' + 'pointer-events:none;width:' + dw + 'px;height:' + dh + 'px;' + 'box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;';
      this._syncThumbHostAttrs(host);
      const sr = host.attachShadow({
        mode: 'open'
      });
      if (this._adoptedSheet) sr.adoptedStyleSheets = [this._adoptedSheet];else {
        const st = document.createElement('style');
        st.textContent = this._authorCss || '';
        sr.appendChild(st);
      }
      sr.appendChild(clone);
      entry.frame.appendChild(host);
      entry.host = host;
      entry.clone = clone;
      if (this._thumbScale) clone.style.transform = 'scale(' + this._thumbScale + ')';
      // Once materialized the IO callback is a no-op early-return —
      // unobserve so scroll doesn't keep firing it.
      if (this._railObserver) this._railObserver.unobserve(entry.frame);
    }

    /** Re-clone a single thumb (live-update path). No-op if the thumb
     *  hasn't been materialized yet — it'll pick up current content when
     *  it scrolls into view. */
    _refreshThumb(slide) {
      const entry = (this._thumbs || []).find(t => t.slide === slide);
      if (!entry || !entry.host) return;
      entry.host.remove();
      entry.host = entry.clone = null;
      this._materialize(entry);
    }
    _scaleThumbs() {
      if (!this._thumbs || !this._thumbs.length) return;
      // Every frame is the same width; if it reads 0 the rail is
      // display:none (noscale / no-rail / presenting / print) — leave the
      // clones as-is and re-run when the rail is revealed.
      const fw = this._thumbs[0].frame.offsetWidth;
      if (!fw) return;
      this._thumbScale = fw / this.designWidth;
      this._thumbs.forEach(({
        clone
      }) => {
        if (clone) clone.style.transform = 'scale(' + this._thumbScale + ')';
      });
    }
    _setDrop(i, where) {
      // dragover fires at pointer-event rate; touch only the previous
      // and new target rather than sweeping all N thumbs.
      const t = this._thumbs && this._thumbs[i];
      if (this._dropOn && this._dropOn !== t) {
        this._dropOn.thumb.removeAttribute('data-drop');
      }
      if (t) t.thumb.setAttribute('data-drop', where);
      this._dropOn = t || null;
    }
    _clearDrop() {
      if (this._dropOn) this._dropOn.thumb.removeAttribute('data-drop');
      this._dropOn = null;
    }
    _syncRail(follow) {
      if (!this._thumbs) return;
      this._thumbs.forEach(({
        thumb
      }, i) => {
        if (i === this._index) {
          thumb.setAttribute('data-current', '');
          if (follow && typeof thumb.scrollIntoView === 'function') {
            thumb.scrollIntoView({
              block: 'nearest'
            });
          }
        } else {
          thumb.removeAttribute('data-current');
        }
      });
    }
    _openMenu(i, x, y) {
      if (!this._menu) return;
      this._menuIndex = i;
      const slide = this._slides[i];
      const skip = slide && slide.hasAttribute('data-deck-skip');
      this._menu.querySelector('[data-act="skip"]').textContent = skip ? 'Unskip slide' : 'Skip slide';
      this._menu.querySelector('[data-act="up"]').disabled = i <= 0;
      this._menu.querySelector('[data-act="down"]').disabled = i >= this._slides.length - 1;
      this._menu.querySelector('[data-act="delete"]').disabled = this._slides.length <= 1;
      // Place, then clamp to viewport after it's measurable.
      this._menu.style.left = x + 'px';
      this._menu.style.top = y + 'px';
      this._menu.setAttribute('data-open', '');
      const r = this._menu.getBoundingClientRect();
      const nx = Math.min(x, window.innerWidth - r.width - 4);
      const ny = Math.min(y, window.innerHeight - r.height - 4);
      this._menu.style.left = Math.max(4, nx) + 'px';
      this._menu.style.top = Math.max(4, ny) + 'px';
    }
    _closeMenu() {
      if (this._menu) this._menu.removeAttribute('data-open');
      this._menuIndex = -1;
    }
    _openConfirm(i) {
      if (!this._confirm) return;
      this._confirmIndex = i;
      this._confirm.querySelector('.title').textContent = 'Delete slide ' + (i + 1) + '?';
      this._confirm.setAttribute('data-open', '');
      const btn = this._confirm.querySelector('.danger');
      if (btn && btn.focus) btn.focus();
    }
    _closeConfirm() {
      if (this._confirm) this._confirm.removeAttribute('data-open');
      this._confirmIndex = -1;
    }
    _emitDeckChange(detail) {
      this.dispatchEvent(new CustomEvent('deckchange', {
        detail,
        bubbles: true,
        composed: true
      }));
    }
    _deleteSlide(i) {
      const slide = this._slides[i];
      if (!slide || this._slides.length <= 1) return;
      const wasCurrent = i === this._index;
      if (i < this._index || wasCurrent && i === this._slides.length - 1) this._index--;
      this._squelchSlotChange = true;
      slide.remove();
      this._emitDeckChange({
        action: 'delete',
        from: i,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _toggleSkip(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const on = !slide.hasAttribute('data-deck-skip');
      if (on) slide.setAttribute('data-deck-skip', '');else slide.removeAttribute('data-deck-skip');
      if (this._thumbs && this._thumbs[i]) {
        if (on) this._thumbs[i].thumb.setAttribute('data-skip', '');else this._thumbs[i].thumb.removeAttribute('data-skip');
      }
      this._markLastVisible();
      this._emitDeckChange({
        action: on ? 'skip' : 'unskip',
        from: i,
        slide
      });
      // Re-broadcast so the presenter popup's prev/next thumbnails re-pick
      // the nearest non-skipped slide without waiting for a nav event.
      try {
        window.postMessage({
          slideIndexChanged: this._index,
          deckTotal: this._slides.length,
          deckSkipped: this._skippedIndices()
        }, '*');
      } catch (e) {}
    }
    _skippedIndices() {
      const out = [];
      for (let i = 0; i < this._slides.length; i++) {
        if (this._slides[i].hasAttribute('data-deck-skip')) out.push(i);
      }
      return out;
    }
    _moveSlide(i, j) {
      if (j < 0 || j >= this._slides.length || j === i) return;
      const slide = this._slides[i];
      const ref = j < i ? this._slides[j] : this._slides[j].nextSibling;
      // Track the active slide across the reorder so the same content
      // stays on screen.
      const cur = this._index;
      if (cur === i) this._index = j;else if (i < cur && j >= cur) this._index = cur - 1;else if (i > cur && j <= cur) this._index = cur + 1;
      this._squelchSlotChange = true;
      this.insertBefore(slide, ref);
      this._emitDeckChange({
        action: 'move',
        from: i,
        to: j,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'mutation'
      });
    }

    // Public API ------------------------------------------------------------

    /** Current slide index (0-based). */
    get index() {
      return this._index;
    }
    /** Total slide count. */
    get length() {
      return this._slides.length;
    }
    /** Programmatically navigate. */
    goTo(i) {
      this._go(i, 'api');
    }
    next() {
      this._advance(1, 'api');
    }
    prev() {
      this._advance(-1, 'api');
    }
    reset() {
      this._go(0, 'api');
    }
  }
  if (!customElements.get('deck-stage')) {
    customElements.define('deck-stage', DeckStage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/deck-stage.js", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/ClientDetail.jsx
try { (() => {
// =========================================================
// V4 BI — Client detail (drill-in view per cliente)
// Tabs: Resumo · Dossiê · Reuniões · Pesquisa
// =========================================================
const ClientDetail = ({
  client,
  onBack
}) => {
  const c = client;
  const squad = V4Data.squads.find(s => s.id === c.squad);
  const [tab, setTab] = React.useState("resumo");

  // Re-render on store changes so the tab counts stay live
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const meetingsCount = V4Store.getMeetings(c.id).length;
  const dossieCount = V4Store.getDossie(c.id).improvementsUs.length + V4Store.getDossie(c.id).improvementsProject.length;
  const tabs = [{
    id: "resumo",
    label: "Resumo",
    icon: "grid"
  }, {
    id: "dossie",
    label: "Dossiê",
    icon: "flag",
    badge: dossieCount
  }, {
    id: "reunioes",
    label: "Reuniões",
    icon: "calendar",
    badge: meetingsCount
  }, {
    id: "pesquisa",
    label: "Pesquisa mensal",
    icon: "target"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "page",
    "data-screen-label": "Cliente " + c.name
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-head",
    style: {
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "crumb",
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn ghost sm",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 14,
    style: {
      transform: "rotate(180deg)"
    }
  }), "Carteira"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 12
  }), /*#__PURE__*/React.createElement("span", {
    className: "here"
  }, c.name)), /*#__PURE__*/React.createElement("h1", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    size: 40
  }), c.name, /*#__PURE__*/React.createElement(StatusBadge, {
    status: c.status,
    score: c.health
  })), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, c.segment, " \xB7 ", c.months, " meses \xB7 squad ", squad?.name, " \xB7 lead ", squad?.lead)), /*#__PURE__*/React.createElement("div", {
    className: "page-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 14
  }), "Agendar reuni\xE3o"), /*#__PURE__*/React.createElement("button", {
    className: "btn secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "flag",
    size: 14
  }), "Marcar prioridade"), /*#__PURE__*/React.createElement("button", {
    className: "btn primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 14
  }), "Plano de a\xE7\xE3o"))), /*#__PURE__*/React.createElement("div", {
    className: "tab-strip"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: "tab" + (tab === t.id ? " active" : ""),
    onClick: () => setTab(t.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: t.icon,
    size: 14
  }), t.label, t.badge != null && t.badge > 0 && /*#__PURE__*/React.createElement("span", {
    className: "tab-badge"
  }, t.badge)))), tab === "resumo" && /*#__PURE__*/React.createElement(ClientResumo, {
    client: c,
    squad: squad
  }), tab === "dossie" && /*#__PURE__*/React.createElement(ClientDossie, {
    client: c
  }), tab === "reunioes" && /*#__PURE__*/React.createElement(ClientMeetings, {
    client: c
  }), tab === "pesquisa" && /*#__PURE__*/React.createElement(ClientPesquisa, {
    client: c
  }));
};

// ---- RESUMO TAB ----
const ClientResumo = ({
  client,
  squad
}) => {
  const c = client;
  const trend = [{
    m: "jan",
    v: c.fee * 0.9,
    i: c.invest * 0.7,
    r: c.roas - 1.2
  }, {
    m: "fev",
    v: c.fee * 0.92,
    i: c.invest * 0.75,
    r: c.roas - 0.9
  }, {
    m: "mar",
    v: c.fee * 0.95,
    i: c.invest * 0.82,
    r: c.roas - 0.5
  }, {
    m: "abr",
    v: c.fee * 0.98,
    i: c.invest * 0.9,
    r: c.roas - 0.2
  }, {
    m: "mai",
    v: c.fee,
    i: c.invest,
    r: c.roas
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPITile, {
    kpi: {
      label: "Fee mensal",
      v: c.fee,
      prev: c.fee * 0.95,
      fmt: "BRL"
    }
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: {
      label: "Investimento",
      v: c.invest,
      prev: c.invest * 0.9,
      fmt: "BRL"
    }
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: {
      label: "ROAS",
      v: c.roas,
      prev: c.roas - 0.3,
      fmt: "x"
    }
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: {
      label: "LTV acumulado",
      v: c.ltv,
      prev: c.ltv * 0.92,
      fmt: "BRLk"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid-2-1"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Performance \xB7 \xFAltimos 5 meses"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 12
    }
  }, "Fee \xB7 evolu\xE7\xE3o"), /*#__PURE__*/React.createElement(Sparkline, {
    data: trend.map(t => t.v),
    width: 280,
    height: 56,
    color: "var(--v4-green)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-3)",
      marginTop: 4
    }
  }, trend.map(t => /*#__PURE__*/React.createElement("span", {
    key: t.m,
    style: {
      display: "inline-block",
      width: 56,
      textAlign: "center"
    }
  }, t.m)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 12
    }
  }, "ROAS \xB7 evolu\xE7\xE3o"), /*#__PURE__*/React.createElement(Sparkline, {
    data: trend.map(t => t.r),
    width: 280,
    height: 56,
    color: c.roas < 2 ? "var(--v4-red-500)" : "var(--v4-yellow)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-3)",
      marginTop: 4
    }
  }, trend.map(t => /*#__PURE__*/React.createElement("span", {
    key: t.m,
    style: {
      display: "inline-block",
      width: 56,
      textAlign: "center"
    }
  }, t.r.toFixed(1).replace(".", ","), "\xD7")))))), /*#__PURE__*/React.createElement(Card, {
    title: "Squad atribu\xEDdo",
    subtitle: squad?.name + " · " + squad?.lead
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(HealthRing, {
    score: c.health,
    size: 88,
    stroke: 8
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Health score"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-body)",
      color: "var(--fg-2)"
    }
  }, c.health >= 70 ? "Cliente saudável. Manter cadência atual." : c.health >= 50 ? "Atenção. Revisar pilar de Engajamento." : "Crítico. Plano de retenção imediato."))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      paddingTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(SquadMember, {
    role: "Gestor de tr\xE1fego",
    name: squad?.lead || "—"
  }), /*#__PURE__*/React.createElement(SquadMember, {
    role: "CS / sucesso",
    name: "J\xFAlia Marques"
  }), /*#__PURE__*/React.createElement(SquadMember, {
    role: "Copy",
    name: "Felipe Tonin"
  }), /*#__PURE__*/React.createElement(SquadMember, {
    role: "Design",
    name: "Ana Cordeiro"
  })))));
};
const SquadMember = ({
  role,
  name
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    alignItems: "center",
    gap: 10
  }
}, /*#__PURE__*/React.createElement(Avatar, {
  name: name,
  size: 26
}), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: {
    font: "var(--t-body-strong)"
  }
}, name), /*#__PURE__*/React.createElement("div", {
  style: {
    font: "var(--t-caption)",
    color: "var(--fg-3)"
  }
}, role)));

// ---- PESQUISA MENSAL TAB ----
const ClientPesquisa = ({
  client
}) => {
  const survey = V4Health.SURVEYS[client.id] || {};
  const dims = V4Health.DIMENSIONS;
  const score = V4Health.composite(survey);

  // group by pillar
  const byPillar = {};
  dims.forEach(d => {
    (byPillar[d.pillar] = byPillar[d.pillar] || []).push(d);
  });
  const pillarColors = {
    "Aquisição": "var(--viz-1)",
    "Engajamento": "var(--viz-2)",
    "Monetização": "var(--viz-3)",
    "Retenção": "var(--viz-4)"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid-2-1"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Pesquisa mensal \xB7 maio 2026",
    subtitle: "12 dimens\xF5es alimentam o health score deste cliente"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, Object.entries(byPillar).map(([pillar, list]) => /*#__PURE__*/React.createElement("div", {
    key: pillar
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: 2,
      background: pillarColors[pillar]
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, pillar)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, list.map(d => {
    const raw = survey[d.id];
    const s = V4Health.scoreOne(d.kind, raw);
    const pct = s == null ? 0 : s / 10 * 100;
    return /*#__PURE__*/React.createElement("div", {
      key: d.id,
      className: "pesquisa-row"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pesquisa-row-top"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pesquisa-label",
      title: d.help
    }, d.label), /*#__PURE__*/React.createElement("span", {
      className: "pesquisa-value"
    }, V4Health.displayValue(d.kind, raw))), /*#__PURE__*/React.createElement("div", {
      className: "pesquisa-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pesquisa-bar-fill",
      style: {
        width: pct + "%",
        background: pct >= 70 ? "var(--v4-green)" : pct >= 50 ? "var(--v4-yellow)" : "var(--v4-red-500)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "pesquisa-row-foot"
    }, /*#__PURE__*/React.createElement("span", null, "Peso ", d.weight, "%"), /*#__PURE__*/React.createElement("span", null, s == null ? "—" : s.toFixed(1).replace(".", ",") + " / 10")));
  })))))), /*#__PURE__*/React.createElement(Card, {
    title: "Health composto"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
      padding: "12px 0"
    }
  }, /*#__PURE__*/React.createElement(HealthRing, {
    score: score,
    size: 160,
    stroke: 14
  }), /*#__PURE__*/React.createElement(StatusBadge, {
    status: V4Health.flag(score),
    score: score
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--t-body-sm)",
      color: "var(--fg-2)",
      textAlign: "center",
      maxWidth: 260
    }
  }, score >= 70 ? "Saudável. Manter cadência atual e replicar o que está funcionando." : score >= 50 ? "Em risco. Identifique 2-3 dimensões mais baixas e ataque esta semana." : "Crítico. Reunião de retenção imediata. Use o dossiê para plano de ação.")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      paddingTop: 14,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 8
    }
  }, "Regra do score"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 18,
      font: "var(--t-body-sm)",
      color: "var(--fg-2)",
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--v4-green)"
    }
  }, "\u2265 70"), " \xB7 Saud\xE1vel"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--v4-yellow)"
    }
  }, "50 \u2013 69"), " \xB7 Em risco"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--v4-red-500)"
    }
  }, "< 50"), " \xB7 Cr\xEDtico")))));
};
window.ClientDetail = ClientDetail;
Object.assign(__ds_scope, { ClientDetail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/ClientDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/ClientDossie.jsx
try { (() => {
// =========================================================
// V4 BI — Dossiê do cliente (editable, realtime)
// =========================================================
const ClientDossie = ({
  client
}) => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const d = V4Store.getDossie(client.id);
  const revisions = V4Store.getRevisions(client.id, 8);
  return /*#__PURE__*/React.createElement("div", {
    className: "grid-2-1"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(DossieColumn, {
    client: client,
    kind: "improvementsUs",
    title: "Pontos de melhoria \u2014 nosso lado",
    subtitle: "O que a V4 precisa entregar para destravar este cliente",
    icon: "sparkles",
    accent: "var(--v4-red-500)",
    items: d.improvementsUs
  }), /*#__PURE__*/React.createElement(DossieColumn, {
    client: client,
    kind: "improvementsProject",
    title: "Pontos de melhoria \u2014 lado do projeto",
    subtitle: "O que depende do cliente para o resultado melhorar",
    icon: "target",
    accent: "var(--v4-yellow)",
    items: d.improvementsProject
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Atividade",
    subtitle: "Hist\xF3rico de altera\xE7\xF5es deste cliente",
    padded: false
  }, revisions.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      color: "var(--fg-4)",
      font: "var(--t-body-sm)"
    }
  }, "Nada registrado ainda.") : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 0"
    }
  }, revisions.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      padding: "10px 20px",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-body-sm)",
      color: "var(--fg)"
    }
  }, r.summary), /*#__PURE__*/React.createElement(Stamp, {
    by: r.by,
    at: r.at,
    action: r.action.startsWith("dossie") ? "no dossiê" : r.action.startsWith("meeting") ? "em reunião" : "atualizou"
  }))))));
};
const DossieColumn = ({
  client,
  kind,
  title,
  subtitle,
  icon,
  accent,
  items
}) => {
  const [draft, setDraft] = React.useState("");
  const ta = React.useRef(null);
  const add = () => {
    if (!draft.trim()) return;
    V4Store.addImprovement(client.id, kind, draft);
    setDraft("");
    ta.current?.focus();
  };
  return /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement("header", {
    className: "v4-card-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      background: "rgba(255,255,255,0.04)",
      color: accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "v4-card-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "v4-card-sub"
  }, subtitle))), /*#__PURE__*/React.createElement("span", {
    className: "dossie-count"
  }, items.length)), /*#__PURE__*/React.createElement("div", {
    className: "dossie-list"
  }, items.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "24px 20px",
      color: "var(--fg-4)",
      font: "var(--t-body-sm)"
    }
  }, "Nenhum ponto registrado ainda. Adicione abaixo."), items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    className: "dossie-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dossie-bullet",
    style: {
      background: accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-body)",
      color: "var(--fg)"
    }
  }, it.text), /*#__PURE__*/React.createElement(Stamp, {
    by: it.by,
    at: it.at,
    action: "adicionou"
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost sm icon-only",
    "aria-label": "Remover",
    onClick: () => V4Store.removeImprovement(client.id, kind, it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "dossie-compose"
  }, /*#__PURE__*/React.createElement("textarea", {
    ref: ta,
    value: draft,
    rows: 2,
    placeholder: kind === "improvementsUs" ? "Ex.: revisar criativos da campanha Black Friday até sexta." : "Ex.: cliente sem aprovador para os briefings; bloqueio na operação.",
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "dossie-compose-foot"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-4)"
    }
  }, V4Store.identity ? `você: ${V4Store.identity.name}` : "sessão anônima"), /*#__PURE__*/React.createElement("button", {
    className: "btn primary sm",
    onClick: add,
    disabled: !draft.trim()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12,
    stroke: 2.5
  }), "Adicionar"))));
};
window.ClientDossie = ClientDossie;
Object.assign(__ds_scope, { ClientDossie });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/ClientDossie.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/ClientMeetings.jsx
try { (() => {
// =========================================================
// V4 BI — Reuniões do cliente (registro + dores + sync)
// =========================================================
const ClientMeetings = ({
  client
}) => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const meetings = V4Store.getMeetings(client.id);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    padded: false,
    title: "Reuni\xF5es registradas",
    subtitle: "Resumos enviados pelos squads \u2014 todo o time v\xEA em tempo real",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn primary sm",
      onClick: () => setComposeOpen(true)
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 12,
      stroke: 2.5
    }), "Nova reuni\xE3o")
  }, meetings.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "32px 24px",
      color: "var(--fg-4)",
      font: "var(--t-body)"
    }
  }, "Nenhuma reuni\xE3o registrada para este cliente ainda. Use o bot\xE3o acima."), /*#__PURE__*/React.createElement("div", {
    className: "meetings-list"
  }, meetings.map(m => /*#__PURE__*/React.createElement(MeetingCard, {
    key: m.id,
    m: m,
    clientId: client.id
  })))), composeOpen && /*#__PURE__*/React.createElement(MeetingCompose, {
    client: client,
    onClose: () => setComposeOpen(false)
  }));
};
const typeColor = t => {
  if (/crise/i.test(t)) return "var(--v4-red-500)";
  if (/onboard/i.test(t)) return "#3a9cff";
  if (/review/i.test(t)) return "var(--v4-yellow)";
  return "var(--v4-green)";
};
const MeetingCard = ({
  m,
  clientId
}) => /*#__PURE__*/React.createElement("div", {
  className: "meeting-card"
}, /*#__PURE__*/React.createElement("div", {
  className: "meeting-head"
}, /*#__PURE__*/React.createElement("div", {
  className: "meeting-date"
}, /*#__PURE__*/React.createElement("div", {
  className: "d"
}, m.date), /*#__PURE__*/React.createElement("div", {
  className: "t"
}, m.time)), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "meeting-type",
  style: {
    color: typeColor(m.type)
  }
}, /*#__PURE__*/React.createElement("span", {
  className: "dot",
  style: {
    background: typeColor(m.type)
  }
}), m.type), /*#__PURE__*/React.createElement("div", {
  className: "meeting-title"
}, m.title), m.attendees && /*#__PURE__*/React.createElement("div", {
  className: "meeting-attendees"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "users",
  size: 12
}), " ", m.attendees)), /*#__PURE__*/React.createElement("button", {
  className: "btn ghost sm icon-only",
  "aria-label": "Remover",
  onClick: () => {
    if (confirm("Remover esta reunião?")) V4Store.removeMeeting(clientId, m.id);
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "x",
  size: 14
}))), m.summary && /*#__PURE__*/React.createElement("div", {
  className: "meeting-section"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow"
}, "Resumo"), /*#__PURE__*/React.createElement("div", {
  className: "meeting-body"
}, m.summary)), m.pains?.length > 0 && /*#__PURE__*/React.createElement("div", {
  className: "meeting-section"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    color: "var(--v4-red-500)"
  }
}, "Principais dores citadas"), /*#__PURE__*/React.createElement("ul", {
  className: "pain-list"
}, m.pains.map((p, i) => /*#__PURE__*/React.createElement("li", {
  key: i
}, /*#__PURE__*/React.createElement(Icon, {
  name: "alert",
  size: 12
}), /*#__PURE__*/React.createElement("span", null, p))))), /*#__PURE__*/React.createElement("div", {
  className: "meeting-foot"
}, /*#__PURE__*/React.createElement(Stamp, {
  by: m.by,
  at: m.at,
  action: "registrou esta reuni\xE3o"
})));
const MeetingCompose = ({
  client,
  onClose
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  const [form, setForm] = React.useState({
    date: today,
    time: now,
    type: "Weekly",
    title: "",
    attendees: "",
    summary: "",
    pains: ["", "", ""]
  });
  const setF = (k, v) => setForm(s => ({
    ...s,
    [k]: v
  }));
  const setPain = (i, v) => setForm(s => {
    const next = [...s.pains];
    next[i] = v;
    return {
      ...s,
      pains: next
    };
  });
  const submit = () => {
    if (!form.title.trim()) return;
    V4Store.addMeeting(client.id, form);
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-card",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("header", {
    className: "modal-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, client.name), /*#__PURE__*/React.createElement("h3", {
    className: "v4-card-title",
    style: {
      marginTop: 4
    }
  }, "Registrar reuni\xE3o")), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost sm icon-only",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-row"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Data"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.date,
    onChange: e => setF("date", e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Hora"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.time,
    onChange: e => setF("time", e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Tipo"
  }, /*#__PURE__*/React.createElement("select", {
    value: form.type,
    onChange: e => setF("type", e.target.value)
  }, /*#__PURE__*/React.createElement("option", null, "Weekly"), /*#__PURE__*/React.createElement("option", null, "Review"), /*#__PURE__*/React.createElement("option", null, "Onboarding"), /*#__PURE__*/React.createElement("option", null, "Reuni\xE3o de crise"), /*#__PURE__*/React.createElement("option", null, "Apresenta\xE7\xE3o de resultados")))), /*#__PURE__*/React.createElement(Field, {
    label: "T\xEDtulo da reuni\xE3o"
  }, /*#__PURE__*/React.createElement("input", {
    value: form.title,
    autoFocus: true,
    placeholder: "Ex.: Alinhamento mensal \xB7 maio",
    onChange: e => setF("title", e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Participantes"
  }, /*#__PURE__*/React.createElement("input", {
    value: form.attendees,
    placeholder: "Marina Lopes (V4) \xB7 Diego Prado (V4) \xB7 Jo\xE3o Silva (cliente)",
    onChange: e => setF("attendees", e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Resumo da reuni\xE3o"
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: form.summary,
    placeholder: "O que foi decidido, pr\xF3ximos passos, prazos\u2026",
    onChange: e => setF("summary", e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Principais dores citadas pelo cliente"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pain-input-list"
  }, form.pains.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "pain-input"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 12,
    style: {
      color: "var(--v4-red-500)",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("input", {
    value: p,
    placeholder: `Dor ${i + 1}…`,
    onChange: e => setPain(i, e.target.value)
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost sm",
    type: "button",
    onClick: () => setForm(s => ({
      ...s,
      pains: [...s.pains, ""]
    }))
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12,
    stroke: 2.5
  }), "+ uma dor")))), /*#__PURE__*/React.createElement("footer", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-4)"
    }
  }, "Ser\xE1 registrado como ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--fg-2)"
    }
  }, V4Store.identity?.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn secondary",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "btn primary",
    onClick: submit,
    disabled: !form.title.trim()
  }, "Salvar reuni\xE3o")))));
};
const Field = ({
  label,
  children
}) => /*#__PURE__*/React.createElement("label", {
  className: "field-row"
}, /*#__PURE__*/React.createElement("span", {
  className: "field-label"
}, label), children);
window.ClientMeetings = ClientMeetings;
Object.assign(__ds_scope, { ClientMeetings });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/ClientMeetings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/ClientTable.jsx
try { (() => {
// =========================================================
// V4 BI — Client table (used in Overview + Clients pages)
// =========================================================
const ClientTable = ({
  onOpen,
  fullPage = false
}) => {
  const [filter, setFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState("health");
  const [sortDir, setSortDir] = React.useState("asc");
  const filters = [{
    id: "all",
    label: "Todos"
  }, {
    id: "healthy",
    label: "Saudáveis"
  }, {
    id: "warning",
    label: "Em risco"
  }, {
    id: "critical",
    label: "Críticos"
  }];
  const filtered = React.useMemo(() => {
    let rows = V4Data.clients;
    if (filter !== "all") rows = rows.filter(c => c.status === filter);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey],
        bv = b[sortKey];
      const n = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? n : -n;
    });
    return rows;
  }, [filter, sortKey, sortDir]);
  const squadColor = id => ({
    aurora: "#e50914",
    volta: "#52cc5a",
    norte: "#ffc02a",
    delta: "#7a4ad8",
    matriz: "#3a9cff"
  })[id] || "#888";
  const sortBy = k => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");else {
      setSortKey(k);
      setSortDir("desc");
    }
  };
  return /*#__PURE__*/React.createElement(Card, {
    title: "Carteira de clientes",
    subtitle: `${filtered.length} de ${V4Data.clients.length} clientes`,
    padded: false,
    action: /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 6,
        alignItems: "center"
      }
    }, filters.map(f => /*#__PURE__*/React.createElement("button", {
      key: f.id,
      className: "chip" + (filter === f.id ? " active" : ""),
      onClick: () => setFilter(f.id)
    }, f.label)))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: "auto",
      maxHeight: fullPage ? "none" : 520
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "client-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: "26%"
    }
  }, "Cliente"), /*#__PURE__*/React.createElement("th", null, "Squad"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    },
    onClick: () => sortBy("fee"),
    role: "button"
  }, "Fee"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    },
    onClick: () => sortBy("invest"),
    role: "button"
  }, "Invest."), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    },
    onClick: () => sortBy("roas"),
    role: "button"
  }, "ROAS"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    },
    onClick: () => sortBy("ltv"),
    role: "button"
  }, "LTV"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    },
    onClick: () => sortBy("health"),
    role: "button"
  }, "Health \u2191"))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(c => /*#__PURE__*/React.createElement("tr", {
    key: c.id,
    className: c.status === "critical" ? "alert" : "",
    onClick: () => onOpen?.(c)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "name-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "s"
  }, c.segment, " \xB7 ", c.months, " meses")))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "squad-tag"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: squadColor(c.squad)
    }
  }), c.squad)), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right"
    },
    className: "num"
  }, V4Data.fmtBRL(c.fee)), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right"
    },
    className: "num"
  }, V4Data.fmtBRL(c.invest)), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right"
    },
    className: "num " + (c.roas < 2 ? "bad" : "")
  }, c.roas.toFixed(1).replace(".", ","), "\xD7"), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right"
    },
    className: "num"
  }, V4Data.fmtBRLk(c.ltv)), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: c.status,
    score: c.health
  }))))))));
};
window.ClientTable = ClientTable;
Object.assign(__ds_scope, { ClientTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/ClientTable.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/Identity.jsx
try { (() => {
// =========================================================
// V4 BI — Identity gate + Presence avatars
// =========================================================
const IdentityGate = ({
  onReady
}) => {
  const [identity, setIdentity] = React.useState(V4Store.identity);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (identity) onReady?.(identity);
  }, [identity]);
  if (identity) return null;
  const valid = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const submit = e => {
    e?.preventDefault();
    setTouched(true);
    if (!valid) return;
    V4Store.setIdentity(name, email);
    setIdentity(V4Store.identity);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "identity-overlay",
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "identity-card"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/v4-simbolo.webp",
    alt: "",
    className: "identity-logo"
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginTop: 18
    }
  }, "Unidade Oliveira & Co"), /*#__PURE__*/React.createElement("h2", {
    className: "identity-title"
  }, "Quem est\xE1 entrando?"), /*#__PURE__*/React.createElement("p", {
    className: "identity-sub"
  }, "O BI \xE9 colaborativo. Toda altera\xE7\xE3o no ", /*#__PURE__*/React.createElement("b", null, "dossi\xEA"), " ou ", /*#__PURE__*/React.createElement("b", null, "reuni\xE3o"), " fica registrada com seu nome e e-mail \u2014 e aparece em tempo real para o resto do time."), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("label", {
    className: "identity-field"
  }, /*#__PURE__*/React.createElement("span", null, "Nome completo"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    type: "text",
    value: name,
    placeholder: "Ex.: Marina Lopes",
    onChange: e => setName(e.target.value)
  })), /*#__PURE__*/React.createElement("label", {
    className: "identity-field"
  }, /*#__PURE__*/React.createElement("span", null, "E-mail V4"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    placeholder: "marina@v4oliveira.com.br",
    onChange: e => setEmail(e.target.value)
  })), touched && !valid && /*#__PURE__*/React.createElement("div", {
    className: "identity-error"
  }, "Preencha um nome e um e-mail v\xE1lido."), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn primary",
    style: {
      width: "100%",
      height: 44,
      marginTop: 10
    },
    disabled: !valid
  }, "Entrar na unidade")), /*#__PURE__*/React.createElement("div", {
    className: "identity-foot"
  }, "Ao continuar voc\xEA confirma que tem acesso aos dados desta unidade.")));
};

// ---- Presence avatars (top bar) ----
const PresenceStrip = () => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const users = V4Store.onlineUsers();
  if (!users.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "presence"
  }, /*#__PURE__*/React.createElement("div", {
    className: "presence-dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "presence-count"
  }, users.length, " online"), /*#__PURE__*/React.createElement("div", {
    className: "presence-avatars"
  }, users.slice(0, 5).map((u, i) => /*#__PURE__*/React.createElement("div", {
    key: u.sessionId,
    className: "presence-av",
    title: u.name + " · " + u.email,
    style: {
      background: ["#e50914", "#1f6f4a", "#2b3450", "#7a4a1f", "#5a3066"][i % 5]
    }
  }, u.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase())), users.length > 5 && /*#__PURE__*/React.createElement("div", {
    className: "presence-av more"
  }, "+", users.length - 5)));
};

// ---- "by Xxx · há Yh" stamp ----
const Stamp = ({
  by,
  at,
  action = "registrou"
}) => {
  const ago = (() => {
    const ms = Date.now() - new Date(at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `há ${days}d`;
  })();
  return /*#__PURE__*/React.createElement("div", {
    className: "stamp"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stamp-by"
  }, by), /*#__PURE__*/React.createElement("span", {
    className: "stamp-sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: "stamp-action"
  }, action), /*#__PURE__*/React.createElement("span", {
    className: "stamp-sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: "stamp-ago"
  }, ago));
};
window.IdentityGate = IdentityGate;
window.PresenceStrip = PresenceStrip;
window.Stamp = Stamp;
function Identity(props) {
  return React.createElement(IdentityGate, props);
}
Object.assign(__ds_scope, { Identity });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/Identity.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/Overview.jsx
try { (() => {
// =========================================================
// V4 BI — Overview page (route: /)
// =========================================================
const Overview = ({
  onOpenClient
}) => {
  const D = V4Data;
  const trendValues = D.trend.map(t => t.v);
  return /*#__PURE__*/React.createElement("div", {
    className: "page",
    "data-screen-label": "Vis\xE3o geral"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Boa tarde, equipe Oliveira."), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Dia 27 de maio \xB7 4 dias \xFAteis at\xE9 o fechamento do m\xEAs. ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--v4-red-500)"
    }
  }, "3 clientes em risco."))), /*#__PURE__*/React.createElement("div", {
    className: "page-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 14
  }), "Exportar"), /*#__PURE__*/React.createElement("button", {
    className: "btn secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "filter",
    size: 14
  }), "Filtros"))), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row"
  }, /*#__PURE__*/React.createElement(KPITile, {
    big: true,
    accent: true,
    kpi: D.unit.kpis.faturamento,
    sparkData: trendValues
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.fee,
    sparkData: trendValues.slice(-7)
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.invest,
    sparkData: [800, 900, 950, 1020, 1080, 1120, 1240].map(v => v * 1000)
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.roasMedio,
    sparkData: [3.8, 4.0, 4.1, 4.3, 4.5, 4.5, 4.8]
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.healthMedia
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.clientesAtivos
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.ltv
  }), /*#__PURE__*/React.createElement(KPITile, {
    kpi: D.unit.kpis.churn
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid-2-1"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Faturamento gerado para clientes",
    subtitle: "Soma do faturamento informado pelos clientes \xB7 12 meses",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "moreH",
      size: 16
    }))
  }, /*#__PURE__*/React.createElement(BarChart, {
    data: D.trend
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Health score \xB7 distribui\xE7\xE3o",
    subtitle: "42 clientes ativos"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(HealthRing, {
    score: 78,
    size: 120,
    stroke: 10
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(HealthBucket, {
    label: "Saud\xE1veis \u2265 70",
    count: 28,
    pct: 67,
    color: "var(--v4-green)"
  }), /*#__PURE__*/React.createElement(HealthBucket, {
    label: "Em risco 50\u201369",
    count: 11,
    pct: 26,
    color: "var(--v4-yellow)"
  }), /*#__PURE__*/React.createElement(HealthBucket, {
    label: "Cr\xEDticos < 50",
    count: 3,
    pct: 7,
    color: "var(--v4-red-500)"
  }))))), /*#__PURE__*/React.createElement(Card, {
    title: "Pipeline da unidade",
    subtitle: "Novos clientes em prospec\xE7\xE3o",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm"
    }, "Ver pipeline \u2192")
  }, /*#__PURE__*/React.createElement("div", {
    className: "pipe"
  }, D.pipeline.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.stage,
    className: "pipe-stage" + (i === D.pipeline.length - 1 ? " last" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "stg"
  }, s.stage), /*#__PURE__*/React.createElement("div", {
    className: "ct"
  }, s.count), /*#__PURE__*/React.createElement("div", {
    className: "vl"
  }, D.fmtBRLk(s.value)))))), /*#__PURE__*/React.createElement(SquadPerformance, null), /*#__PURE__*/React.createElement("div", {
    className: "grid-2-1"
  }, /*#__PURE__*/React.createElement(ClientTable, {
    onOpen: onOpenClient
  }), /*#__PURE__*/React.createElement(Card, {
    title: "M\xE9todo V4 \xB7 distribui\xE7\xE3o da carteira",
    subtitle: "Por pilar de atua\xE7\xE3o principal"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 20,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Donut, {
    data: D.metodo,
    size: 140,
    stroke: 20
  }), /*#__PURE__*/React.createElement("div", {
    className: "legend-list",
    style: {
      flex: 1
    }
  }, D.metodo.map(p => /*#__PURE__*/React.createElement("div", {
    className: "legend-row",
    key: p.pillar
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: p.color
    }
  }), /*#__PURE__*/React.createElement("span", null, p.pillar), /*#__PURE__*/React.createElement("span", {
    className: "pct"
  }, p.share, "%"), /*#__PURE__*/React.createElement("span", {
    className: "ct"
  }, p.clients))))))), /*#__PURE__*/React.createElement("div", {
    className: "grid-1-1"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Alertas",
    subtitle: "Itens que pedem aten\xE7\xE3o agora",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, "5 itens"),
    padded: false
  }, /*#__PURE__*/React.createElement("div", {
    className: "alerts"
  }, /*#__PURE__*/React.createElement(AlertRow, {
    kind: "crit",
    title: "Fazenda Zumbi \xB7 ROAS abaixo de 2\xD7 h\xE1 14 dias",
    meta: "Squad Volta \xB7 fee R$ 9.800 em risco",
    time: "h\xE1 2 h"
  }), /*#__PURE__*/React.createElement(AlertRow, {
    kind: "crit",
    title: "Doce Atelier \xB7 health caiu 22 pontos",
    meta: "Squad Norte \xB7 onboarding incompleto",
    time: "h\xE1 6 h"
  }), /*#__PURE__*/React.createElement(AlertRow, {
    kind: "warn",
    title: "RedFit \xB7 meta de leads 38% atingida",
    meta: "Squad Norte \xB7 falta 8 dias \xFAteis",
    time: "ontem"
  }), /*#__PURE__*/React.createElement(AlertRow, {
    kind: "warn",
    title: "3 propostas paradas h\xE1 mais de 7 dias",
    meta: "Pipeline \xB7 est\xE1gio Negocia\xE7\xE3o",
    time: "ontem"
  }), /*#__PURE__*/React.createElement(AlertRow, {
    kind: "warn",
    title: "Squad Aurora a 92% de capacidade",
    meta: "Reduzir carga ou contratar",
    time: "2 dias"
  }))), /*#__PURE__*/React.createElement(Card, {
    title: "Esta semana",
    subtitle: "Reuni\xF5es agendadas",
    padded: false,
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, "Abrir agenda \u2192")
  }, /*#__PURE__*/React.createElement("div", {
    className: "agenda"
  }, V4Data.meetings.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "agenda-row" + (m.alert ? " crise" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "when"
  }, /*#__PURE__*/React.createElement("span", {
    className: "d"
  }, m.day), /*#__PURE__*/React.createElement("span", null, m.time)), /*#__PURE__*/React.createElement("div", {
    className: "what"
  }, /*#__PURE__*/React.createElement("div", {
    className: "c"
  }, m.client), /*#__PURE__*/React.createElement("div", {
    className: "t"
  }, m.type, " \xB7 squad ", m.squad)), /*#__PURE__*/React.createElement("button", {
    className: "btn ghost sm"
  }, "Abrir")))))));
};
const HealthBucket = ({
  label,
  count,
  pct,
  color
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    gap: 5
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "space-between",
    font: "var(--t-body-sm)",
    color: "var(--fg-2)"
  }
}, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
  style: {
    font: "var(--t-mono-sm)",
    color: "var(--fg-3)"
  }
}, /*#__PURE__*/React.createElement("b", {
  style: {
    color: "var(--fg)"
  }
}, count), " \xB7 ", pct, "%")), /*#__PURE__*/React.createElement("div", {
  style: {
    height: 6,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    overflow: "hidden"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: pct + "%",
    height: "100%",
    background: color,
    borderRadius: 999
  }
})));
const AlertRow = ({
  kind,
  title,
  meta,
  time
}) => /*#__PURE__*/React.createElement("div", {
  className: "alert-row" + (kind === "warn" ? " warn" : "")
}, /*#__PURE__*/React.createElement("div", {
  className: "alert-icon"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "alert",
  size: 16
})), /*#__PURE__*/React.createElement("div", {
  className: "alert-body"
}, /*#__PURE__*/React.createElement("div", {
  className: "title"
}, title), /*#__PURE__*/React.createElement("div", {
  className: "meta"
}, meta)), /*#__PURE__*/React.createElement("div", {
  className: "alert-time"
}, time));
window.Overview = Overview;
Object.assign(__ds_scope, { Overview });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/Overview.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/Sidebar.jsx
try { (() => {
// =========================================================
// V4 BI — Layout: Sidebar
// =========================================================
const Sidebar = ({
  current,
  onNavigate,
  counts = {}
}) => {
  const items = [{
    id: "overview",
    label: "Visão geral",
    icon: "grid"
  }, {
    id: "clients",
    label: "Clientes",
    icon: "briefcase",
    count: counts.clients ?? 42
  }, {
    id: "squads",
    label: "Squads",
    icon: "users",
    count: counts.squads ?? 5
  }, {
    id: "campaigns",
    label: "Campanhas",
    icon: "chart"
  }, {
    id: "pipeline",
    label: "Pipeline",
    icon: "funnel"
  }, {
    id: "financeiro",
    label: "Financeiro",
    icon: "money"
  }, {
    id: "agenda",
    label: "Agenda",
    icon: "calendar",
    count: counts.agenda ?? 7
  }];
  const secondary = [{
    id: "settings",
    label: "Configurações",
    icon: "settings"
  }];
  return /*#__PURE__*/React.createElement("aside", {
    className: "sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/v4-simbolo.webp",
    alt: "V4"
  }), /*#__PURE__*/React.createElement("div", {
    className: "brand-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "Oliveira & Co"), /*#__PURE__*/React.createElement("div", {
    className: "unit"
  }, "Unidade \xB7 V4"))), /*#__PURE__*/React.createElement("div", {
    className: "nav-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav-label"
  }, "Opera\xE7\xE3o"), items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    className: "nav-item" + (current === it.id ? " active" : ""),
    onClick: () => onNavigate?.(it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 16
  }), it.label, it.count != null && /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, it.count)))), /*#__PURE__*/React.createElement("div", {
    className: "nav-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav-label"
  }, "Conta"), secondary.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    className: "nav-item",
    onClick: () => onNavigate?.(it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 16
  }), it.label))), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-foot"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Renato Oliveira",
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, "Renato O."), /*#__PURE__*/React.createElement("div", {
    className: "r"
  }, "Head da unidade"))));
};
window.Sidebar = Sidebar;
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/SquadPerformance.jsx
try { (() => {
// =========================================================
// V4 BI — Squad performance card (Overview)
// =========================================================
const SquadPerformance = () => {
  const squadStats = V4Data.squads.map(sq => {
    const clients = V4Data.clients.filter(c => c.squad === sq.id);
    const healthAvg = clients.length ? Math.round(clients.reduce((s, c) => s + c.health, 0) / clients.length) : 0;
    const feeTotal = clients.reduce((s, c) => s + c.fee, 0);
    const investTotal = clients.reduce((s, c) => s + c.invest, 0);
    const roasAvg = clients.length ? clients.reduce((s, c) => s + c.roas, 0) / clients.length : 0;
    const critical = clients.filter(c => c.status === "critical").length;
    return {
      sq,
      clients: clients.length,
      healthAvg,
      feeTotal,
      investTotal,
      roasAvg,
      critical
    };
  });
  const squadColor = id => ({
    aurora: "#e50914",
    volta: "#52cc5a",
    norte: "#ffc02a",
    delta: "#7a4ad8",
    matriz: "#3a9cff"
  })[id] || "#888";
  return /*#__PURE__*/React.createElement(Card, {
    padded: false,
    title: "Desempenho dos squads",
    subtitle: "Health m\xE9dio, fee gerido e clientes em crise por squad",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, "Ver detalhes \u2192")
  }, /*#__PURE__*/React.createElement("div", {
    className: "squad-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "squad-row head"
  }, /*#__PURE__*/React.createElement("span", null, "Squad"), /*#__PURE__*/React.createElement("span", null, "L\xEDder"), /*#__PURE__*/React.createElement("span", null, "Clientes"), /*#__PURE__*/React.createElement("span", null, "Carga"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Fee"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "ROAS"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "Health"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center"
    }
  }, "Cr\xEDtico")), squadStats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.sq.id,
    className: "squad-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "squad-name"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: squadColor(s.sq.id)
    }
  }), s.sq.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--t-body)"
    }
  }, s.sq.lead), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, s.clients), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("div", {
    className: "load-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "load-bar-fill",
    style: {
      width: s.sq.load + "%",
      background: s.sq.load >= 90 ? "var(--v4-red-500)" : s.sq.load >= 80 ? "var(--v4-yellow)" : "var(--v4-green)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-3)",
      marginTop: 4
    }
  }, s.sq.load, "%")), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      textAlign: "right"
    }
  }, V4Data.fmtBRLk(s.feeTotal)), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      textAlign: "right"
    }
  }, s.roasAvg.toFixed(1).replace(".", ","), "\xD7"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: s.healthAvg >= 70 ? "healthy" : s.healthAvg >= 50 ? "warning" : "critical",
    score: s.healthAvg
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "center"
    }
  }, s.critical > 0 ? /*#__PURE__*/React.createElement("span", {
    className: "badge c"
  }, /*#__PURE__*/React.createElement("i", null), s.critical) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-4)"
    }
  }, "\u2014"))))));
};
window.SquadPerformance = SquadPerformance;
Object.assign(__ds_scope, { SquadPerformance });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/SquadPerformance.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/Topbar.jsx
try { (() => {
// =========================================================
// V4 BI — Layout: Topbar
// =========================================================
const Topbar = ({
  crumbs = [],
  period = "Maio · 2026",
  onSearch,
  query = ""
}) => /*#__PURE__*/React.createElement("header", {
  className: "topbar"
}, /*#__PURE__*/React.createElement("nav", {
  className: "crumb"
}, crumbs.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
  key: i
}, i > 0 && /*#__PURE__*/React.createElement(Icon, {
  name: "chevron",
  size: 12
}), /*#__PURE__*/React.createElement("span", {
  className: i === crumbs.length - 1 ? "here" : ""
}, c)))), /*#__PURE__*/React.createElement("div", {
  className: "search"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "search",
  size: 16
}), /*#__PURE__*/React.createElement("input", {
  placeholder: "Buscar cliente, squad ou campanha\u2026",
  value: query,
  onChange: e => onSearch?.(e.target.value)
}), /*#__PURE__*/React.createElement("span", {
  className: "kbd"
}, "\u2318 K")), /*#__PURE__*/React.createElement("button", {
  className: "period-picker"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "calendar",
  size: 14
}), period, /*#__PURE__*/React.createElement(Icon, {
  name: "chevronDown",
  size: 14
})), /*#__PURE__*/React.createElement(PresenceStrip, null), /*#__PURE__*/React.createElement("button", {
  className: "icon-btn",
  "aria-label": "Notifica\xE7\xF5es"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "bell",
  size: 16
}), /*#__PURE__*/React.createElement("span", {
  className: "dot"
})), /*#__PURE__*/React.createElement("button", {
  className: "btn primary"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "plus",
  size: 14,
  stroke: 2.5
}), "Novo cliente"));
window.Topbar = Topbar;
Object.assign(__ds_scope, { Topbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// =========================================================
// V4 BI — Shared components (icons, cards, charts, badges)
// =========================================================
const {
  useState,
  useMemo,
  useEffect
} = React;

// ---- ICONS (inline SVG, currentColor, Lucide-style) ----
const Icon = ({
  name,
  size = 16,
  stroke = 2,
  ...rest
}) => {
  const paths = {
    grid: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "9",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "5",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "12",
      width: "7",
      height: "9",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "16",
      width: "7",
      height: "5",
      rx: "1"
    })),
    users: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 21a6 6 0 0 1 12 0"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "17",
      cy: "9",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 21a4 4 0 0 1 8 0"
    })),
    user: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "8",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M4 21a8 8 0 0 1 16 0"
    })),
    briefcase: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "7",
      width: "18",
      height: "13",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 13h18"
    })),
    chart: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 21h18"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "5",
      y: "10",
      width: "3",
      height: "9"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "11",
      y: "6",
      width: "3",
      height: "13"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "17",
      y: "13",
      width: "3",
      height: "6"
    })),
    funnel: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 4h18l-7 9v6l-4 2v-8z"
    })),
    money: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"
    })),
    calendar: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "5",
      width: "18",
      height: "16",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 10h18M8 3v4M16 3v4"
    })),
    bell: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 21a2 2 0 0 0 4 0"
    })),
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 21l-4.3-4.3"
    })),
    settings: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8h0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    })),
    chevron: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6"
    })),
    chevronDown: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 9l6 6 6-6"
    })),
    arrowUp: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 19V5M5 12l7-7 7 7"
    })),
    arrowDown: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M19 12l-7 7-7-7"
    })),
    plus: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14M12 5v14"
    })),
    alert: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 2 2 21h20L12 2zM12 9v5M12 18h.01"
    })),
    check: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12l5 5L20 7"
    })),
    x: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 6l12 12M18 6l-12 12"
    })),
    sparkles: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"
    })),
    filter: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18M6 12h12M10 18h4"
    })),
    download: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 3v12M7 10l5 5 5-5M5 21h14"
    })),
    target: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1"
    })),
    flag: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 21V4h13l-2 5 2 5H5"
    })),
    moreH: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "5",
      cy: "12",
      r: "1.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "19",
      cy: "12",
      r: "1.5"
    })),
    home: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, rest), paths[name]);
};

// ---- BADGE / STATUS PILL ----
const statusMap = {
  healthy: {
    cls: "h",
    label: "Saudável"
  },
  warning: {
    cls: "r",
    label: "Em risco"
  },
  critical: {
    cls: "c",
    label: "Crítico"
  },
  neutral: {
    cls: "n",
    label: "—"
  }
};
const StatusBadge = ({
  status,
  score
}) => {
  const m = statusMap[status] || statusMap.neutral;
  return /*#__PURE__*/React.createElement("span", {
    className: `badge ${m.cls}`
  }, /*#__PURE__*/React.createElement("i", null), score != null ? score : m.label);
};

// ---- AVATAR ----
const avatarColors = ["#e50914", "#1f6f4a", "#2b3450", "#7a4a1f", "#5a3066", "#1a4060"];
const Avatar = ({
  name,
  size = 28,
  square = true
}) => {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const idx = name.charCodeAt(0) % avatarColors.length;
  return /*#__PURE__*/React.createElement("div", {
    className: "avatar",
    style: {
      width: size,
      height: size,
      background: avatarColors[idx],
      borderRadius: square ? 6 : "50%",
      fontSize: Math.max(10, size * 0.4)
    }
  }, initials);
};

// ---- DELTA INDICATOR (▲ / ▼ pct) ----
const Delta = ({
  value,
  prev,
  invert = false,
  format = "pct"
}) => {
  if (prev == null) return null;
  const diff = value - prev;
  const pct = prev === 0 ? 0 : diff / prev * 100;
  const up = diff > 0;
  const good = invert ? !up : up;
  const label = format === "abs" ? (up ? "+" : "") + diff.toFixed(0) : (up ? "+" : "") + pct.toFixed(1).replace(".", ",") + "%";
  return /*#__PURE__*/React.createElement("span", {
    className: "delta " + (good ? "good" : "bad")
  }, /*#__PURE__*/React.createElement(Icon, {
    name: up ? "arrowUp" : "arrowDown",
    size: 11,
    stroke: 3
  }), label);
};

// ---- KPI TILE ----
const formatValue = (v, fmt) => {
  if (fmt === "BRLk") return V4Data.fmtBRLk(v);
  if (fmt === "BRL") return V4Data.fmtBRL(v);
  if (fmt === "x") return v.toFixed(1).replace(".", ",") + "×";
  if (fmt === "pct") return v.toFixed(1).replace(".", ",") + "%";
  if (fmt === "score") return v + "/100";
  if (fmt === "int") return V4Data.fmtNum(v);
  return v;
};
const KPITile = ({
  kpi,
  accent = false,
  sparkData,
  big = false
}) => /*#__PURE__*/React.createElement("div", {
  className: "kpi-tile" + (accent ? " accent" : "")
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow"
}, kpi.label), /*#__PURE__*/React.createElement("div", {
  className: "kpi-value " + (big ? "xl" : "lg")
}, formatValue(kpi.v, kpi.fmt)), /*#__PURE__*/React.createElement("div", {
  className: "kpi-meta"
}, /*#__PURE__*/React.createElement(Delta, {
  value: kpi.v,
  prev: kpi.prev,
  invert: kpi.invert
}), /*#__PURE__*/React.createElement("span", {
  className: "kpi-prev"
}, "vs. m\xEAs ant.")), sparkData && /*#__PURE__*/React.createElement(Sparkline, {
  data: sparkData,
  className: "kpi-spark"
}));

// ---- SPARKLINE ----
const Sparkline = ({
  data,
  width = 80,
  height = 28,
  color = "var(--accent)",
  className = ""
}) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = i / (data.length - 1) * width;
    const y = height - (v - min) / range * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    className: className,
    width: width,
    height: height,
    viewBox: `0 0 ${width} ${height}`,
    fill: "none"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none"
  }));
};

// ---- HEALTH RING (radial gauge) ----
const HealthRing = ({
  score,
  size = 96,
  stroke = 8
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const off = c * (1 - pct);
  const color = score >= 70 ? "var(--v4-green)" : score >= 50 ? "var(--v4-yellow)" : "var(--v4-red-500)";
  return /*#__PURE__*/React.createElement("div", {
    className: "health-ring",
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: "rgba(255,255,255,0.06)",
    strokeWidth: stroke,
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: color,
    strokeWidth: stroke,
    fill: "none",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: off,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
    style: {
      transition: "stroke-dashoffset 600ms var(--ease-out)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "health-ring-label"
  }, /*#__PURE__*/React.createElement("div", {
    className: "health-ring-score"
  }, score), /*#__PURE__*/React.createElement("div", {
    className: "health-ring-max"
  }, "/ 100")));
};

// ---- BAR CHART (categorical, 12 mo trend) ----
const BarChart = ({
  data,
  height = 180,
  accentLast = true
}) => {
  const max = Math.max(...data.map(d => d.v));
  return /*#__PURE__*/React.createElement("div", {
    className: "bar-chart",
    style: {
      height
    }
  }, data.map((d, i) => {
    const h = d.v / max * (height - 32);
    const isLast = i === data.length - 1;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "bar-col",
      title: `${d.m}: ${V4Data.fmtBRLk(d.v)}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "bar-val"
    }, isLast ? V4Data.fmtBRLk(d.v) : ""), /*#__PURE__*/React.createElement("div", {
      className: "bar",
      style: {
        height: h,
        background: accentLast && isLast ? "var(--accent)" : "var(--v4-gray-600)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "bar-lbl"
    }, d.m));
  }));
};

// ---- DONUT (Método V4 pillars) ----
const Donut = ({
  data,
  size = 160,
  stroke = 22
}) => {
  const total = data.reduce((s, d) => s + d.share, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "donut",
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: "rgba(255,255,255,0.04)",
    strokeWidth: stroke,
    fill: "none"
  }), data.map((d, i) => {
    const len = d.share / total * c;
    const dash = `${len} ${c}`;
    const dashOff = -off;
    off += len;
    return /*#__PURE__*/React.createElement("circle", {
      key: i,
      cx: size / 2,
      cy: size / 2,
      r: r,
      stroke: d.color,
      strokeWidth: stroke,
      fill: "none",
      strokeDasharray: dash,
      strokeDashoffset: dashOff,
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    });
  })), /*#__PURE__*/React.createElement("div", {
    className: "donut-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "M\xE9todo"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-h2)"
    }
  }, "V4")));
};

// ---- CARD WRAPPER ----
const Card = ({
  title,
  subtitle,
  action,
  children,
  padded = true,
  className = ""
}) => /*#__PURE__*/React.createElement("section", {
  className: "v4-card " + className
}, (title || action) && /*#__PURE__*/React.createElement("header", {
  className: "v4-card-head"
}, /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("h3", {
  className: "v4-card-title"
}, title), subtitle && /*#__PURE__*/React.createElement("div", {
  className: "v4-card-sub"
}, subtitle)), action), /*#__PURE__*/React.createElement("div", {
  className: padded ? "v4-card-body" : ""
}, children));

// ---- Method V4 pillar tag ----
const PillarTag = ({
  pillar
}) => {
  const map = {
    "Aquisição": {
      c: "var(--viz-1)",
      short: "A"
    },
    "Engajamento": {
      c: "var(--viz-2)",
      short: "E"
    },
    "Monetização": {
      c: "var(--viz-3)",
      short: "M"
    },
    "Retenção": {
      c: "var(--viz-4)",
      short: "R"
    }
  };
  const m = map[pillar] || {
    c: "var(--fg-3)",
    short: "·"
  };
  return /*#__PURE__*/React.createElement("span", {
    className: "pillar-tag"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: m.c
    }
  }), pillar);
};
Object.assign(window, {
  Icon,
  StatusBadge,
  Avatar,
  Delta,
  KPITile,
  Sparkline,
  HealthRing,
  BarChart,
  Donut,
  Card,
  PillarTag,
  formatValue,
  statusMap
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/health-score.js
try { (() => {
// =========================================================
// V4 BI — Health Score (Oliveira & Co)
// 12-dimension monthly survey → composite 0–100 score
// =========================================================
(function () {
  // ---- Dimension definitions ----
  // Each: id, label (short, for UI), pillar (Método V4), weight (% sum=100),
  //       kind ("yesno" | "rating" | "ratio" | "nps" | "invertedRating"),
  //       help (tooltip).
  const DIMENSIONS = [{
    id: "roi",
    label: "ROI > 1",
    pillar: "Monetização",
    weight: 15,
    kind: "ratio",
    help: "ROAS/ROI consolidado do mês, cap em 5×."
  }, {
    id: "meta",
    label: "Meta de vendas",
    pillar: "Monetização",
    weight: 15,
    kind: "ratio",
    help: "% da meta de vendas do cliente atingida."
  }, {
    id: "churn",
    label: "Probabilidade de churn",
    pillar: "Retenção",
    weight: 12,
    kind: "invertedRating",
    help: "Avaliação do CS · 0 = certo de sair, 10 = nada provável."
  }, {
    id: "promotor",
    label: "Promotor?",
    pillar: "Retenção",
    weight: 10,
    kind: "nps",
    help: "Detrator (0–6), Neutro (7–8), Promotor (9–10)."
  }, {
    id: "relacion",
    label: "Relacionamento",
    pillar: "Engajamento",
    weight: 10,
    kind: "rating",
    help: "Nota 0–10 do squad sobre a relação."
  }, {
    id: "fee",
    label: "Fee em dia?",
    pillar: "Monetização",
    weight: 10,
    kind: "yesno",
    help: "Pagamento mensal em dia."
  }, {
    id: "conta",
    label: "Conta + saldo OK?",
    pillar: "Aquisição",
    weight: 8,
    kind: "yesno",
    help: "Contas de anúncio ativas e com saldo."
  }, {
    id: "checkin",
    label: "Check-in realizado",
    pillar: "Engajamento",
    weight: 5,
    kind: "yesno",
    help: "Check-in mensal feito com o cliente."
  }, {
    id: "stake",
    label: "Stakeholders cientes",
    pillar: "Engajamento",
    weight: 5,
    kind: "yesno",
    help: "Decisores enxergam os avanços."
  }, {
    id: "playbook",
    label: "Playbook em dia",
    pillar: "Retenção",
    weight: 4,
    kind: "yesno",
    help: "Playbook V4 atualizado no mês."
  }, {
    id: "crm",
    label: "CRM em uso",
    pillar: "Aquisição",
    weight: 3,
    kind: "yesno",
    help: "Cliente usando CRM ativo."
  }, {
    id: "comercial",
    label: "Comercial ativo",
    pillar: "Aquisição",
    weight: 3,
    kind: "yesno",
    help: "Time comercial do cliente operando."
  }];

  // ---- Score a single dimension's raw value → 0..10 ----
  function scoreOne(kind, value) {
    if (value == null) return null;
    switch (kind) {
      case "yesno":
        return value ? 10 : 0;
      case "rating":
        return Math.max(0, Math.min(10, Number(value)));
      case "invertedRating":
        return Math.max(0, Math.min(10, 10 - Number(value)));
      case "nps":
        // 0–10 input
        if (value >= 9) return 10;
        if (value >= 7) return 5;
        return 0;
      case "ratio":
        // value is the raw ratio (e.g. ROAS, % meta)
        if (kind === "ratio" && value <= 1) return Math.max(0, value * 5); // ROI <1 = 0..5
        return Math.max(0, Math.min(10, value * 2));
      // 5× = 10
      default:
        return null;
    }
  }

  // ---- Composite score from a full survey object {dimId: value} ----
  function composite(survey) {
    let total = 0,
      w = 0;
    for (const dim of DIMENSIONS) {
      const v = survey[dim.id];
      if (v == null) continue;
      const s = scoreOne(dim.kind, v);
      if (s == null) continue;
      total += s * dim.weight;
      w += dim.weight;
    }
    if (w === 0) return null;
    return Math.round(total / w * 10); // 0..100
  }

  // ---- Status flag from score ----
  function flag(score) {
    if (score == null) return "neutral";
    if (score >= 70) return "healthy";
    if (score >= 50) return "warning";
    return "critical";
  }

  // ---- Pretty value for display ----
  function displayValue(kind, value) {
    if (value == null) return "—";
    if (kind === "yesno") return value ? "Sim" : "Não";
    if (kind === "nps") {
      if (value >= 9) return "Promotor (" + value + ")";
      if (value >= 7) return "Neutro (" + value + ")";
      return "Detrator (" + value + ")";
    }
    if (kind === "ratio") return value.toFixed(1).replace(".", ",");
    return value;
  }

  // ---- Surveys for the mock clients ----
  // Each survey: 12 fields keyed by dimension id, with raw input values.
  const SURVEYS = {
    solar: {
      roi: 5.2,
      meta: 1.12,
      churn: 2,
      promotor: 9,
      relacion: 9,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: true,
      comercial: true
    },
    fazenda: {
      roi: 1.8,
      meta: 0.48,
      churn: 8,
      promotor: 5,
      relacion: 5,
      fee: true,
      conta: true,
      checkin: false,
      stake: false,
      playbook: false,
      crm: false,
      comercial: true
    },
    moveis: {
      roi: 3.4,
      meta: 0.80,
      churn: 5,
      promotor: 8,
      relacion: 7,
      fee: true,
      conta: true,
      checkin: true,
      stake: false,
      playbook: true,
      crm: false,
      comercial: true
    },
    estetica: {
      roi: 6.1,
      meta: 1.30,
      churn: 1,
      promotor: 10,
      relacion: 10,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: true,
      comercial: true
    },
    edu: {
      roi: 4.2,
      meta: 1.00,
      churn: 3,
      promotor: 8,
      relacion: 8,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: false,
      comercial: true
    },
    fitness: {
      roi: 2.6,
      meta: 0.55,
      churn: 6,
      promotor: 7,
      relacion: 6,
      fee: true,
      conta: false,
      checkin: false,
      stake: true,
      playbook: false,
      crm: true,
      comercial: false
    },
    constru: {
      roi: 3.0,
      meta: 0.70,
      churn: 5,
      promotor: 7,
      relacion: 7,
      fee: false,
      conta: true,
      checkin: true,
      stake: false,
      playbook: false,
      crm: false,
      comercial: true
    },
    petshop: {
      roi: 5.8,
      meta: 1.18,
      churn: 1,
      promotor: 10,
      relacion: 10,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: true,
      comercial: true
    },
    imob: {
      roi: 4.6,
      meta: 0.95,
      churn: 3,
      promotor: 9,
      relacion: 8,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: false,
      comercial: true
    },
    ecomm: {
      roi: 1.4,
      meta: 0.30,
      churn: 9,
      promotor: 4,
      relacion: 4,
      fee: false,
      conta: false,
      checkin: false,
      stake: false,
      playbook: false,
      crm: false,
      comercial: false
    },
    advogados: {
      roi: 5.0,
      meta: 1.05,
      churn: 2,
      promotor: 9,
      relacion: 9,
      fee: true,
      conta: true,
      checkin: true,
      stake: true,
      playbook: true,
      crm: false,
      comercial: true
    },
    spa: {
      roi: 4.0,
      meta: 0.85,
      churn: 4,
      promotor: 7,
      relacion: 7,
      fee: true,
      conta: true,
      checkin: true,
      stake: false,
      playbook: true,
      crm: true,
      comercial: true
    }
  };
  window.V4Health = {
    DIMENSIONS,
    SURVEYS,
    scoreOne,
    composite,
    flag,
    displayValue
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/health-score.js", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/mock-data.js
try { (() => {
// =========================================================
// V4 Oliveira & Co — Data loader for the Unit BI Dashboard
//
// Loads all the JSON files in /data/* and exposes them on
// `window.V4Data`. The data files in /data/ are the SOURCE
// OF TRUTH — to change a number, edit the JSON, reload.
//
// On load completion, fires:
//   window.dispatchEvent(new Event("v4-data-ready"))
//
// Inline fallback below is used if fetch fails (file:// or
// offline preview). Keep the fallback synced with /data/
// shape — it's the schema reference, nothing more.
// =========================================================
(function () {
  // ---- formatting helpers (shared) ----
  const fmtBRL = n => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(n);
  const fmtBRLk = n => {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
    if (n >= 1_000) return "R$ " + Math.round(n / 1_000) + "k";
    return fmtBRL(n);
  };
  const fmtNum = n => new Intl.NumberFormat("pt-BR").format(n);

  // ---- Inline fallback (used only if fetch fails) ----
  const FALLBACK = {
    unit: {
      name: "Oliveira & Co",
      label: "Unidade · V4 Company",
      period: "Maio 2026",
      kpis: {
        fee: {
          v: 482300,
          prev: 429000,
          fmt: "BRLk",
          label: "Fee recorrente"
        },
        invest: {
          v: 1240000,
          prev: 1120000,
          fmt: "BRLk",
          label: "Investimento gerido"
        },
        roasMedio: {
          v: 4.8,
          prev: 4.5,
          fmt: "x",
          label: "ROAS médio"
        },
        faturamento: {
          v: 8420000,
          prev: 7810000,
          fmt: "BRLk",
          label: "Faturamento clientes"
        },
        healthMedia: {
          v: 78,
          prev: 74,
          fmt: "score",
          label: "Health médio"
        },
        clientesAtivos: {
          v: 42,
          prev: 39,
          fmt: "int",
          label: "Clientes ativos"
        },
        ltv: {
          v: 184000,
          prev: 168000,
          fmt: "BRLk",
          label: "LTV médio"
        },
        churn: {
          v: 2.1,
          prev: 3.4,
          fmt: "pct",
          label: "Churn 90d",
          invert: true
        }
      }
    },
    squads: [{
      id: "aurora",
      name: "Aurora",
      lead: "Marina Lopes",
      count: 5,
      clients: 8,
      load: 92
    }, {
      id: "volta",
      name: "Volta",
      lead: "Diego Prado",
      count: 4,
      clients: 7,
      load: 78
    }, {
      id: "norte",
      name: "Norte",
      lead: "Beatriz Lima",
      count: 6,
      clients: 11,
      load: 88
    }, {
      id: "delta",
      name: "Delta",
      lead: "Lucas Hortz",
      count: 5,
      clients: 9,
      load: 71
    }, {
      id: "matriz",
      name: "Matriz",
      lead: "Renata Ávila",
      count: 4,
      clients: 7,
      load: 64
    }],
    clients: [{
      id: "solar",
      name: "Solar Bras",
      segment: "Energia solar",
      squad: "aurora",
      months: 6,
      fee: 18500,
      invest: 42000,
      roas: 5.2,
      health: 82,
      status: "healthy",
      ltv: 222000
    }, {
      id: "fazenda",
      name: "Fazenda Zumbi",
      segment: "Agro",
      squad: "volta",
      months: 11,
      fee: 9800,
      invest: 12500,
      roas: 1.8,
      health: 34,
      status: "critical",
      ltv: 107800
    }, {
      id: "moveis",
      name: "Móveis Vargas",
      segment: "Varejo",
      squad: "norte",
      months: 3,
      fee: 7200,
      invest: 18000,
      roas: 3.4,
      health: 61,
      status: "warning",
      ltv: 21600
    }, {
      id: "estetica",
      name: "Clínica Estética",
      segment: "Saúde",
      squad: "delta",
      months: 14,
      fee: 12500,
      invest: 28000,
      roas: 6.1,
      health: 89,
      status: "healthy",
      ltv: 175000
    }, {
      id: "edu",
      name: "EduPlus",
      segment: "Educação",
      squad: "aurora",
      months: 8,
      fee: 9500,
      invest: 22000,
      roas: 4.2,
      health: 74,
      status: "healthy",
      ltv: 76000
    }, {
      id: "fitness",
      name: "RedFit Academias",
      segment: "Fitness",
      squad: "norte",
      months: 5,
      fee: 8800,
      invest: 19500,
      roas: 2.6,
      health: 52,
      status: "warning",
      ltv: 44000
    }, {
      id: "constru",
      name: "Constru Bem",
      segment: "Construção",
      squad: "delta",
      months: 2,
      fee: 6200,
      invest: 14000,
      roas: 3.0,
      health: 58,
      status: "warning",
      ltv: 12400
    }, {
      id: "petshop",
      name: "Petshop Companhia",
      segment: "Pet",
      squad: "matriz",
      months: 18,
      fee: 11000,
      invest: 24000,
      roas: 5.8,
      health: 91,
      status: "healthy",
      ltv: 198000
    }, {
      id: "imob",
      name: "Imobiliária Rocha",
      segment: "Imobiliário",
      squad: "volta",
      months: 4,
      fee: 14000,
      invest: 32000,
      roas: 4.6,
      health: 76,
      status: "healthy",
      ltv: 56000
    }, {
      id: "ecomm",
      name: "Doce Atelier",
      segment: "E-commerce",
      squad: "norte",
      months: 9,
      fee: 6500,
      invest: 9800,
      roas: 1.4,
      health: 28,
      status: "critical",
      ltv: 58500
    }, {
      id: "advogados",
      name: "Marques Advocacia",
      segment: "Serviços",
      squad: "matriz",
      months: 7,
      fee: 8200,
      invest: 11000,
      roas: 5.0,
      health: 81,
      status: "healthy",
      ltv: 57400
    }, {
      id: "spa",
      name: "Caravelas Spa",
      segment: "Hospitalidade",
      squad: "aurora",
      months: 12,
      fee: 10500,
      invest: 17000,
      roas: 4.0,
      health: 69,
      status: "warning",
      ltv: 126000
    }],
    trend: [{
      m: "jun/25",
      v: 308000
    }, {
      m: "jul/25",
      v: 322000
    }, {
      m: "ago/25",
      v: 341000
    }, {
      m: "set/25",
      v: 358000
    }, {
      m: "out/25",
      v: 372000
    }, {
      m: "nov/25",
      v: 401000
    }, {
      m: "dez/25",
      v: 388000
    }, {
      m: "jan/26",
      v: 396000
    }, {
      m: "fev/26",
      v: 412000
    }, {
      m: "mar/26",
      v: 438000
    }, {
      m: "abr/26",
      v: 429000
    }, {
      m: "mai/26",
      v: 482300
    }],
    pipeline: [{
      stage: "Lead",
      count: 84,
      value: 680000
    }, {
      stage: "Diagnóstico",
      count: 31,
      value: 410000
    }, {
      stage: "Proposta",
      count: 18,
      value: 290000
    }, {
      stage: "Negociação",
      count: 9,
      value: 165000
    }, {
      stage: "Fechado",
      count: 4,
      value: 72000
    }],
    meetings: [{
      day: "seg",
      time: "09:00",
      client: "Solar Bras",
      type: "Weekly",
      squad: "aurora"
    }, {
      day: "seg",
      time: "14:30",
      client: "Fazenda Zumbi",
      type: "Crise",
      squad: "volta",
      alert: true
    }, {
      day: "ter",
      time: "10:00",
      client: "Móveis Vargas",
      type: "Onboarding",
      squad: "norte"
    }, {
      day: "ter",
      time: "16:00",
      client: "EduPlus",
      type: "Review",
      squad: "aurora"
    }, {
      day: "qua",
      time: "11:00",
      client: "Petshop Companhia",
      type: "Weekly",
      squad: "matriz"
    }, {
      day: "qui",
      time: "09:30",
      client: "Doce Atelier",
      type: "Crise",
      squad: "norte",
      alert: true
    }, {
      day: "sex",
      time: "15:00",
      client: "Imobiliária Rocha",
      type: "Review",
      squad: "volta"
    }],
    metodo: [{
      pillar: "Aquisição",
      share: 36,
      color: "var(--viz-1)",
      clients: 15
    }, {
      pillar: "Engajamento",
      share: 22,
      color: "var(--viz-2)",
      clients: 9
    }, {
      pillar: "Monetização",
      share: 28,
      color: "var(--viz-3)",
      clients: 12
    }, {
      pillar: "Retenção",
      share: 14,
      color: "var(--viz-4)",
      clients: 6
    }]
  };

  // ---- Loader -----------------------------------------
  // BI lives at /ui_kits/bi-desktop/, /data/ is two levels up.
  const BASE = "../../data/";
  const FILES = [["unit", "unit.json"], ["squads", "squads.json"], ["clients", "clients.json"], ["trend", "trend.json"], ["pipeline", "pipeline.json"], ["meetings", "meetings.json"], ["metodo", "metodo.json"]];
  async function loadOne(key, file) {
    try {
      const r = await fetch(BASE + file, {
        cache: "no-store"
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const json = await r.json();
      // unit.json is a top-level object; the others wrap an `items` array
      if (key === "unit") return json;
      return Array.isArray(json) ? json : json.items || [];
    } catch (e) {
      console.warn(`[V4Data] fallback for ${key}:`, e.message);
      return FALLBACK[key];
    }
  }
  async function load() {
    const entries = await Promise.all(FILES.map(async ([key, file]) => [key, await loadOne(key, file)]));
    const data = Object.fromEntries(entries);

    // Expose
    window.V4Data = {
      ...data,
      fmtBRL,
      fmtBRLk,
      fmtNum,
      // Helpful aggregates derived once at load time:
      clientsBySquad: (() => {
        const m = {};
        for (const c of data.clients) (m[c.squad] = m[c.squad] || []).push(c);
        return m;
      })(),
      clientsById: Object.fromEntries((data.clients || []).map(c => [c.id, c])),
      squadsById: Object.fromEntries((data.squads || []).map(s => [s.id, s]))
    };
    window.dispatchEvent(new Event("v4-data-ready"));
  }

  // Kick off (returns a promise so the React boot can await it)
  window.V4DataReady = load();
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/mock-data.js", error: String((e && e.message) || e) }); }

// ui_kits/bi-desktop/store.js
try { (() => {
// =========================================================
// V4 BI — Store (realtime, multi-tab, localStorage-persisted)
//   • Identity (name + email) is stored once per browser.
//   • Dossie & meeting notes are keyed by client id.
//   • Changes broadcast via BroadcastChannel so every open tab
//     in the unit sees writes from any other tab instantly.
//   • A revision log records who-changed-what-when.
// =========================================================
(function () {
  const LS_KEY = "v4-oliveira-store-v1";
  const LS_ID_KEY = "v4-oliveira-identity-v1";
  const CH_NAME = "v4-oliveira-store";

  // ---- INITIAL STATE ----
  const seedDossie = {
    fazenda: {
      improvementsUs: [{
        id: "u1",
        text: "Replanejar campanha Meta Ads zerando criativos antigos.",
        by: "Marina Lopes",
        at: "2026-05-24T14:00:00"
      }, {
        id: "u2",
        text: "CS precisa retomar cadência semanal com o dono.",
        by: "Diego Prado",
        at: "2026-05-22T10:30:00"
      }],
      improvementsProject: [{
        id: "p1",
        text: "Cliente sem time interno para responder briefings — gargalo de aprovação.",
        by: "Diego Prado",
        at: "2026-05-22T10:35:00"
      }, {
        id: "p2",
        text: "Conta de anúncio Meta caiu por verificação pendente.",
        by: "Marina Lopes",
        at: "2026-05-20T09:00:00"
      }]
    },
    ecomm: {
      improvementsUs: [{
        id: "u1",
        text: "Finalizar onboarding (faltam 2 documentos).",
        by: "Beatriz Lima",
        at: "2026-05-26T11:20:00"
      }],
      improvementsProject: [{
        id: "p1",
        text: "Estoque inconsistente nos anúncios — pausa frequente.",
        by: "Beatriz Lima",
        at: "2026-05-25T16:00:00"
      }]
    }
  };
  const seedMeetings = {
    fazenda: [{
      id: "m1",
      date: "2026-05-24",
      time: "16:00",
      type: "Reunião de crise",
      title: "Alinhamento sobre ROAS abaixo do target",
      attendees: "Marina Lopes (V4) · Diego Prado (V4) · João Zumbi (cliente) · Rita Zumbi (cliente)",
      summary: "Cliente reconhece urgência. Concordou em destravar verba para criativos novos. Próximo passo: rodar 3 campanhas paralelas testando público amplo vs. retargeting.",
      pains: ["Estamos pagando alto pra trazer lead que não fecha.", "Não consigo medir o que está dando resultado no dia a dia.", "Precisamos de mais agilidade nos criativos."],
      by: "Marina Lopes",
      at: "2026-05-24T18:30:00"
    }],
    ecomm: [{
      id: "m1",
      date: "2026-05-26",
      time: "10:00",
      type: "Weekly",
      title: "Status de onboarding",
      attendees: "Beatriz Lima (V4) · Felipe Tonin (V4) · Carla Atelier (cliente)",
      summary: "Documentação ainda incompleta. Cliente operando vendas via WhatsApp; conversão de loja ainda não medida. Próximo passo: instalar pixel + GA4 até sexta.",
      pains: ["Não enxergo de onde vem cada venda.", "Estoque some sem aviso e os anúncios ficam fora do ar."],
      by: "Beatriz Lima",
      at: "2026-05-26T12:00:00"
    }]
  };
  const seed = {
    dossie: seedDossie,
    meetings: seedMeetings,
    presence: {},
    // online users
    revisions: [] // global revision log
  };

  // ---- STORAGE ----
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return {
        ...seed,
        ...JSON.parse(raw)
      };
    } catch (e) {}
    return seed;
  }
  function save(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        dossie: state.dossie,
        meetings: state.meetings,
        revisions: state.revisions.slice(-200)
      }));
    } catch (e) {}
  }

  // ---- IDENTITY ----
  function loadIdentity() {
    try {
      const raw = localStorage.getItem(LS_ID_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function saveIdentity(id) {
    localStorage.setItem(LS_ID_KEY, JSON.stringify(id));
  }
  function clearIdentity() {
    localStorage.removeItem(LS_ID_KEY);
  }

  // ---- BROADCAST CHANNEL ----
  let channel = null;
  try {
    channel = new BroadcastChannel(CH_NAME);
  } catch (e) {}

  // ---- STORE CLASS ----
  class Store {
    constructor() {
      this.state = load();
      this.subs = new Set();
      this.identity = loadIdentity();
      this._sessionId = Math.random().toString(36).slice(2, 9);
      if (channel) {
        channel.addEventListener("message", e => this._onRemote(e.data));
      }
      // Also handle plain localStorage events (cross-tab fallback)
      window.addEventListener("storage", e => {
        if (e.key === LS_KEY && e.newValue) {
          try {
            const next = JSON.parse(e.newValue);
            this.state = {
              ...this.state,
              ...next
            };
            this._emit();
          } catch (e) {}
        }
      });

      // Presence ping every 5s
      this._announcePresence();
      this._presenceTimer = setInterval(() => this._announcePresence(), 5000);
      window.addEventListener("beforeunload", () => this._leavePresence());
    }
    _emit() {
      this.subs.forEach(fn => fn(this.state));
    }
    subscribe(fn) {
      this.subs.add(fn);
      return () => this.subs.delete(fn);
    }
    _broadcast(payload) {
      if (channel) channel.postMessage({
        from: this._sessionId,
        ...payload
      });
    }
    _onRemote(msg) {
      if (!msg || msg.from === this._sessionId) return;
      if (msg.type === "state") {
        this.state = msg.state;
        this._emit();
      }
      if (msg.type === "presence") {
        this._mergePresence(msg.user);
      }
    }

    // ---- IDENTITY ----
    setIdentity(name, email) {
      const id = {
        name: name.trim(),
        email: email.trim(),
        at: new Date().toISOString()
      };
      this.identity = id;
      saveIdentity(id);
      this._announcePresence();
      this._emit();
    }
    signOut() {
      this._leavePresence();
      clearIdentity();
      this.identity = null;
      this._emit();
    }

    // ---- PRESENCE ----
    _announcePresence() {
      if (!this.identity) return;
      const u = {
        ...this.identity,
        sessionId: this._sessionId,
        lastSeen: Date.now()
      };
      this.state.presence = {
        ...this.state.presence,
        [this._sessionId]: u
      };
      this._broadcast({
        type: "presence",
        user: u
      });
      // Reap stale (>15s without ping)
      const now = Date.now();
      for (const k of Object.keys(this.state.presence)) {
        if (now - (this.state.presence[k].lastSeen || 0) > 15000) {
          delete this.state.presence[k];
        }
      }
      this._emit();
    }
    _leavePresence() {
      if (!this.state.presence) return;
      delete this.state.presence[this._sessionId];
      this._broadcast({
        type: "presence",
        user: {
          sessionId: this._sessionId,
          lastSeen: 0
        }
      });
    }
    _mergePresence(user) {
      if (!user.sessionId) return;
      if (!user.lastSeen) {
        delete this.state.presence[user.sessionId];
      } else {
        this.state.presence[user.sessionId] = user;
      }
      this._emit();
    }
    onlineUsers() {
      const now = Date.now();
      return Object.values(this.state.presence || {}).filter(u => u.lastSeen && now - u.lastSeen < 15000);
    }

    // ---- REVISIONS ----
    _logRevision(action, clientId, summary) {
      if (!this.identity) return;
      this.state.revisions.push({
        id: Math.random().toString(36).slice(2, 10),
        action,
        clientId,
        summary,
        by: this.identity.name,
        email: this.identity.email,
        at: new Date().toISOString()
      });
    }

    // ---- DOSSIE ----
    addImprovement(clientId, kind, text) {
      if (!this.identity || !text.trim()) return;
      const item = {
        id: Math.random().toString(36).slice(2, 10),
        text: text.trim(),
        by: this.identity.name,
        at: new Date().toISOString()
      };
      const d = this.state.dossie[clientId] || {
        improvementsUs: [],
        improvementsProject: []
      };
      const next = {
        ...d,
        [kind]: [...(d[kind] || []), item]
      };
      this.state.dossie = {
        ...this.state.dossie,
        [clientId]: next
      };
      this._logRevision("dossie:add", clientId, `+ ${kind === "improvementsUs" ? "ponto nosso" : "ponto do projeto"}: ${text.slice(0, 80)}`);
      this._persistAndBroadcast();
    }
    removeImprovement(clientId, kind, itemId) {
      const d = this.state.dossie[clientId];
      if (!d) return;
      const next = {
        ...d,
        [kind]: (d[kind] || []).filter(i => i.id !== itemId)
      };
      this.state.dossie = {
        ...this.state.dossie,
        [clientId]: next
      };
      this._logRevision("dossie:remove", clientId, `− ponto removido`);
      this._persistAndBroadcast();
    }

    // ---- MEETINGS ----
    addMeeting(clientId, payload) {
      if (!this.identity) return;
      const m = {
        id: Math.random().toString(36).slice(2, 10),
        date: payload.date,
        time: payload.time,
        type: payload.type || "Reunião",
        title: payload.title,
        attendees: payload.attendees || "",
        summary: payload.summary || "",
        pains: (payload.pains || []).filter(p => p.trim()),
        by: this.identity.name,
        at: new Date().toISOString()
      };
      const list = this.state.meetings[clientId] || [];
      this.state.meetings = {
        ...this.state.meetings,
        [clientId]: [m, ...list]
      };
      this._logRevision("meeting:add", clientId, `+ ${m.type}: ${m.title}`);
      this._persistAndBroadcast();
    }
    removeMeeting(clientId, meetingId) {
      const list = this.state.meetings[clientId] || [];
      this.state.meetings = {
        ...this.state.meetings,
        [clientId]: list.filter(m => m.id !== meetingId)
      };
      this._logRevision("meeting:remove", clientId, `− reunião removida`);
      this._persistAndBroadcast();
    }
    _persistAndBroadcast() {
      save(this.state);
      this._broadcast({
        type: "state",
        state: {
          dossie: this.state.dossie,
          meetings: this.state.meetings,
          revisions: this.state.revisions
        }
      });
      this._emit();
    }

    // ---- QUERIES ----
    getDossie(clientId) {
      return this.state.dossie[clientId] || {
        improvementsUs: [],
        improvementsProject: []
      };
    }
    getMeetings(clientId) {
      return this.state.meetings[clientId] || [];
    }
    getRevisions(clientId, limit = 20) {
      let r = this.state.revisions;
      if (clientId) r = r.filter(x => x.clientId === clientId);
      return [...r].reverse().slice(0, limit);
    }
  }
  window.V4Store = new Store();
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-desktop/store.js", error: String((e && e.message) || e) }); }

// ui_kits/bi-mobile/App.jsx
try { (() => {
// =========================================================
// V4 BI Mobile · App
// 4 screens + bottom tab nav, all inside iOS frame.
// Data is loaded from /data/* via window.V4Data (shared
// loader with bi-desktop). Falls back to inline data if
// fetch fails (offline / file://).
// =========================================================
const {
  useState,
  useEffect,
  useMemo
} = React;

// ---- Shared mock data (light copy of bi-desktop) -----------
const fmtBRLk = n => {
  if (n == null) return "—";
  if (n >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000) return "R$ " + Math.round(n / 1_000) + "k";
  return "R$ " + n;
};
// Notifications are runtime data — not in /data/. They simulate the
// in-product alert feed; replace with your own source when ready.
const NOTIFS_FALLBACK = [{
  kind: "r",
  urgent: true,
  title: "Fazenda Zumbi entrou em crise",
  det: "Health caiu 18 pts em 7 dias. Reunião marcada hoje 14:30.",
  ago: "12 min"
}, {
  kind: "r",
  urgent: true,
  title: "Doce Atelier · ROAS 1,4×",
  det: "Abaixo da meta há 14 dias. Diego pediu revisão de criativos.",
  ago: "1 h"
}, {
  kind: "y",
  title: "RedFit · novo orçamento",
  det: "Cliente solicitou aumentar investimento em +30% para Black Friday.",
  ago: "2 h"
}, {
  kind: "g",
  title: "Solar Bras · meta atingida",
  det: "ROAS 5,2× em maio. Squad Aurora ✔",
  ago: "3 h"
}, {
  kind: "g",
  title: "Petshop Companhia renovou",
  det: "Contrato +12 meses. LTV projetado R$ 198k.",
  ago: "ontem"
}, {
  kind: "y",
  title: "Constru Bem · sem reunião há 9 dias",
  det: "Última weekly: 18/mai. Cadência abaixo do SLA.",
  ago: "ontem"
}];

// Build the mobile-shape client list from /data/clients.json + /data/meetings.json.
// `next` is "Hoje · 14:30 · Crise" — combined day/time/type for the mobile screens.
function buildClients() {
  const data = window.V4Data;
  if (!data) return [];
  const squadName = id => data.squadsById?.[id]?.name || id;
  const dayLabel = d => ({
    seg: "HOJE",
    ter: "Ter",
    qua: "Qua",
    qui: "Qui",
    sex: "Sex"
  })[d] || d;
  // Build next-meeting index keyed by client name
  const nextByName = {};
  for (const m of data.meetings || []) {
    if (!nextByName[m.client]) {
      nextByName[m.client] = `${dayLabel(m.day)} · ${m.time}${m.type ? " · " + m.type : ""}`;
    }
  }
  return (data.clients || []).map(c => ({
    id: c.id,
    name: c.name,
    seg: c.segment,
    squad: squadName(c.squad),
    fee: c.fee,
    invest: c.invest,
    roas: c.roas,
    health: c.health,
    status: c.status,
    months: c.months,
    next: nextByName[c.name] || "Sem reunião agendada"
  }));
}
const CLIENTS_FALLBACK = [{
  id: "fazenda",
  name: "Fazenda Zumbi",
  seg: "Agro",
  squad: "Volta",
  fee: 9800,
  invest: 12500,
  roas: 1.8,
  health: 34,
  status: "critical",
  months: 11,
  next: "Hoje · 14:30 · Crise"
}, {
  id: "ecomm",
  name: "Doce Atelier",
  seg: "E-commerce",
  squad: "Norte",
  fee: 6500,
  invest: 9800,
  roas: 1.4,
  health: 28,
  status: "critical",
  months: 9,
  next: "Qui · 09:30 · Crise"
}, {
  id: "fitness",
  name: "RedFit Academias",
  seg: "Fitness",
  squad: "Norte",
  fee: 8800,
  invest: 19500,
  roas: 2.6,
  health: 52,
  status: "warning",
  months: 5,
  next: "Sex · 11:00"
}, {
  id: "moveis",
  name: "Móveis Vargas",
  seg: "Varejo",
  squad: "Norte",
  fee: 7200,
  invest: 18000,
  roas: 3.4,
  health: 61,
  status: "warning",
  months: 3,
  next: "Ter · 10:00"
}, {
  id: "constru",
  name: "Constru Bem",
  seg: "Construção",
  squad: "Delta",
  fee: 6200,
  invest: 14000,
  roas: 3.0,
  health: 58,
  status: "warning",
  months: 2,
  next: "Qua · 16:00"
}, {
  id: "spa",
  name: "Caravelas Spa",
  seg: "Hospitalidade",
  squad: "Aurora",
  fee: 10500,
  invest: 17000,
  roas: 4.0,
  health: 69,
  status: "warning",
  months: 12,
  next: "Qua · 14:00"
}, {
  id: "edu",
  name: "EduPlus",
  seg: "Educação",
  squad: "Aurora",
  fee: 9500,
  invest: 22000,
  roas: 4.2,
  health: 74,
  status: "healthy",
  months: 8,
  next: "Ter · 16:00"
}, {
  id: "imob",
  name: "Imobiliária Rocha",
  seg: "Imobiliário",
  squad: "Volta",
  fee: 14000,
  invest: 32000,
  roas: 4.6,
  health: 76,
  status: "healthy",
  months: 4,
  next: "Sex · 15:00"
}, {
  id: "solar",
  name: "Solar Bras",
  seg: "Energia solar",
  squad: "Aurora",
  fee: 18500,
  invest: 42000,
  roas: 5.2,
  health: 82,
  status: "healthy",
  months: 6,
  next: "Seg · 09:00"
}, {
  id: "advogados",
  name: "Marques Advocacia",
  seg: "Serviços",
  squad: "Matriz",
  fee: 8200,
  invest: 11000,
  roas: 5.0,
  health: 81,
  status: "healthy",
  months: 7,
  next: "Qui · 16:00"
}, {
  id: "estetica",
  name: "Clínica Estética",
  seg: "Saúde",
  squad: "Delta",
  fee: 12500,
  invest: 28000,
  roas: 6.1,
  health: 89,
  status: "healthy",
  months: 14,
  next: "Seg · 11:30"
}, {
  id: "petshop",
  name: "Petshop Companhia",
  seg: "Pet",
  squad: "Matriz",
  fee: 11000,
  invest: 24000,
  roas: 5.8,
  health: 91,
  status: "healthy",
  months: 18,
  next: "Sex · 10:00"
}];

// Hook: returns the live client list. Re-renders the calling component
// when V4Data finishes loading. Falls back to the inline array above
// when loading from /data/* fails or hasn't completed yet.
function useClients() {
  const [_, force] = useState(0);
  useEffect(() => {
    if (window.V4Data) return;
    const on = () => force(x => x + 1);
    window.addEventListener("v4-data-ready", on, {
      once: true
    });
    return () => window.removeEventListener("v4-data-ready", on);
  }, []);
  return window.V4Data ? buildClients() : CLIENTS_FALLBACK;
}
const NOTIFS = NOTIFS_FALLBACK;
const avatarColors = ["#e50914", "#1f6f4a", "#2b3450", "#7a4a1f", "#5a3066", "#1a4060"];
const colorFor = s => avatarColors[(s.charCodeAt(0) + s.length) % avatarColors.length];
const initials = s => s.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

// ---- ICONS ------------------------------------------------
const I = ({
  n,
  s = 18
}) => {
  const paths = {
    home: /*#__PURE__*/React.createElement("path", {
      d: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"
    }),
    users: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 21a6 6 0 0 1 12 0"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 21a4 4 0 0 1 8 0"
    })),
    bell: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 21a2 2 0 0 0 4 0"
    })),
    user: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "8",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M4 21a8 8 0 0 1 16 0"
    })),
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 21l-4.3-4.3"
    })),
    settings: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19 12a7 7 0 0 0-.1-1.4l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-2.4-1.4L13.5 2h-3l-.6 3.1A7 7 0 0 0 7.5 6.5l-2.5-1-2 3.5L5.1 10.6A7 7 0 0 0 5 12c0 .5 0 .9.1 1.4L3 15l2 3.5 2.5-1c.7.6 1.5 1.1 2.4 1.4L10.5 22h3l.6-3.1c.9-.3 1.7-.8 2.4-1.4l2.5 1 2-3.5-2.1-1.6c.1-.5.1-.9.1-1.4z"
    })),
    chev: /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6"
    }),
    chevL: /*#__PURE__*/React.createElement("path", {
      d: "M15 6l-6 6 6 6"
    }),
    alert: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 2 2 21h20L12 2zM12 9v5M12 18h.01"
    })),
    money: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"
    })),
    target: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1"
    })),
    spark: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"
    })),
    cal: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "5",
      width: "18",
      height: "16",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 10h18M8 3v4M16 3v4"
    })),
    filter: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18M6 12h12M10 18h4"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, paths[n]);
};

// ---- Sparkline ----
const Spark = ({
  data,
  w = 80,
  h = 26,
  color = "#e50914"
}) => {
  const max = Math.max(...data),
    min = Math.min(...data),
    r = max - min || 1;
  const pts = data.map((v, i) => {
    const x = i / (data.length - 1) * w;
    const y = h - (v - min) / r * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    width: w,
    height: h,
    viewBox: `0 0 ${w} ${h}`,
    fill: "none"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    stroke: color,
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none"
  }));
};

// ---- Health ring ----
const HealthRing = ({
  score,
  size = 76,
  stroke = 7
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const off = c * (1 - pct);
  const color = score >= 70 ? "#52cc5a" : score >= 50 ? "#ffc02a" : "#e50914";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: "rgba(255,255,255,0.06)",
    strokeWidth: stroke,
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: color,
    strokeWidth: stroke,
    fill: "none",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: off,
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "700 22px/1 var(--font-display)",
      letterSpacing: "-0.02em",
      fontVariantNumeric: "tabular-nums"
    }
  }, score), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-caption)",
      color: "var(--fg-3)",
      marginTop: 2
    }
  }, "/ 100")));
};

// =========================================================
// SCREEN: Overview
// =========================================================
const OverviewScreen = ({
  onOpenClient,
  onTab
}) => {
  const CLIENTS = useClients();
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen",
    "data-screen-label": "01 Mobile \xB7 Overview"
  }, /*#__PURE__*/React.createElement("header", {
    className: "m-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "m-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/v4-simbolo.webp",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "lbl"
  }, "Oliveira & Co")), /*#__PURE__*/React.createElement("div", {
    className: "ttl",
    style: {
      marginTop: 4
    }
  }, "Vis\xE3o geral")), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-icon-btn",
    onClick: () => onTab("notifs")
  }, /*#__PURE__*/React.createElement(I, {
    n: "bell",
    s: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "dot"
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-icon-btn"
  }, /*#__PURE__*/React.createElement(I, {
    n: "user",
    s: 16
  })))), /*#__PURE__*/React.createElement("div", {
    className: "m-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-hero-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Faturamento \xB7 mai 2026"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "R$ 482", /*#__PURE__*/React.createElement("span", {
    className: "u"
  }, "k")), /*#__PURE__*/React.createElement("div", {
    className: "m"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "700 12px/1 var(--font-mono)",
      color: "#52cc5a",
      background: "rgba(82,204,90,0.14)",
      padding: "3px 7px",
      borderRadius: 999
    }
  }, "\u2191 12,4%"), /*#__PURE__*/React.createElement("span", null, "vs. abril \xB7 95% da meta")), /*#__PURE__*/React.createElement("div", {
    className: "spark"
  }, /*#__PURE__*/React.createElement(Spark, {
    data: [308, 322, 341, 358, 372, 401, 388, 396, 412, 438, 429, 482],
    w: 108,
    h: 36
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-grid-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Health m\xE9dio"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "78", /*#__PURE__*/React.createElement("span", {
    style: {
      font: "700 14px/1 var(--font-display)",
      color: "var(--fg-3)"
    }
  }, "/100")), /*#__PURE__*/React.createElement("div", {
    className: "d good"
  }, "\u2191 +4 pts")), /*#__PURE__*/React.createElement("div", {
    className: "m-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Clientes ativos"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "42"), /*#__PURE__*/React.createElement("div", {
    className: "d good"
  }, "\u2191 +3")), /*#__PURE__*/React.createElement("div", {
    className: "m-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Fee recorrente"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "R$ 482k"), /*#__PURE__*/React.createElement("div", {
    className: "d good"
  }, "\u2191 12,4%")), /*#__PURE__*/React.createElement("div", {
    className: "m-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Churn 90d"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "2,1%"), /*#__PURE__*/React.createElement("div", {
    className: "d good"
  }, "\u2193 1,3pp"))), /*#__PURE__*/React.createElement("div", {
    className: "m-section"
  }, /*#__PURE__*/React.createElement("h2", null, "Aten\xE7\xE3o agora"), /*#__PURE__*/React.createElement("span", {
    className: "more"
  }, "3 crises \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "m-list"
  }, CLIENTS.filter(c => c.status === "critical").slice(0, 2).concat(CLIENTS.filter(c => c.status === "warning").slice(0, 1)).map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    className: "m-list-item " + (c.status === "critical" ? "alert" : ""),
    onClick: () => onOpenClient(c)
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: colorFor(c.name)
    }
  }, initials(c.name)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "s"
  }, c.squad, " \xB7 ", c.seg)), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-badge " + (c.status === "critical" ? "c" : c.status === "warning" ? "r" : "h")
  }, /*#__PURE__*/React.createElement("i", null), c.health))))), /*#__PURE__*/React.createElement("div", {
    className: "m-section"
  }, /*#__PURE__*/React.createElement("h2", null, "Pr\xF3ximas reuni\xF5es"), /*#__PURE__*/React.createElement("span", {
    className: "more"
  }, "Ver agenda \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "m-list"
  }, [{
    day: "HOJE",
    time: "14:30",
    c: "Fazenda Zumbi",
    t: "Reunião de crise",
    alert: true
  }, {
    day: "TER",
    time: "10:00",
    c: "Móveis Vargas",
    t: "Onboarding · D+7",
    alert: false
  }, {
    day: "QUA",
    time: "11:00",
    c: "Petshop Companhia",
    t: "Weekly",
    alert: false
  }].map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "m-list-item " + (r.alert ? "alert" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: r.alert ? "var(--accent)" : "var(--bg-elev-3)",
      color: r.alert ? "#fff" : "var(--fg-2)",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "700 10px/1 var(--font-mono)",
      letterSpacing: "0.04em"
    }
  }, r.day), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "700 10px/1 var(--font-mono)",
      marginTop: 2
    }
  }, r.time)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, r.c), /*#__PURE__*/React.createElement("div", {
    className: "s",
    style: r.alert ? {
      color: "var(--v4-red-500)"
    } : undefined
  }, r.t)), /*#__PURE__*/React.createElement(I, {
    n: "chev",
    s: 14
  }))))));
};

// =========================================================
// SCREEN: Clients list
// =========================================================
const ClientsScreen = ({
  onOpenClient
}) => {
  const CLIENTS = useClients();
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");
  const filtered = CLIENTS.filter(c => filter === "todos" || c.status === filter).filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.health - b.health);
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen",
    "data-screen-label": "02 Mobile \xB7 Clientes"
  }, /*#__PURE__*/React.createElement("header", {
    className: "m-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Oliveira & Co"), /*#__PURE__*/React.createElement("div", {
    className: "ttl"
  }, "Clientes")), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-icon-btn"
  }, /*#__PURE__*/React.createElement(I, {
    n: "filter",
    s: 16
  })))), /*#__PURE__*/React.createElement("div", {
    className: "m-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-search"
  }, /*#__PURE__*/React.createElement(I, {
    n: "search",
    s: 16
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar cliente, squad\u2026",
    value: q,
    onChange: e => setQ(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-chips"
  }, [["todos", "Todos", CLIENTS.length], ["critical", "Crise", CLIENTS.filter(c => c.status === "critical").length], ["warning", "Em risco", CLIENTS.filter(c => c.status === "warning").length], ["healthy", "Saudável", CLIENTS.filter(c => c.status === "healthy").length]].map(([k, l, n]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "m-chip " + (filter === k ? "active" : ""),
    onClick: () => setFilter(k)
  }, l, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7
    }
  }, n)))), /*#__PURE__*/React.createElement("div", {
    className: "m-list"
  }, filtered.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    className: "m-list-item " + (c.status === "critical" ? "alert" : ""),
    onClick: () => onOpenClient(c)
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: colorFor(c.name)
    }
  }, initials(c.name)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "s"
  }, c.squad, " \xB7 ", fmtBRLk(c.fee), "/m\xEAs \xB7 ROAS ", c.roas.toString().replace(".", ","), "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-badge " + (c.status === "critical" ? "c" : c.status === "warning" ? "r" : "h")
  }, /*#__PURE__*/React.createElement("i", null), c.health)))))));
};

// =========================================================
// SCREEN: Client detail
// =========================================================
const ClientScreen = ({
  client,
  onBack
}) => {
  if (!client) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen",
    "data-screen-label": "03 Mobile \xB7 Cliente"
  }, /*#__PURE__*/React.createElement("header", {
    className: "m-header",
    style: {
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-back",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(I, {
    n: "chevL",
    s: 18
  }), "Clientes"), /*#__PURE__*/React.createElement("div", {
    className: "right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-icon-btn"
  }, /*#__PURE__*/React.createElement(I, {
    n: "cal",
    s: 16
  })))), /*#__PURE__*/React.createElement("div", {
    className: "m-detail-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: colorFor(client.name)
    }
  }, initials(client.name)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, client.name), /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, client.seg, " \xB7 Squad ", /*#__PURE__*/React.createElement("b", null, client.squad), " \xB7 ", client.months, " meses"))), /*#__PURE__*/React.createElement("div", {
    className: "m-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-health-block"
  }, /*#__PURE__*/React.createElement(HealthRing, {
    score: client.health
  }), /*#__PURE__*/React.createElement("div", {
    className: "copy"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Health score"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--t-body-strong)",
      color: client.status === "critical" ? "var(--v4-red-500)" : client.status === "warning" ? "var(--v4-yellow)" : "var(--v4-green)"
    }
  }, client.status === "critical" ? "Em crise" : client.status === "warning" ? "Em risco" : "Saudável"), /*#__PURE__*/React.createElement("div", {
    className: "det"
  }, client.status === "critical" ? "ROAS abaixo da meta há 14d. Squad notificado." : client.status === "warning" ? "Cadência de reunião abaixo do esperado." : "Performance dentro da meta. Renovação prevista."))), /*#__PURE__*/React.createElement("div", {
    className: "m-stat-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Fee \xB7 m\xEAs"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, fmtBRLk(client.fee))), /*#__PURE__*/React.createElement("div", {
    className: "m-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "Investimento"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, fmtBRLk(client.invest))), /*#__PURE__*/React.createElement("div", {
    className: "m-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "ROAS"), /*#__PURE__*/React.createElement("div", {
    className: "v",
    style: {
      color: client.roas < 2.5 ? "var(--v4-red-500)" : undefined
    }
  }, client.roas.toString().replace(".", ","), "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "m-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ey"
  }, "LTV proj."), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, fmtBRLk(client.fee * client.months * 1.4)))), /*#__PURE__*/React.createElement("div", {
    className: "m-section"
  }, /*#__PURE__*/React.createElement("h2", null, "Pr\xF3xima reuni\xE3o")), /*#__PURE__*/React.createElement("div", {
    className: "m-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-list-item",
    style: {
      cursor: "default"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: "var(--accent)",
      color: "#fff",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "700 10px/1 var(--font-mono)"
    }
  }, client.next.split(" · ")[0].toUpperCase().slice(0, 3))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, client.next.split(" · ")[2] || "Weekly"), /*#__PURE__*/React.createElement("div", {
    className: "s"
  }, client.next)), /*#__PURE__*/React.createElement(I, {
    n: "chev",
    s: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-section"
  }, /*#__PURE__*/React.createElement("h2", null, "M\xE9todo V4")), /*#__PURE__*/React.createElement("div", {
    className: "m-list",
    style: {
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, [["Aquisição", "var(--viz-1)", 42], ["Engajamento", "var(--viz-2)", 28], ["Monetização", "var(--viz-3)", 78], ["Retenção", "var(--viz-4)", 60]].map(([n, c, p]) => /*#__PURE__*/React.createElement("div", {
    key: n
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--t-body-strong)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 2,
      background: c,
      display: "inline-block"
    }
  }), n), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--t-mono-sm)",
      color: "var(--fg-2)"
    }
  }, p, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 5,
      background: "rgba(255,255,255,0.06)",
      borderRadius: 999,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: p + "%",
      height: "100%",
      background: c,
      borderRadius: 999
    }
  })))))));
};

// =========================================================
// SCREEN: Notifications
// =========================================================
const NotifsScreen = () => /*#__PURE__*/React.createElement("div", {
  className: "m-screen",
  "data-screen-label": "04 Mobile \xB7 Notifica\xE7\xF5es"
}, /*#__PURE__*/React.createElement("header", {
  className: "m-header"
}, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  className: "sub"
}, "Oliveira & Co"), /*#__PURE__*/React.createElement("div", {
  className: "ttl"
}, "Notifica\xE7\xF5es")), /*#__PURE__*/React.createElement("div", {
  className: "right"
}, /*#__PURE__*/React.createElement("button", {
  className: "m-icon-btn"
}, /*#__PURE__*/React.createElement(I, {
  n: "settings",
  s: 16
})))), /*#__PURE__*/React.createElement("div", {
  className: "m-body"
}, /*#__PURE__*/React.createElement("div", {
  className: "m-chips"
}, /*#__PURE__*/React.createElement("button", {
  className: "m-chip active"
}, "Todas ", /*#__PURE__*/React.createElement("span", {
  style: {
    opacity: 0.7
  }
}, NOTIFS.length)), /*#__PURE__*/React.createElement("button", {
  className: "m-chip"
}, "Crises ", /*#__PURE__*/React.createElement("span", {
  style: {
    opacity: 0.7
  }
}, "2")), /*#__PURE__*/React.createElement("button", {
  className: "m-chip"
}, "Reuni\xF5es"), /*#__PURE__*/React.createElement("button", {
  className: "m-chip"
}, "Oportunidades")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  }
}, NOTIFS.map((n, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  className: "m-notif" + (n.urgent ? " urgent" : "")
}, /*#__PURE__*/React.createElement("div", {
  className: "m-notif-icon " + n.kind
}, /*#__PURE__*/React.createElement(I, {
  n: n.kind === "g" ? "spark" : n.kind === "y" ? "target" : "alert",
  s: 16
})), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  className: "ttl"
}, n.title), /*#__PURE__*/React.createElement("div", {
  className: "det"
}, n.det)), /*#__PURE__*/React.createElement("div", {
  className: "ago"
}, n.ago))))));

// =========================================================
// TAB BAR
// =========================================================
const TabBar = ({
  tab,
  onTab
}) => /*#__PURE__*/React.createElement("nav", {
  className: "m-tabbar"
}, [["home", "home", "Geral"], ["clients", "users", "Clientes"], ["notifs", "bell", "Avisos"], ["me", "user", "Eu"]].map(([id, ic, lb]) => /*#__PURE__*/React.createElement("button", {
  key: id,
  className: "m-tab " + (tab === id ? "active" : ""),
  onClick: () => onTab(id)
}, /*#__PURE__*/React.createElement(I, {
  n: ic,
  s: 20
}), lb)));

// =========================================================
// APP
// =========================================================
const MobileApp = () => {
  const [tab, setTab] = useState("home");
  const [client, setClient] = useState(null);
  const showClient = c => setClient(c);
  const goTab = t => {
    setClient(null);
    setTab(t);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, client ? /*#__PURE__*/React.createElement(ClientScreen, {
    client: client,
    onBack: () => setClient(null)
  }) : tab === "home" ? /*#__PURE__*/React.createElement(OverviewScreen, {
    onOpenClient: showClient,
    onTab: setTab
  }) : tab === "clients" ? /*#__PURE__*/React.createElement(ClientsScreen, {
    onOpenClient: showClient
  }) : tab === "notifs" ? /*#__PURE__*/React.createElement(NotifsScreen, null) : /*#__PURE__*/React.createElement("div", {
    className: "m-screen",
    "data-screen-label": "05 Mobile \xB7 Eu"
  }, /*#__PURE__*/React.createElement("header", {
    className: "m-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Oliveira & Co"), /*#__PURE__*/React.createElement("div", {
    className: "ttl"
  }, "Eu"))), /*#__PURE__*/React.createElement("div", {
    className: "m-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--fg-3)",
      textAlign: "center",
      padding: 40
    }
  }, "Perfil \u2014 placeholder"))), /*#__PURE__*/React.createElement(TabBar, {
    tab: tab,
    onTab: goTab
  }));
};
Object.assign(window, {
  MobileApp,
  OverviewScreen,
  ClientsScreen,
  ClientScreen,
  NotifsScreen,
  TabBar
});
function App(props) {
  return React.createElement(MobileApp, props);
}
Object.assign(__ds_scope, { App });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-mobile/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/bi-mobile/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/bi-mobile/ios-frame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ClientDetail = __ds_scope.ClientDetail;

__ds_ns.ClientDossie = __ds_scope.ClientDossie;

__ds_ns.ClientMeetings = __ds_scope.ClientMeetings;

__ds_ns.ClientTable = __ds_scope.ClientTable;

__ds_ns.Identity = __ds_scope.Identity;

__ds_ns.Overview = __ds_scope.Overview;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.SquadPerformance = __ds_scope.SquadPerformance;

__ds_ns.Topbar = __ds_scope.Topbar;

__ds_ns.App = __ds_scope.App;

})();
