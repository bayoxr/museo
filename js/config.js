/* ==========================================================================
   config.js — Constants, Default Sizes, SVG Icons & Pure Utility Helpers
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});

  CS.$ = (s, r = document) => r.querySelector(s);
  CS.$$ = (s, r = document) => [...r.querySelectorAll(s)];

  CS.COLORS = ['none', 'rose', 'amber', 'lime', 'teal', 'sky', 'violet', 'slate'];
  CS.DEFAULT_W = {
    note: 260, heading: 420, todo: 270, link: 280, image: 320,
    swatch: 156, document: 280, table: 380, sketch: 300, comment: 250,
    board: 144, column: 296
  };
  CS.DEFAULT_FS = {
    note: 14, heading: 32, todo: 14, link: 14, image: 13,
    swatch: 14, document: 15, table: 13, sketch: 13, comment: 14,
    board: 14, column: 15
  };
  CS.SIZE_PRESETS = {
    S:  { w: 180, h: null, fsScale: 0.85 },
    M:  { w: 280, h: null, fsScale: 1.0 },
    L:  { w: 420, h: null, fsScale: 1.35 },
    XL: { w: 620, h: null, fsScale: 1.85 }
  };
  CS.TYPE_LABEL = {
    note: 'Note', heading: 'Title', todo: 'To-do', link: 'Link', image: 'Image',
    swatch: 'Swatch', document: 'Document', table: 'Table', sketch: 'Sketch', comment: 'Comment',
    board: 'Board', column: 'Column', line: 'Arrow'
  };
  CS.SWATCH_PRESETS = [
    ['#E07A5F', 'Terracotta'], ['#81B29A', 'Sage Leaf'], ['#F2CC8F', 'Warm Sand'],
    ['#3D405B', 'Deep Indigo'], ['#7C5CFF', 'Electric Violet'], ['#38BDF8', 'Sky Cyan']
  ];
  CS.SKETCH_COLORS = ['#ffffff', '#ff5c7c', '#ffbe3d', '#5cd68d', '#38bdf8', '#7c5cff', '#1e1e26'];
  CS.GRID = 24;

  CS.ICONS = {
    board: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  /* ---------- Pure Utility Functions ---------- */
  CS.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  CS.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  CS.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CS.isEditingTarget = (t) => !!(t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  CS.htmlToNode = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  CS.stripHtml = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'A', 'SPAN', 'CODE', 'BLOCKQUOTE', 'H2', 'H3']);
  CS.sanitize = function sanitize(html) {
    const t = document.createElement('template');
    t.innerHTML = html || '';
    const walk = (node) => {
      [...node.childNodes].forEach((ch) => {
        if (ch.nodeType === 1) {
          if (!ALLOWED_TAGS.has(ch.tagName)) {
            if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(ch.tagName)) { ch.remove(); return; }
            walk(ch); ch.replaceWith(...ch.childNodes); return;
          }
          [...ch.attributes].forEach((a) => {
            if (!(ch.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value))) ch.removeAttribute(a.name);
          });
          walk(ch);
        } else if (ch.nodeType !== 3) ch.remove();
      });
    };
    walk(t.content);
    return t.innerHTML;
  };

  CS.parseUrl = (u) => { try { return new URL(u); } catch { return null; } };
  CS.normalizeUrl = (v) => { v = v.trim(); if (!v) return ''; if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v; return v; };
  CS.safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
  CS.youtubeId = (u) => { const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m && m[1]; };
  CS.hueOf = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  CS.hexToRgbString = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '';
    return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
  };

  /* ---------- Caret & Toast Helpers ---------- */
  CS.placeCaretAtEnd = (ed) => {
    ed.focus();
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  CS.selectAllIn = (ed) => {
    const r = document.createRange(); r.selectNodeContents(ed);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  CS.focusEditableAt = (ed, x, y) => {
    ed.focus();
    let range = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!range && document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
    }
    if (range && ed.contains(range.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
    else CS.placeCaretAtEnd(ed);
  };

  CS.toast = function toast(msg) {
    const t = CS.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2300);
  };
})();
