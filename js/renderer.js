/* ==========================================================================
   renderer.js — Viewport Coordinates, Card DOM Builders, SVG Lines & UI State
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const {
    $, $$, clamp, esc, sanitize, stripHtml, parseUrl, safeHref,
    youtubeId, hueOf, hexToRgbString, GRID, DEFAULT_W, DEFAULT_FS, ICONS
  } = CS;

  CS.nodeOf = (id) => $('#cards-layer')?.querySelector(`.card[data-id="${CSS.escape(id)}"]`);

  /* ---------- Viewport & Coordinate Transforms ---------- */
  CS.applyView = function applyView() {
    const world = $('#world');
    const viewport = $('#viewport');
    world.style.transform = `translate(${CS.view.x}px, ${CS.view.y}px) scale(${CS.view.zoom})`;
    viewport.style.backgroundPosition = `${CS.view.x}px ${CS.view.y}px`;
    viewport.style.backgroundSize = `${GRID * CS.view.zoom}px ${GRID * CS.view.zoom}px`;
    $('#zoom-reset').textContent = Math.round(CS.view.zoom * 100) + '%';
  };

  CS.screenToWorld = function screenToWorld(cx, cy) {
    const r = $('#viewport').getBoundingClientRect();
    return { x: (cx - r.left - CS.view.x) / CS.view.zoom, y: (cy - r.top - CS.view.y) / CS.view.zoom };
  };

  CS.worldRectOf = function worldRectOf(id) {
    const n = CS.nodeOf(id);
    if (!n) return null;
    const r = n.getBoundingClientRect(), vr = $('#viewport').getBoundingClientRect();
    return {
      x: (r.left - vr.left - CS.view.x) / CS.view.zoom,
      y: (r.top - vr.top - CS.view.y) / CS.view.zoom,
      w: r.width / CS.view.zoom,
      h: r.height / CS.view.zoom
    };
  };

  CS.zoomAt = function zoomAt(cx, cy, z) {
    z = clamp(z, 0.15, 3);
    const r = $('#viewport').getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const wx = (px - CS.view.x) / CS.view.zoom, wy = (py - CS.view.y) / CS.view.zoom;
    CS.view.zoom = z;
    CS.view.x = px - wx * z;
    CS.view.y = py - wy * z;
    CS.applyView();
    CS.scheduleViewSave();
  };

  CS.zoomCenter = function zoomCenter(factor) {
    const r = $('#viewport').getBoundingClientRect();
    CS.zoomAt(r.left + r.width / 2, r.top + r.height / 2, CS.view.zoom * factor);
  };

  CS.fitView = function fitView() {
    const els = CS.topLevel(CS.currentBoard);
    if (!els.length) {
      CS.view = { x: 140, y: 60, zoom: 1 };
      CS.applyView();
      return;
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    els.forEach((e) => {
      const n = CS.nodeOf(e.id);
      const w = n ? n.offsetWidth : e.w, h = n ? n.offsetHeight : (e.h || 100);
      x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y);
      x2 = Math.max(x2, e.x + w); y2 = Math.max(y2, e.y + h);
    });
    const r = $('#viewport').getBoundingClientRect();
    const pad = 120;
    const z = clamp(Math.min((r.width - pad * 2) / (x2 - x1), (r.height - pad * 1.5) / (y2 - y1)), 0.15, 1.25);
    CS.view.zoom = z;
    CS.view.x = (r.width - (x2 - x1) * z) / 2 - x1 * z + 40;
    CS.view.y = (r.height - (y2 - y1) * z) / 2 - y1 * z;
    CS.applyView();
    CS.scheduleViewSave();
  };

  let spawnN = 0, lastSpawnKey = '';
  CS.spawnPoint = function spawnPoint() {
    const r = $('#viewport').getBoundingClientRect();
    const key = `${CS.view.x},${CS.view.y},${CS.view.zoom},${CS.currentBoard}`;
    if (key !== lastSpawnKey) { spawnN = 0; lastSpawnKey = key; }
    const p = CS.screenToWorld(r.left + r.width / 2, r.top + r.height / 2 - 80);
    const off = (spawnN++ % 8) * 28;
    return { x: p.x + off, y: p.y + off };
  };

  /* ---------- DOM & SVG Rendering ---------- */
  const resizeObserver = new ResizeObserver(() => CS.scheduleLines());
  let linesRaf = 0;
  CS.scheduleLines = function scheduleLines() {
    if (!linesRaf) linesRaf = requestAnimationFrame(() => { linesRaf = 0; CS.renderLines(); });
  };

  CS.render = function render() {
    const cardsLayer = $('#cards-layer');
    CS.renderBreadcrumbs();
    resizeObserver.disconnect();
    cardsLayer.innerHTML = '';
    const els = CS.topLevel(CS.currentBoard);
    const allBoardEls = CS.boardChildren(CS.currentBoard);
    const frag = document.createDocumentFragment();
    els.forEach((el) => frag.appendChild(CS.renderCard(el)));
    cardsLayer.appendChild(frag);
    CS.justCreated.clear();
    CS.applyView();
    CS.renderLines();
    CS.updateSelectionUI();
    $('#empty-state').hidden = els.length > 0;
    $('#board-stats').textContent = `${allBoardEls.length} item${allBoardEls.length === 1 ? '' : 's'}`;
  };

  CS.renderCard = function renderCard(el, inColumn = false) {
    const n = document.createElement('div');
    n.className = `card card-${el.type} c-${el.color || 'none'}`
      + (inColumn ? ' in-column' : '')
      + (el.h ? ' has-h' : '')
      + (el.fit === 'contain' ? ' fit-contain' : '')
      + (el.resolved ? ' resolved' : '')
      + (CS.selection.has(el.id) ? ' selected' : '')
      + (CS.justCreated.has(el.id) ? ' pop' : '');
    n.dataset.id = el.id;

    const fs = el.fontSize || DEFAULT_FS[el.type] || 14;
    n.style.setProperty('--card-fs', fs + 'px');

    if (!inColumn) {
      n.style.left = el.x + 'px';
      n.style.top = el.y + 'px';
      n.style.zIndex = el.z || 1;
      n.style.width = (el.w || DEFAULT_W[el.type] || 260) + 'px';
      if (el.h) n.style.height = el.h + 'px';
    } else if (el.h) {
      n.style.height = el.h + 'px';
    }

    switch (el.type) {
      case 'note':
        n.innerHTML = `<div class="editable note-body" contenteditable="true" data-field="html" data-placeholder="Type a note… (use - for bullets, > for quote)">${sanitize(el.html)}</div>`;
        break;
      case 'heading':
        n.innerHTML = `<div class="editable heading-body" contenteditable="true" spellcheck="false" data-field="html" data-placeholder="Title">${sanitize(el.html)}</div>`;
        break;
      case 'todo':
        n.innerHTML = CS.todoHTML(el);
        break;
      case 'link':
        n.innerHTML = CS.linkHTML(el);
        break;
      case 'image': {
        const src = CS.imageSrc(el);
        n.innerHTML = `<div class="image-wrap">${src ? `<img src="${esc(src)}" alt="${esc(el.caption || 'Image')}" draggable="false">` : '<div class="image-missing">Image unavailable</div>'}</div>
          <div class="editable image-caption single" contenteditable="true" data-field="caption" data-placeholder="Add a caption…">${esc(el.caption)}</div>`;
        break;
      }
      case 'swatch': {
        const hex = (el.hex || '#7C5CFF').toUpperCase();
        n.innerHTML = `<div class="swatch-chip" style="background:${esc(hex)}" title="Click to pick colour">
            <input type="color" class="swatch-picker-input" value="${esc(hex.slice(0, 7))}" aria-label="Pick swatch colour">
            <button class="swatch-copy-btn" data-copy-hex="${esc(hex)}" title="Copy HEX code">${esc(hex)}</button>
          </div>
          <div class="swatch-info">
            <div class="editable swatch-label single" contenteditable="true" spellcheck="false" data-field="title" data-placeholder="Colour name">${esc(el.title)}</div>
            <div class="swatch-hex-sub">${esc(hex)} · ${esc(hexToRgbString(hex))}</div>
          </div>`;
        break;
      }
      case 'document': {
        const plain = stripHtml(el.html);
        const words = plain ? plain.split(/\s+/).length : 0;
        n.innerHTML = `<div class="doc-card-head">
            <div class="doc-card-icon">${ICONS.doc}</div>
            <div class="doc-card-title-wrap">
              <div class="editable doc-card-title single" contenteditable="true" data-field="title" data-placeholder="Untitled Document">${esc(el.title)}</div>
              <div class="doc-card-meta">${words} word${words === 1 ? '' : 's'} · Double-click to open</div>
            </div>
          </div>
          <div class="doc-card-excerpt">${esc(plain || 'Empty document — double-click to write…')}</div>`;
        break;
      }
      case 'table': {
        const rows = Array.isArray(el.rows) && el.rows.length ? el.rows : [['Column 1', 'Column 2'], ['', '']];
        el.rows = rows;
        const thead = `<thead><tr>${rows[0].map((cell, cIdx) => `<th><div class="editable single" contenteditable="true" data-r="0" data-c="${cIdx}" data-placeholder="Header">${esc(cell)}</div></th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${rows.slice(1).map((row, rIdx) => `<tr>${row.map((cell, cIdx) => `<td><div class="editable single" contenteditable="true" data-r="${rIdx + 1}" data-c="${cIdx}" data-placeholder="—">${esc(cell)}</div></td>`).join('')}</tr>`).join('')}</tbody>`;
        n.innerHTML = `<div class="editable table-title single" contenteditable="true" data-field="title" data-placeholder="Table title">${esc(el.title)}</div>
          <table class="cork-table">${thead}${tbody}</table>`;
        break;
      }
      case 'sketch': {
        const src = CS.imageSrc(el);
        n.innerHTML = `<div class="sketch-preview" title="Double-click to draw">${src ? `<img src="${esc(src)}" alt="Sketch" draggable="false">` : '<div class="sketch-empty">✏️ Double-click to draw on Sketch Pad</div>'}</div>
          <div class="editable sketch-caption single" contenteditable="true" data-field="caption" data-placeholder="Sketch title…">${esc(el.caption)}</div>`;
        break;
      }
      case 'comment': {
        n.innerHTML = `<div class="comment-head">
            <span class="editable comment-author single" contenteditable="true" data-field="author" data-placeholder="Author">${esc(el.author || 'Comment')}</span>
            <button class="comment-resolve" title="Toggle resolved">${el.resolved ? '✓ Resolved' : 'Resolve'}</button>
          </div>
          <div class="editable comment-body" contenteditable="true" data-field="html" data-placeholder="Leave feedback or an annotation…">${sanitize(el.html)}</div>`;
        break;
      }
      case 'board': {
        const kids = CS.boardChildren(el.id);
        const cover = kids.find((c) => c.type === 'image' && CS.imageSrc(c));
        n.innerHTML = `<div class="board-tile${cover ? ' has-cover' : ''}"${cover ? ` style="background-image:url('${esc(CS.imageSrc(cover))}')"` : ''}>${ICONS.board}<span class="board-count">${kids.length}</span></div>
          <div class="editable board-title single" contenteditable="true" spellcheck="false" data-field="title" data-placeholder="Untitled board">${esc(el.title)}</div>`;
        break;
      }
      case 'column': {
        el.children = el.children.filter((c) => CS.state.elements[c]);
        n.innerHTML = `<div class="column-head"><div class="editable column-title single" contenteditable="true" spellcheck="false" data-field="title" data-placeholder="Untitled column">${esc(el.title)}</div><span class="column-count">${el.children.length || ''}</span></div><div class="column-body"></div>`;
        const body = n.querySelector('.column-body');
        if (el.children.length) el.children.forEach((cid) => body.appendChild(CS.renderCard(CS.state.elements[cid], true)));
        else body.innerHTML = '<div class="column-empty">Drag cards here</div>';
        break;
      }
    }

    // Add 2D resize handles to EVERY card (Right, Bottom, Corner)
    if (!inColumn) {
      n.insertAdjacentHTML(
        'beforeend',
        '<div class="resize-handle resize-e" data-dir="e" title="Drag to resize width"></div>'
        + '<div class="resize-handle resize-s" data-dir="s" title="Drag to resize height (double-click to auto-fit)"></div>'
        + '<div class="resize-handle resize-se" data-dir="se" title="Drag corner to resize width & height / scale"></div>'
      );
    } else {
      n.insertAdjacentHTML(
        'beforeend',
        '<div class="resize-handle resize-s" data-dir="s" title="Drag to resize height (double-click to auto-fit)"></div>'
      );
    }

    n.querySelectorAll('.editable').forEach(CS.markEmpty);
    resizeObserver.observe(n);
    return n;
  };

  CS.todoHTML = function todoHTML(el) {
    const filled = el.items.filter((i) => i.text.trim());
    const done = filled.filter((i) => i.done).length;
    return `<div class="todo-head"><div class="editable todo-title single" contenteditable="true" data-field="title" data-placeholder="To-do list">${esc(el.title)}</div><span class="todo-count">${filled.length ? `${done}/${filled.length}` : ''}</span></div>
      <ul class="todo-list">${el.items.map(CS.itemHTML).join('')}</ul>
      <div class="todo-progress"><span style="width:${filled.length ? (done / filled.length) * 100 : 0}%"></span></div>`;
  };

  CS.itemHTML = (it) => `<li class="todo-item${it.done ? ' done' : ''}" data-item="${it.id}"><button class="todo-check" aria-label="Toggle task">${ICONS.check}</button><div class="editable todo-text single" contenteditable="true" data-placeholder="Add a task…">${esc(it.text)}</div></li>`;

  CS.updateTodoMeta = function updateTodoMeta(card, el) {
    const filled = el.items.filter((i) => i.text.trim());
    const done = filled.filter((i) => i.done).length;
    card.querySelector('.todo-count').textContent = filled.length ? `${done}/${filled.length}` : '';
    card.querySelector('.todo-progress span').style.width = (filled.length ? (done / filled.length) * 100 : 0) + '%';
  };

  CS.linkHTML = function linkHTML(el) {
    if (!el.url) return `<div class="link-empty">${ICONS.link}<input class="link-input" type="url" placeholder="Paste a link, then press Enter" aria-label="Link URL"></div>`;
    const u = parseUrl(el.url);
    const host = u ? u.hostname.replace(/^www\./, '') : el.url;
    const yt = youtubeId(el.url);
    const banner = yt
      ? `<div class="link-banner is-video" style="background-image:url('https://img.youtube.com/vi/${yt}/hqdefault.jpg')"><span class="play">▶</span></div>`
      : `<div class="link-banner" style="--h:${hueOf(host)}"><img class="link-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128" alt="" draggable="false"></div>`;
    return `${banner}<div class="link-meta"><div class="editable link-title single" contenteditable="true" data-field="title" data-placeholder="${esc(host)}">${esc(el.title)}</div>
      <div class="link-host"><span>${esc(host)}</span><a class="link-open" href="${esc(safeHref(el.url))}" target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link">${ICONS.open}</a></div></div>`;
  };

  CS.markEmpty = function markEmpty(ed) {
    if (ed && ed.classList) ed.classList.toggle('is-empty', ed.textContent.trim() === '');
  };

  CS.renderBreadcrumbs = function renderBreadcrumbs() {
    const path = [];
    let id = CS.currentBoard;
    while (id) { const b = CS.state.elements[id]; if (!b) break; path.unshift(b); id = b.boardId; }
    $('#breadcrumbs').innerHTML = path.map((b, i) => {
      const label = `${i === 0 ? ICONS.home : ''}${esc(b.title || 'Untitled board')}`;
      return i < path.length - 1
        ? `<button class="crumb" data-board="${b.id}">${label}</button><span class="crumb-sep">›</span>`
        : `<span class="crumb current">${label}</span>`;
    }).join('');
    const cur = path[path.length - 1];
    document.title = CS.currentBoard === 'root' ? 'Museo — Creative visual boards & moodboards for Mac' : `${cur.title || 'Untitled board'} — Museo`;
  };

  function clipToRect(r, toward, pad) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const hw = r.w / 2 + pad, hh = r.h / 2 + pad;
    const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  CS.renderLines = function renderLines() {
    const linesLayer = $('#lines-layer');
    const lines = Object.values(CS.state.lines).filter((l) => l.boardId === CS.currentBoard);
    let out = `<defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head" d="M0,0 L10,5 L0,10 L2.5,5 z"/></marker>
      <marker id="arrow-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head sel" d="M0,0 L10,5 L0,10 L2.5,5 z"/></marker></defs>`;
    const geomFor = (a, b) => {
      const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      const bc = b.w ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : b;
      const dx = bc.x - ac.x, dy = bc.y - ac.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(48, len * 0.12);
      const ctrl = { x: (ac.x + bc.x) / 2 - (dy / len) * off, y: (ac.y + bc.y) / 2 + (dx / len) * off };
      const p1 = clipToRect(a, ctrl, 6);
      const p2 = b.w ? clipToRect(b, ctrl, 8) : bc;
      const mid = {
        x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x,
        y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y
      };
      return {
        d: `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
        mid
      };
    };
    for (const l of lines) {
      const a = CS.worldRectOf(l.from), b = CS.worldRectOf(l.to);
      if (!a || !b) continue;
      const { d, mid } = geomFor(a, b);
      const sel = CS.selectedLine === l.id;
      const styleCls = l.style === 'dashed' ? ' dashed' : l.style === 'dotted' ? ' dotted' : '';
      const dir = l.dir || 'forward';
      const mId = sel ? 'arrow-sel' : 'arrow';
      const mStart = dir === 'both' ? ` marker-start="url(#${mId})"` : '';
      const mEnd = (dir === 'forward' || dir === 'both') ? ` marker-end="url(#${mId})"` : '';
      out += `<path class="line-hit" data-id="${l.id}" d="${d}"/><path class="line${styleCls}${sel ? ' selected' : ''}" d="${d}"${mStart}${mEnd}/>`;
      if (l.label) {
        const w = Math.max(44, l.label.length * 7 + 16);
        out += `<g class="line-label-group" data-line-id="${l.id}">
          <rect class="line-label-bg${sel ? ' sel' : ''}" x="${(mid.x - w / 2).toFixed(1)}" y="${(mid.y - 11).toFixed(1)}" width="${w}" height="22"/>
          <text class="line-label-text" data-line-id="${l.id}" x="${mid.x.toFixed(1)}" y="${mid.y.toFixed(1)}">${esc(l.label)}</text>
        </g>`;
      }
    }
    if (CS.mode === 'connect' && CS.connectFrom && CS.connectPreview) {
      const a = CS.worldRectOf(CS.connectFrom);
      if (a) out += `<path class="line preview" d="${geomFor(a, CS.connectPreview).d}" marker-end="url(#arrow-sel)"/>`;
    }
    linesLayer.innerHTML = out;
  };

  CS.updateSelectionUI = function updateSelectionUI() {
    const cardsLayer = $('#cards-layer');
    const formatBar = $('#format-bar');
    $$('.card.selected', cardsLayer).forEach((n) => { if (!CS.selection.has(n.dataset.id)) n.classList.remove('selected'); });
    CS.selection.forEach((id) => CS.nodeOf(id)?.classList.add('selected'));
    const show = CS.selection.size > 0 || !!CS.selectedLine;
    formatBar.hidden = !show;
    const isLine = !!CS.selectedLine && !CS.selection.size;
    formatBar.classList.toggle('line-mode', isLine);

    const selEls = [...CS.selection].map((id) => CS.state.elements[id]).filter(Boolean);
    const single = selEls.length === 1 ? selEls[0] : null;
    const first = selEls[0] || null;

    if (first) {
      const fs = first.fontSize || DEFAULT_FS[first.type] || 14;
      $('#fb-font-readout').textContent = `${Math.round(fs)}px`;
    }

    $('#fb-image-group').hidden = !(single && single.type === 'image');
    if (single && single.type === 'image') {
      $('#fb-img-fit').textContent = `📐 Fit: ${single.fit === 'contain' ? 'Contain' : 'Cover'}`;
    }
    $('#fb-table-group').hidden = !(single && single.type === 'table');
    $('#fb-sketch-group').hidden = !(single && single.type === 'sketch');
    $('#fb-doc-group').hidden = !(single && single.type === 'document');
    $('#fb-line-group').hidden = !isLine;

    if (isLine && CS.state.lines[CS.selectedLine]) {
      const l = CS.state.lines[CS.selectedLine];
      const st = l.style || 'solid';
      const dir = l.dir || 'forward';
      $('#fb-line-style').textContent = `Style: ${st[0].toUpperCase() + st.slice(1)}`;
      $('#fb-line-dir').textContent = `Arrow: ${dir === 'forward' ? '→' : dir === 'both' ? '↔' : '—'}`;
    }

    const colors = new Set(selEls.map((e) => e.color || 'none'));
    $$('.swatch', formatBar).forEach((s) => s.classList.toggle('active', colors.size === 1 && colors.has(s.dataset.color)));
  };

  CS.setSelection = function setSelection(ids) {
    CS.selection = new Set(ids);
    if (CS.selection.size) CS.selectedLine = null;
    CS.updateSelectionUI();
    CS.renderLines();
  };
})();
