/* ==========================================================================
   features.js — Sizing/Scaling, iCloud Sync Dialog, Palette, Sketch & Export
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const {
    $, $$, uid, clamp, esc, sanitize, stripHtml, selectAllIn,
    DEFAULT_W, DEFAULT_FS, SIZE_PRESETS, TYPE_LABEL, SKETCH_COLORS, ICONS
  } = CS;

  /* ---------- Universal Text/Title Size & Card Preset Scaling ---------- */
  CS.adjustSelectionFontSize = function adjustSelectionFontSize(delta) {
    if (!CS.selection.size) return;
    CS.checkpoint();
    CS.selection.forEach((id) => {
      const el = CS.state.elements[id];
      if (!el) return;
      const cur = el.fontSize || DEFAULT_FS[el.type] || 14;
      el.fontSize = clamp(Math.round(cur + delta), 10, 120);
      const n = CS.nodeOf(id);
      if (n) n.style.setProperty('--card-fs', el.fontSize + 'px');
    });
    CS.updateSelectionUI();
    CS.scheduleLines();
    CS.scheduleSave();
  };

  CS.applySizePreset = function applySizePreset(presetKey) {
    const preset = SIZE_PRESETS[presetKey];
    if (!preset || !CS.selection.size) return;
    CS.checkpoint();
    CS.selection.forEach((id) => {
      const el = CS.state.elements[id];
      if (!el) return;
      const baseW = DEFAULT_W[el.type] || 260;
      const scaleMap = { S: 0.68, M: 1.0, L: 1.45, XL: 2.0 };
      const mult = scaleMap[presetKey] || 1;
      el.w = Math.round(clamp(baseW * mult, 110, 1400));
      if (el.type === 'image' || el.type === 'board' || el.type === 'swatch' || el.type === 'sketch') {
        const baseH = el.type === 'board' ? 116 : el.type === 'swatch' ? 140 : 220;
        el.h = presetKey === 'M' ? null : Math.round(baseH * mult);
      }
      if (el.type === 'heading') {
        el.fontSize = Math.round((DEFAULT_FS.heading || 32) * preset.fsScale);
      }
    });
    CS.render();
    CS.scheduleSave();
    CS.toast(`Applied ${presetKey} size`);
  };

  CS.resetSelectionHeight = function resetSelectionHeight() {
    if (!CS.selection.size) return;
    CS.checkpoint();
    CS.selection.forEach((id) => {
      const el = CS.state.elements[id];
      if (!el) return;
      delete el.h;
      el.fontSize = DEFAULT_FS[el.type] || 14;
    });
    CS.render();
    CS.scheduleSave();
    CS.toast('Reset to auto size');
  };

  CS.toggleSelectedImageFit = function toggleSelectedImageFit() {
    const id = [...CS.selection][0];
    const el = CS.state.elements[id];
    if (!el || el.type !== 'image') return;
    CS.checkpoint();
    el.fit = el.fit === 'contain' ? 'cover' : 'contain';
    if (!el.h) {
      const r = CS.worldRectOf(el.id);
      if (r) el.h = Math.round(r.h);
    }
    CS.render();
    CS.scheduleSave();
  };

  /* ---------- iCloud Drive & Per-Board Storage Center ---------- */
  CS.openStorageModal = async function openStorageModal() {
    const dlg = $('#storage-dialog');
    if (/^https?:/.test(location.protocol)) {
      try {
        const res = await fetch('/api/storage-info', { cache: 'no-store' });
        if (res.ok) {
          const info = await res.json();
          CS.storageMeta.connected = true;
          CS.storageMeta.mode = info.mode || 'iCloud Drive';
          CS.storageMeta.path = info.path || CS.storageMeta.path;
          CS.storageMeta.boards = info.boards || [];
        }
      } catch {}
    }

    $('#storage-path-code').textContent = CS.storageMeta.path;
    $('#storage-mode-sub').textContent = CS.storageMeta.connected
      ? `Connected to ${CS.storageMeta.mode}. Every board is saved automatically as its own file.`
      : 'Running in browser-only mode (IndexedDB). Launch Museo.app for automatic iCloud Drive folder sync.';

    // Collect all boards in current state
    const boards = Object.values(CS.state.elements).filter((e) => e.type === 'board');
    $('#storage-board-count').textContent = String(boards.length);
    $('#storage-boards-list').innerHTML = boards.map((b) => {
      const kids = CS.boardChildren(b.id);
      const title = b.title || (b.id === 'root' ? 'Home' : 'Untitled Board');
      return `<div class="storage-board-item">
        <div class="storage-board-info">
          <div class="storage-board-title">${esc(title)}</div>
          <div class="storage-board-meta">${kids.length} item${kids.length === 1 ? '' : 's'} · ID: ${esc(b.id)}</div>
        </div>
        <div class="storage-board-actions">
          <button class="text-btn" data-open-board="${esc(b.id)}">Open</button>
          <button class="text-btn accent-btn" data-export-board="${esc(b.id)}">Save .json</button>
        </div>
      </div>`;
    }).join('');

    dlg.showModal();
  };

  CS.revealInFinder = async function revealInFinder() {
    if (/^https?:/.test(location.protocol)) {
      try {
        const res = await fetch('/api/reveal-finder', { method: 'POST' });
        if (res.ok) {
          CS.toast('Opened Museo folder in macOS Finder');
          return;
        }
      } catch {}
    }
    CS.toast('Launch Museo.app to open iCloud Drive folder directly in Finder');
  };

  CS.exportSingleBoard = function exportSingleBoard(boardId) {
    const b = CS.state.elements[boardId];
    if (!b) return;
    const kids = CS.boardChildren(boardId);
    const bElements = { [boardId]: b };
    kids.forEach((k) => { bElements[k.id] = k; });
    const bLines = {};
    Object.values(CS.state.lines).forEach((l) => {
      if (l.boardId === boardId) bLines[l.id] = l;
    });
    const bAssets = {};
    Object.values(bElements).forEach((el) => {
      if (el.assetId && CS.state.assets[el.assetId]) bAssets[el.assetId] = CS.state.assets[el.assetId];
    });
    const payload = {
      app: 'museo-board',
      version: 3,
      boardId,
      title: b.title || 'Board',
      exportedAt: new Date().toISOString(),
      data: { board: b, elements: bElements, lines: bLines, assets: bAssets }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (b.title || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `museo-board-${slug}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    CS.toast(`Saved board “${b.title || 'Board'}”`);
  };

  /* ---------- Element Spawning & Focus ---------- */
  CS.addElementAt = function addElementAt(type, at, props = {}, columnTarget = null) {
    if (type === 'line') { CS.setMode('connect'); return null; }
    if (type === 'image') { CS.pendingImageTarget = { at, columnTarget }; $('#image-input').click(); return null; }
    CS.checkpoint();
    const el = CS.createElement(type, props);
    el.x = Math.round(at.x - el.w / 2);
    el.y = Math.round(at.y - 24);
    if (columnTarget) CS.insertIntoColumn(columnTarget.colId, [el.id], columnTarget.index);
    CS.justCreated.add(el.id);
    CS.selection = new Set([el.id]);
    CS.selectedLine = null;
    CS.render();
    CS.scheduleSave();
    if (type === 'sketch' && !props.src) {
      CS.openSketchModal(el.id);
    } else if (type === 'document' && !props.skipOpen) {
      CS.openDocDrawer(el.id);
    } else if (!props.html && !props.url && !props.title) {
      CS.focusNewElement(el);
    }
    return el;
  };

  CS.focusNewElement = function focusNewElement(el) {
    const n = CS.nodeOf(el.id);
    if (!n) return;
    let target = null;
    if (el.type === 'link') target = n.querySelector('.link-input');
    else if (el.type === 'todo') target = n.querySelector('.todo-title');
    else if (el.type === 'comment') target = n.querySelector('.comment-body');
    else if (el.type === 'swatch') target = n.querySelector('.swatch-label');
    else if (el.type !== 'image') target = n.querySelector('.editable');
    if (!target) return;
    target.focus();
    if (el.type === 'board' || el.type === 'column' || el.type === 'swatch' || el.type === 'table') selectAllIn(target);
  };

  /* ---------- Image Processing & Dominant Palette Extractor ---------- */
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  CS.loadImg = function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  };

  async function processImage(file) {
    const url = await fileToDataURL(file);
    if (/gif|svg/.test(file.type)) return url;
    try {
      const img = await CS.loadImg(url);
      const max = 1800;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && file.size < 1.2e6) return url;
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.88);
    } catch { return url; }
  }

  CS.addImageFiles = async function addImageFiles(files, at, columnTarget) {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    CS.toast(files.length > 1 ? `Adding ${files.length} images…` : 'Adding image…');
    CS.checkpoint();
    const ids = [];
    let i = 0;
    for (const f of files) {
      const data = await processImage(f);
      const assetId = uid();
      CS.state.assets[assetId] = data;
      const el = CS.createElement('image', { assetId, caption: '' });
      el.x = Math.round(at.x - el.w / 2 + i * 32);
      el.y = Math.round(at.y - 80 + i * 32);
      CS.justCreated.add(el.id);
      ids.push(el.id);
      i++;
    }
    if (columnTarget) CS.insertIntoColumn(columnTarget.colId, ids, columnTarget.index);
    CS.selection = new Set(ids);
    CS.selectedLine = null;
    CS.render();
    CS.scheduleSave();
  };

  CS.extractPaletteFromSelectedImage = async function extractPaletteFromSelectedImage() {
    const id = [...CS.selection][0];
    const el = CS.state.elements[id];
    if (!el || el.type !== 'image') return;
    const src = CS.imageSrc(el);
    if (!src) return CS.toast('No image source available');
    try {
      const img = await CS.loadImg(src);
      const c = document.createElement('canvas');
      const size = 64;
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = `${r >> 5},${g >> 5},${b >> 5}`;
        const cur = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        cur.count++; cur.r += r; cur.g += g; cur.b += b;
        buckets.set(key, cur);
      }
      const sorted = [...buckets.values()]
        .map((b) => ({
          count: b.count,
          r: Math.round(b.r / b.count),
          g: Math.round(b.g / b.count),
          b: Math.round(b.b / b.count)
        }))
        .sort((a, b) => b.count - a.count);

      const picked = [];
      for (const cand of sorted) {
        if (picked.length >= 5) break;
        const tooClose = picked.some((p) => Math.hypot(p.r - cand.r, p.g - cand.g, p.b - cand.b) < 52);
        if (!tooClose) picked.push(cand);
      }
      while (picked.length < 5 && sorted.length > picked.length) {
        picked.push(sorted[picked.length]);
      }

      CS.checkpoint();
      const rect = CS.worldRectOf(el.id) || { x: el.x, y: el.y, w: el.w || 300, h: 240 };
      const baseX = Math.round(rect.x + rect.w + 28);
      const baseY = Math.round(rect.y);
      const newIds = [];
      picked.forEach((col, idx) => {
        const hex = '#' + [col.r, col.g, col.b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        const sw = CS.createElement('swatch', {
          x: baseX + (idx % 2) * 168,
          y: baseY + Math.floor(idx / 2) * 162,
          w: 152,
          hex,
          title: `Sample 0${idx + 1}`
        });
        CS.justCreated.add(sw.id);
        newIds.push(sw.id);
      });
      CS.selection = new Set(newIds);
      CS.render();
      CS.scheduleSave();
      CS.toast('🎨 Extracted 5 dominant colour swatches!');
    } catch (err) {
      console.error(err);
      CS.toast('Could not extract palette from image');
    }
  };

  /* ---------- Long-Form Document Drawer ---------- */
  CS.openDocDrawer = function openDocDrawer(id) {
    const el = CS.state.elements[id];
    if (!el || el.type !== 'document') return;
    CS.activeDocId = id;
    $('#doc-title-input').value = el.title || '';
    $('#doc-editor').innerHTML = sanitize(el.html || '');
    CS.updateDocWordCount();
    $('#doc-drawer').hidden = false;
    setTimeout(() => $('#doc-editor').focus(), 40);
  };

  CS.closeDocDrawer = function closeDocDrawer() {
    if (!CS.activeDocId) return;
    CS.activeDocId = null;
    $('#doc-drawer').hidden = true;
    CS.render();
  };

  CS.updateDocWordCount = function updateDocWordCount() {
    const txt = stripHtml($('#doc-editor').innerHTML);
    const words = txt ? txt.split(/\s+/).length : 0;
    $('#doc-word-count').textContent = `${words} word${words === 1 ? '' : 's'}`;
  };

  /* ---------- Freehand Sketch Pad Modal ---------- */
  let sketchCtx = null;
  let sketchDrawing = false;
  let sketchColor = '#ffffff';
  let sketchErasing = false;
  let sketchLastPt = null;

  CS.initSketchPad = function initSketchPad() {
    const canvas = $('#sketch-canvas');
    sketchCtx = canvas.getContext('2d');
    const colorsEl = $('#sketch-colors');
    colorsEl.innerHTML = SKETCH_COLORS.map((c, i) => `<button class="sketch-swatch${i === 0 ? ' active' : ''}" data-s-color="${c}" style="background:${c}" aria-label="Brush colour ${c}"></button>`).join('');
    colorsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.sketch-swatch');
      if (!btn) return;
      sketchColor = btn.dataset.sColor;
      sketchErasing = false;
      $('#sketch-eraser').classList.remove('active');
      $$('.sketch-swatch', colorsEl).forEach((b) => b.classList.toggle('active', b === btn));
    });

    $('#sketch-eraser').addEventListener('click', () => {
      sketchErasing = !sketchErasing;
      $('#sketch-eraser').classList.toggle('active', sketchErasing);
    });
    $('#sketch-clear').addEventListener('click', () => {
      sketchCtx.clearRect(0, 0, canvas.width, canvas.height);
    });
    $('#sketch-cancel').addEventListener('click', () => $('#sketch-dialog').close());
    $('#sketch-save').addEventListener('click', CS.saveSketchPad);

    const ptOf = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      sketchDrawing = true;
      sketchLastPt = ptOf(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!sketchDrawing) return;
      const p = ptOf(e);
      sketchCtx.save();
      sketchCtx.lineCap = 'round';
      sketchCtx.lineJoin = 'round';
      sketchCtx.lineWidth = Number($('#sketch-size').value) || 4;
      if (sketchErasing) {
        sketchCtx.globalCompositeOperation = 'destination-out';
        sketchCtx.lineWidth *= 2.5;
      } else {
        sketchCtx.globalCompositeOperation = 'source-over';
        sketchCtx.strokeStyle = sketchColor;
      }
      sketchCtx.beginPath();
      sketchCtx.moveTo(sketchLastPt.x, sketchLastPt.y);
      sketchCtx.lineTo(p.x, p.y);
      sketchCtx.stroke();
      sketchCtx.restore();
      sketchLastPt = p;
    });
    const stop = () => { sketchDrawing = false; sketchLastPt = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  };

  CS.openSketchModal = async function openSketchModal(id) {
    const el = CS.state.elements[id];
    if (!el || el.type !== 'sketch') return;
    CS.activeSketchId = id;
    const canvas = $('#sketch-canvas');
    sketchCtx.clearRect(0, 0, canvas.width, canvas.height);
    sketchColor = CS.state.theme === 'light' ? '#1e1e26' : '#ffffff';
    $$('.sketch-swatch').forEach((b) => b.classList.toggle('active', b.dataset.sColor === sketchColor));
    const src = CS.imageSrc(el);
    if (src) {
      try {
        const img = await CS.loadImg(src);
        sketchCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } catch {}
    }
    $('#sketch-dialog').showModal();
  };

  CS.saveSketchPad = function saveSketchPad() {
    const el = CS.state.elements[CS.activeSketchId];
    if (el) {
      CS.checkpoint();
      const data = $('#sketch-canvas').toDataURL('image/png');
      const assetId = el.assetId || uid();
      CS.state.assets[assetId] = data;
      el.assetId = assetId;
      CS.render();
      CS.scheduleSave();
      CS.toast('Sketch saved to board');
    }
    $('#sketch-dialog').close();
  };

  /* ---------- Table Mutations ---------- */
  CS.mutateSelectedTable = function mutateSelectedTable(fn) {
    const id = [...CS.selection][0];
    const el = CS.state.elements[id];
    if (!el || el.type !== 'table') return;
    CS.checkpoint();
    fn(el);
    CS.render();
    CS.scheduleSave();
  };

  /* ---------- Quick Search / Command Palette (⌘K) ---------- */
  CS.openSearchModal = function openSearchModal() {
    const dlg = $('#search-dialog');
    $('#search-input').value = '';
    CS.renderSearchResults('');
    dlg.showModal();
    setTimeout(() => $('#search-input').focus(), 20);
  };

  CS.renderSearchResults = function renderSearchResults(q) {
    const query = q.trim().toLowerCase();
    const all = Object.values(CS.state.elements).filter((el) => el.id !== 'root');
    const matches = all.filter((el) => {
      if (!query) return true;
      const text = [
        el.title, el.caption, el.url, el.hex, el.author,
        stripHtml(el.html),
        ...(el.items || []).map((i) => i.text),
        ...(el.rows || []).flat()
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(query) || el.type.includes(query);
    }).slice(0, 30);

    const container = $('#search-results');
    if (!matches.length) {
      container.innerHTML = '<div class="search-empty">No matching cards or boards found</div>';
      return;
    }
    container.innerHTML = matches.map((el, idx) => {
      const title = el.title || el.caption || el.hex || stripHtml(el.html) || el.url || TYPE_LABEL[el.type] || 'Untitled';
      const path = CS.boardPathName(el.boardId);
      return `<button class="search-item${idx === 0 ? ' active' : ''}" data-jump-id="${el.id}">
        <div class="search-item-main">
          <div class="search-item-title">${esc(title)}</div>
          <div class="search-item-sub">${esc(path)}</div>
        </div>
        <span class="search-badge">${esc(TYPE_LABEL[el.type] || el.type)}</span>
      </button>`;
    }).join('');
  };

  CS.jumpToElement = function jumpToElement(id) {
    const el = CS.state.elements[id];
    if (!el) return;
    $('#search-dialog').close();
    if (el.type === 'board') {
      CS.openBoard(el.id);
      return;
    }
    if (el.boardId && el.boardId !== CS.currentBoard) {
      CS.openBoard(el.boardId);
    }
    CS.setSelection([el.id]);
    const rect = CS.worldRectOf(el.id) || { x: el.x, y: el.y, w: el.w || 260, h: 120 };
    const vr = $('#viewport').getBoundingClientRect();
    CS.view.x = Math.round(vr.width / 2 - (rect.x + rect.w / 2) * CS.view.zoom);
    CS.view.y = Math.round(vr.height / 2 - (rect.y + rect.h / 2) * CS.view.zoom);
    CS.applyView();
  };

  /* ---------- Board & Selection Actions ---------- */
  CS.deleteSelection = function deleteSelection() {
    if (CS.selectedLine) {
      CS.checkpoint();
      delete CS.state.lines[CS.selectedLine];
      CS.selectedLine = null;
      CS.updateSelectionUI();
      CS.renderLines();
      CS.scheduleSave();
      return;
    }
    if (!CS.selection.size) return;
    CS.checkpoint();
    const n = CS.selection.size;
    [...CS.selection].forEach(CS.deleteElement);
    CS.selection.clear();
    CS.render();
    CS.scheduleSave();
    CS.toast(`Deleted ${n} card${n > 1 ? 's' : ''} — ⌘Z to undo`);
  };

  CS.duplicateSelection = function duplicateSelection() {
    const ids = [...CS.selection].filter((id) => {
      const el = CS.state.elements[id];
      return el && !(el.columnId && CS.selection.has(el.columnId));
    });
    if (!ids.length) return;
    CS.checkpoint();
    const idMap = {};
    const newIds = [];
    let z = CS.maxZ(CS.currentBoard);
    ids.forEach((id) => {
      const src = CS.state.elements[id];
      const copy = CS.cloneElement(id, CS.currentBoard, idMap);
      if (src.columnId) {
        const col = CS.state.elements[src.columnId];
        CS.insertIntoColumn(col.id, [copy.id], col.children.indexOf(id) + 1);
      } else {
        copy.x = src.x + 28;
        copy.y = src.y + 28;
        copy.z = ++z;
      }
      CS.justCreated.add(copy.id);
      newIds.push(copy.id);
    });
    Object.values(CS.state.lines).forEach((l) => {
      const from = idMap[l.from], to = idMap[l.to];
      const boardId = l.boardId === CS.currentBoard ? CS.currentBoard : idMap[l.boardId];
      if (from && to && boardId) {
        const nid = uid();
        CS.state.lines[nid] = { ...l, id: nid, boardId, from, to };
      }
    });
    CS.selection = new Set(newIds);
    CS.render();
    CS.scheduleSave();
  };

  CS.bringToFront = function bringToFront() {
    let z = CS.maxZ(CS.currentBoard);
    CS.checkpoint();
    [...CS.selection].forEach((id) => {
      const el = CS.state.elements[id];
      if (el && !el.columnId) el.z = ++z;
    });
    CS.render();
    CS.scheduleSave();
  };

  CS.setColor = function setColor(color) {
    if (!CS.selection.size) return;
    CS.checkpoint();
    CS.selection.forEach((id) => {
      if (CS.state.elements[id]) CS.state.elements[id].color = color;
    });
    CS.render();
    CS.scheduleSave();
  };

  CS.openBoard = function openBoard(id) {
    if (!CS.state.elements[id] || CS.state.elements[id].type !== 'board') return;
    document.activeElement?.blur?.();
    CS.closeDocDrawer();
    CS.state.views[CS.currentBoard] = { ...CS.view };
    CS.currentBoard = id;
    CS.view = CS.state.views[id] ? { ...CS.state.views[id] } : { x: 140, y: 60, zoom: 1 };
    CS.selection.clear();
    CS.selectedLine = null;
    CS.setMode('select');
    CS.render();
    const cardsLayer = $('#cards-layer');
    cardsLayer.classList.remove('enter');
    void cardsLayer.offsetWidth;
    cardsLayer.classList.add('enter');
    CS.scheduleSave();
  };

  CS.setMode = function setMode(m) {
    CS.mode = m;
    if (CS.connectFrom) CS.nodeOf(CS.connectFrom)?.classList.remove('connect-source');
    CS.connectFrom = null;
    CS.connectPreview = null;
    $('#viewport').classList.toggle('connect-mode', m === 'connect');
    $('#tool-line').classList.toggle('active', m === 'connect');
    if (m === 'connect') CS.toast('Click a card to start the arrow');
    CS.renderLines();
  };

  CS.handleConnectClick = function handleConnectClick(card) {
    if (!card) { CS.setMode('select'); return; }
    const id = card.dataset.id;
    if (!CS.connectFrom) {
      CS.connectFrom = id;
      card.classList.add('connect-source');
      CS.toast('Now click the card to connect to');
    } else if (CS.connectFrom !== id) {
      CS.checkpoint();
      const lid = uid();
      CS.state.lines[lid] = { id: lid, boardId: CS.currentBoard, from: CS.connectFrom, to: id, style: 'solid', dir: 'forward', label: '' };
      CS.selectedLine = lid;
      CS.setMode('select');
      CS.updateSelectionUI();
      CS.scheduleSave();
      CS.toast('Arrow added');
    }
  };

  CS.selectLine = function selectLine(id) {
    CS.selectedLine = id;
    CS.selection.clear();
    CS.updateSelectionUI();
    CS.renderLines();
  };

  CS.promptLineLabel = function promptLineLabel(lineId) {
    const l = CS.state.lines[lineId];
    if (!l) return;
    const val = prompt('Connector label (leave empty to remove):', l.label || '');
    if (val === null) return;
    CS.checkpoint();
    l.label = val.trim();
    CS.renderLines();
    CS.scheduleSave();
  };

  CS.openLightbox = function openLightbox(src) {
    const lb = $('#lightbox');
    lb.querySelector('img').src = src;
    lb.hidden = false;
  };

  CS.applyTheme = function applyTheme(theme) {
    CS.state.theme = theme;
    document.documentElement.dataset.theme = theme;
    $('#btn-theme').innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
  };

  /* ---------- Export Board as PNG Snapshot & JSON Backup ---------- */
  CS.exportBoardPNG = async function exportBoardPNG() {
    const els = CS.topLevel(CS.currentBoard);
    if (!els.length) return CS.toast('Board is empty');
    CS.toast('Rendering PNG snapshot…');
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    els.forEach((e) => {
      const r = CS.worldRectOf(e.id) || { x: e.x, y: e.y, w: e.w || 260, h: 120 };
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    });
    const pad = 48;
    const w = Math.ceil(x2 - x1 + pad * 2);
    const h = Math.ceil(y2 - y1 + pad * 2);
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);

    const isDark = CS.state.theme !== 'light';
    ctx.fillStyle = isDark ? '#0f0f13' : '#f5f1ea';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(40,30,20,0.12)';
    for (let gx = 12; gx < w; gx += 24) {
      for (let gy = 12; gy < h; gy += 24) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }
    }

    for (const el of els) {
      const r = CS.worldRectOf(el.id);
      if (!r) continue;
      const rx = r.x - x1 + pad, ry = r.y - y1 + pad;
      ctx.save();
      if (el.type !== 'heading') {
        ctx.fillStyle = isDark ? '#212128' : '#ffffff';
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rx, ry, r.w, r.h, 12);
        ctx.fill();
        ctx.stroke();
      }
      if (el.type === 'swatch') {
        ctx.fillStyle = el.hex || '#7C5CFF';
        ctx.beginPath();
        ctx.roundRect(rx + 6, ry + 6, r.w - 12, Math.max(60, r.h - 52), 8);
        ctx.fill();
      }
      if ((el.type === 'image' || el.type === 'sketch') && CS.imageSrc(el)) {
        try {
          const img = await CS.loadImg(CS.imageSrc(el));
          ctx.drawImage(img, rx, ry, r.w, r.h - (el.caption ? 28 : 0));
        } catch {}
      }
      ctx.fillStyle = isDark ? '#efeff3' : '#1e1e24';
      const fs = el.fontSize || (el.type === 'heading' ? 28 : 13);
      ctx.font = el.type === 'heading' ? `bold ${fs}px Outfit, sans-serif` : `500 ${fs}px Inter, sans-serif`;
      const label = el.title || el.caption || stripHtml(el.html) || el.url || '';
      if (label) {
        ctx.fillText(label.slice(0, 56), rx + 14, ry + (el.type === 'swatch' ? r.h - 24 : Math.min(r.h - 10, fs + 12)));
      }
      ctx.restore();
    }

    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    const bTitle = (CS.state.elements[CS.currentBoard]?.title || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `museo-${bTitle}.png`;
    a.click();
    CS.toast('PNG board snapshot downloaded');
  };

  CS.exportData = function exportData() {
    const payload = {
      app: 'museo',
      version: 3,
      exportedAt: new Date().toISOString(),
      data: { elements: CS.state.elements, lines: CS.state.lines, assets: CS.state.assets }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `museo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    CS.toast('Workspace backup downloaded');
  };

  CS.importData = async function importData(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      // Support importing a single Board file (app === 'museo-board')
      if (json.app === 'museo-board' && json.data && json.data.elements) {
        CS.checkpoint();
        const idMap = {};
        const oldRootId = json.boardId;
        const pt = CS.spawnPoint();
        const newBoard = CS.createElement('board', {
          x: pt.x, y: pt.y,
          title: json.title || 'Imported Board',
          color: json.data.board?.color || 'violet'
        }, CS.currentBoard);
        idMap[oldRootId] = newBoard.id;

        Object.values(json.data.elements).forEach((el) => {
          if (el.id === oldRootId) return;
          const copy = JSON.parse(JSON.stringify(el));
          copy.id = uid();
          idMap[el.id] = copy.id;
          copy.boardId = newBoard.id;
          CS.state.elements[copy.id] = copy;
        });
        Object.values(CS.state.elements).forEach((el) => {
          if (el.boardId === newBoard.id && el.columnId && idMap[el.columnId]) {
            el.columnId = idMap[el.columnId];
          }
          if (el.boardId === newBoard.id && el.type === 'column' && Array.isArray(el.children)) {
            el.children = el.children.map((c) => idMap[c]).filter(Boolean);
          }
        });
        Object.values(json.data.lines || {}).forEach((l) => {
          if (idMap[l.from] && idMap[l.to]) {
            const lid = uid();
            CS.state.lines[lid] = { ...l, id: lid, boardId: newBoard.id, from: idMap[l.from], to: idMap[l.to] };
          }
        });
        Object.assign(CS.state.assets, json.data.assets || {});
        CS.openBoard(newBoard.id);
        CS.toast(`Imported board “${newBoard.title}”`);
        return;
      }

      const data = json.data || json;
      if (!data.elements || !data.elements.root) throw new Error('Not a Museo backup file');
      if (!confirm('Replace your current workspace with this backup? (You can undo this.)')) return;
      CS.checkpoint();
      CS.state.elements = data.elements;
      CS.state.lines = data.lines || {};
      Object.assign(CS.state.assets, data.assets || {});
      CS.currentBoard = 'root';
      CS.view = { x: 140, y: 60, zoom: 1 };
      CS.selection.clear();
      CS.render();
      CS.scheduleSave();
      CS.toast('Workspace backup imported');
    } catch (err) {
      console.error(err);
      CS.toast('Import failed: ' + err.message);
    }
  };
})();
