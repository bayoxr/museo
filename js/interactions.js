/* ==========================================================================
   interactions.js — 2D Resizing, Snap Guides, Drop Targets & Shortcuts
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const {
    $, $$, uid, clamp, esc, isEditingTarget, htmlToNode,
    parseUrl, normalizeUrl, hexToRgbString, placeCaretAtEnd, focusEditableAt,
    COLORS, DEFAULT_FS, TYPE_LABEL, GRID
  } = CS;

  /* ---------- Smart Alignment Snap Guides ---------- */
  CS.clearGuides = () => { $('#guides-layer').innerHTML = ''; };

  CS.computeSmartSnap = function computeSmartSnap(movingIds, rawX, rawY, w, h) {
    CS.clearGuides();
    if (!CS.snapEnabled) return { x: Math.round(rawX), y: Math.round(rawY) };
    const others = CS.topLevel(CS.currentBoard).filter((e) => !movingIds.has(e.id));
    const THRESH = 5;
    let snappedX = rawX, snappedY = rawY;
    let guideX = null, guideY = null;

    const myXs = [rawX, rawX + w / 2, rawX + w];
    const myYs = [rawY, rawY + h / 2, rawY + h];

    for (const o of others) {
      const n = CS.nodeOf(o.id);
      const ow = n ? n.offsetWidth : (o.w || 260);
      const oh = n ? n.offsetHeight : (o.h || 100);
      const oXs = [o.x, o.x + ow / 2, o.x + ow];
      const oYs = [o.y, o.y + oh / 2, o.y + oh];

      if (guideX === null) {
        for (const mx of myXs) {
          for (const ox of oXs) {
            if (Math.abs(mx - ox) <= THRESH) {
              snappedX = rawX + (ox - mx);
              guideX = { x: ox, y1: Math.min(rawY, o.y) - 24, y2: Math.max(rawY + h, o.y + oh) + 24 };
              break;
            }
          }
          if (guideX) break;
        }
      }
      if (guideY === null) {
        for (const my of myYs) {
          for (const oy of oYs) {
            if (Math.abs(my - oy) <= THRESH) {
              snappedY = rawY + (oy - my);
              guideY = { y: oy, x1: Math.min(rawX, o.x) - 24, x2: Math.max(rawX + w, o.x + ow) + 24 };
              break;
            }
          }
          if (guideY) break;
        }
      }
    }

    let html = '';
    if (guideX) html += `<div class="align-guide v" style="left:${guideX.x}px;top:${guideX.y1}px;height:${guideX.y2 - guideX.y1}px"></div>`;
    if (guideY) html += `<div class="align-guide h" style="top:${guideY.y}px;left:${guideY.x1}px;width:${guideY.x2 - guideY.x1}px"></div>`;
    $('#guides-layer').innerHTML = html;

    return { x: Math.round(snappedX), y: Math.round(snappedY) };
  };

  /* ---------- Drop Target Detection (Columns & Nested Boards) ---------- */
  CS.clearDropTargets = function clearDropTargets() {
    $$('.drop-indicator').forEach((n) => n.remove());
    $$('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  };

  CS.findDropTarget = function findDropTarget(cx, cy, allowColumn, allowBoard) {
    CS.clearDropTargets();
    const viewport = $('#viewport');
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !viewport.contains(hit)) return null;
    const boardNode = allowBoard && hit.closest('.card-board');
    if (boardNode && !boardNode.classList.contains('dragging')) {
      boardNode.classList.add('drop-target');
      return { boardId: boardNode.dataset.id };
    }
    const colNode = allowColumn && hit.closest('.card-column');
    if (!colNode || colNode.classList.contains('dragging')) return null;
    const body = colNode.querySelector('.column-body');
    const kids = [...body.children].filter((n) => n.classList.contains('card') && !n.classList.contains('dragging'));
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (cy < r.top + r.height / 2) { index = i; break; }
    }
    colNode.classList.add('drop-target');
    const ind = document.createElement('div');
    ind.className = 'drop-indicator';
    const empty = body.querySelector('.column-empty');
    if (empty) empty.before(ind);
    else body.insertBefore(ind, kids[index] || null);
    return { colId: colNode.dataset.id, index };
  };

  /* ---------- Pointer Gestures & 2D Resizing ---------- */
  function onViewportPointerDown(e) {
    if (e.button === 2) return;
    const card = e.target.closest('.card');
    if (e.button === 1 || CS.spaceDown) { startPan(e); return; }
    const handle = e.target.closest('.resize-handle');
    if (handle && card) { startResize(e, card, handle.dataset.dir || 'e'); return; }
    const lbl = e.target.closest('[data-line-id]');
    if (lbl) { e.preventDefault(); CS.selectLine(lbl.dataset.lineId); CS.promptLineLabel(lbl.dataset.lineId); return; }
    const hit = e.target.closest('.line-hit');
    if (hit) { e.preventDefault(); CS.selectLine(hit.dataset.id); return; }
    if (CS.mode === 'connect') { e.preventDefault(); CS.handleConnectClick(card); return; }
    if (card) { startCardPointer(e, card); return; }
    const ae = document.activeElement;
    if (ae && ae !== document.body) ae.blur();
    startMarquee(e);
  }

  function startCardPointer(e, card) {
    const id = card.dataset.id;
    const el = CS.state.elements[id];
    const editable = e.target.closest('.editable');
    if (editable && editable === document.activeElement) return;
    if (e.target.closest('input, button, a')) {
      if (!CS.selection.has(id)) CS.setSelection([id]);
      return;
    }
    e.preventDefault();
    const ae = document.activeElement;
    if (ae && ae !== document.body && !card.contains(ae)) ae.blur();
    const wasSelected = CS.selection.has(id);
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const s = new Set(CS.selection);
      s.has(id) ? s.delete(id) : s.add(id);
      CS.setSelection(s);
      if (!s.has(id)) return;
    } else if (!wasSelected) CS.setSelection([id]);
    let editTarget = editable;
    if ((el.type === 'board' || el.type === 'document') && !wasSelected) editTarget = null;
    if (e.shiftKey || e.metaKey || e.ctrlKey) editTarget = null;
    CS.drag = { type: 'card', startX: e.clientX, startY: e.clientY, moved: false, id, editTarget };
  }

  function beginCardDrag() {
    CS.drag.moved = true;
    CS.checkpoint();
    let ids = [...CS.selection].filter((id) => CS.state.elements[id] && CS.state.elements[id].boardId === CS.currentBoard);
    ids = ids.filter((id) => { const el = CS.state.elements[id]; return !(el.columnId && CS.selection.has(el.columnId)); });
    let detached = false;
    ids.forEach((id) => {
      const el = CS.state.elements[id];
      if (el.columnId) {
        const r = CS.worldRectOf(id);
        if (r) { el.x = Math.round(r.x); el.y = Math.round(r.y); el.w = Math.round(r.w); }
        CS.removeFromColumn(id);
        detached = true;
      }
    });
    let z = CS.maxZ(CS.currentBoard);
    ids.forEach((id) => { CS.state.elements[id].z = ++z; });
    if (detached) CS.render();
    else ids.forEach((id) => { const n = CS.nodeOf(id); if (n) n.style.zIndex = CS.state.elements[id].z; });
    CS.drag.items = ids.map((id) => {
      const n = CS.nodeOf(id);
      return { id, x0: CS.state.elements[id].x, y0: CS.state.elements[id].y, w: n ? n.offsetWidth : 260, h: n ? n.offsetHeight : 100 };
    });
    CS.drag.movingSet = new Set(ids);
    CS.drag.hasColumn = ids.some((id) => CS.state.elements[id].type === 'column');
    ids.forEach((id) => CS.nodeOf(id)?.classList.add('dragging'));
    document.body.classList.add('is-dragging');
  }

  function startPan(e) {
    e.preventDefault();
    CS.drag = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: CS.view.x, vy: CS.view.y };
    $('#viewport').classList.add('panning');
  }

  function startResize(e, card, dir) {
    e.preventDefault();
    e.stopPropagation();
    const el = CS.state.elements[card.dataset.id];
    CS.checkpoint();
    const w0 = el.w || card.offsetWidth / CS.view.zoom;
    const h0 = el.h || card.offsetHeight / CS.view.zoom;
    const fs0 = el.fontSize || DEFAULT_FS[el.type] || 14;
    CS.drag = {
      type: 'resize',
      dir,
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      w0,
      h0,
      fs0
    };
    CS.setSelection([el.id]);
  }

  function startMarquee(e) {
    const base = e.shiftKey ? new Set(CS.selection) : new Set();
    if (!e.shiftKey) {
      CS.selection.clear();
      CS.selectedLine = null;
      CS.updateSelectionUI();
      CS.renderLines();
    }
    CS.drag = { type: 'marquee', startX: e.clientX, startY: e.clientY, base, moved: false };
  }

  function onPointerMove(e) {
    if (!CS.drag) {
      if (CS.mode === 'connect' && CS.connectFrom) {
        CS.connectPreview = CS.screenToWorld(e.clientX, e.clientY);
        CS.scheduleLines();
      }
      return;
    }
    const d = CS.drag;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    switch (d.type) {
      case 'pan':
        CS.view.x = d.vx + dx;
        CS.view.y = d.vy + dy;
        CS.applyView();
        break;
      case 'card': {
        if (!d.moved) { if (Math.hypot(dx, dy) < 4) return; beginCardDrag(); }
        let zx = dx / CS.view.zoom, zy = dy / CS.view.zoom;
        if (d.items.length === 1) {
          const lead = d.items[0];
          const snapped = CS.computeSmartSnap(d.movingSet, lead.x0 + zx, lead.y0 + zy, lead.w, lead.h);
          zx = snapped.x - lead.x0;
          zy = snapped.y - lead.y0;
        }
        d.items.forEach((it) => {
          const el = CS.state.elements[it.id];
          el.x = Math.round(it.x0 + zx);
          el.y = Math.round(it.y0 + zy);
          const n = CS.nodeOf(it.id);
          if (n) { n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; }
        });
        CS.renderLines();
        d.drop = CS.findDropTarget(e.clientX, e.clientY, !d.hasColumn, true);
        break;
      }
      case 'resize': {
        const el = CS.state.elements[d.id];
        const n = CS.nodeOf(d.id);
        const minW = el.type === 'board' || el.type === 'swatch' ? 100 : el.type === 'heading' ? 110 : 140;
        const minH = el.type === 'heading' ? 36 : 64;
        const dw = dx / CS.view.zoom;
        const dh = dy / CS.view.zoom;

        if (d.dir === 'e' || d.dir === 'se') {
          el.w = Math.round(clamp(d.w0 + dw, minW, 1800));
          if (n) n.style.width = el.w + 'px';
        }
        if (d.dir === 's' || d.dir === 'se') {
          if (el.type === 'heading') {
            // Dragging corner or bottom on a Title/Heading smoothly scales its font size!
            const deltaFs = d.dir === 'se' ? (dw * 0.08 + dh * 0.35) : dh * 0.45;
            el.fontSize = Math.round(clamp(d.fs0 + deltaFs, 12, 120));
            if (n) n.style.setProperty('--card-fs', el.fontSize + 'px');
            CS.updateSelectionUI();
          } else {
            el.h = Math.round(clamp(d.h0 + dh, minH, 1600));
            if (n) {
              n.style.height = el.h + 'px';
              n.classList.add('has-h');
            }
          }
        }
        CS.scheduleLines();
        break;
      }
      case 'marquee': {
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        const marqueeEl = $('#marquee');
        const vr = $('#viewport').getBoundingClientRect();
        const x1 = Math.min(e.clientX, d.startX), y1 = Math.min(e.clientY, d.startY);
        const x2 = Math.max(e.clientX, d.startX), y2 = Math.max(e.clientY, d.startY);
        Object.assign(marqueeEl.style, { left: x1 - vr.left + 'px', top: y1 - vr.top + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
        marqueeEl.hidden = false;
        const hits = new Set(d.base);
        $$(':scope > .card', $('#cards-layer')).forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) hits.add(n.dataset.id);
        });
        CS.selection = hits;
        CS.updateSelectionUI();
        break;
      }
      case 'tool': {
        if (!d.moved) {
          if (Math.hypot(dx, dy) < 5) return;
          d.moved = true;
          d.ghost = htmlToNode(`<div class="tool-ghost">${d.btn.querySelector('svg').outerHTML}${TYPE_LABEL[d.tool]}</div>`);
          document.body.appendChild(d.ghost);
          document.body.classList.add('is-dragging');
        }
        d.ghost.style.left = e.clientX + 'px';
        d.ghost.style.top = e.clientY + 'px';
        const canNest = !['column', 'line'].includes(d.tool);
        d.drop = CS.findDropTarget(e.clientX, e.clientY, canNest, false);
        break;
      }
    }
  }

  function onPointerUp(e) {
    if (!CS.drag) return;
    const d = CS.drag;
    CS.drag = null;
    document.body.classList.remove('is-dragging');
    CS.clearDropTargets();
    CS.clearGuides();
    switch (d.type) {
      case 'pan':
        $('#viewport').classList.remove('panning');
        CS.scheduleViewSave();
        break;
      case 'card':
        if (!d.moved) {
          if (d.editTarget) {
            const el = CS.state.elements[d.id];
            if (el?.type === 'board' || el?.type === 'document') {
              clearTimeout(CS.boardFocusTimer);
              CS.boardFocusTimer = setTimeout(() => focusEditableAt(d.editTarget, e.clientX, e.clientY), 260);
            } else focusEditableAt(d.editTarget, e.clientX, e.clientY);
          }
          return;
        }
        $$('.dragging').forEach((n) => n.classList.remove('dragging'));
        if (d.drop?.boardId) {
          const ids = d.items.map((i) => i.id);
          const target = CS.state.elements[d.drop.boardId];
          CS.moveToBoard(ids, d.drop.boardId);
          CS.selection.clear();
          CS.render();
          CS.toast(`Moved to “${target.title || 'Untitled board'}”`);
        } else if (d.drop?.colId) {
          const ids = d.items.map((i) => i.id).sort((a, b) => CS.state.elements[a].y - CS.state.elements[b].y);
          CS.insertIntoColumn(d.drop.colId, ids, d.drop.index);
          CS.render();
        }
        CS.scheduleSave();
        break;
      case 'resize':
        CS.renderLines();
        CS.scheduleSave();
        break;
      case 'marquee':
        $('#marquee').hidden = true;
        CS.selectedLine = null;
        CS.updateSelectionUI();
        break;
      case 'tool': {
        d.ghost?.remove();
        if (!d.moved) { CS.addElementAt(d.tool, CS.spawnPoint()); return; }
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (!hit || !$('#viewport').contains(hit)) return;
        CS.addElementAt(d.tool, CS.screenToWorld(e.clientX, e.clientY), {}, d.drop?.colId ? d.drop : null);
        break;
      }
    }
  }

  /* ---------- Inline Card Helpers (Links & To-dos) ---------- */
  function commitLinkInput(input) {
    const card = input.closest('.card');
    const el = card && CS.state.elements[card.dataset.id];
    if (!el || el.url) return;
    const url = normalizeUrl(input.value);
    if (!url) return;
    if (!parseUrl(url)) { CS.toast('That doesn’t look like a valid link'); return; }
    CS.checkpoint();
    el.url = url;
    CS.render();
    CS.scheduleSave();
  }

  function addTodoItemAfter(card, el, item) {
    CS.checkpoint();
    const idx = el.items.findIndex((i) => i.id === item.dataset.item);
    const ni = { id: uid(), text: '', done: false };
    el.items.splice(idx + 1, 0, ni);
    const li = htmlToNode(CS.itemHTML(ni));
    item.after(li);
    const ed = li.querySelector('.editable');
    CS.markEmpty(ed);
    ed.focus();
    CS.pendingEditCheckpoint = false;
    CS.updateTodoMeta(card, el);
    CS.scheduleSave();
  }

  function removeTodoItem(card, el, item) {
    CS.checkpoint();
    const prev = item.previousElementSibling || item.nextElementSibling;
    el.items = el.items.filter((i) => i.id !== item.dataset.item);
    item.remove();
    if (prev) placeCaretAtEnd(prev.querySelector('.editable'));
    CS.pendingEditCheckpoint = false;
    CS.updateTodoMeta(card, el);
    CS.scheduleSave();
  }

  /* ---------- Global Keyboard Shortcuts ---------- */
  function onKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;
    const editing = isEditingTarget(e.target);
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      CS.openSearchModal();
      return;
    }
    if (mod && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      CS.adjustSelectionFontSize(e.key === ']' ? 2 : -2);
      return;
    }
    if (!$('#doc-drawer').hidden && e.key === 'Escape') { CS.closeDocDrawer(); return; }
    if (!$('#lightbox').hidden && e.key === 'Escape') { $('#lightbox').hidden = true; return; }
    if ($('#help-dialog').open || $('#search-dialog').open || $('#templates-dialog').open || $('#sketch-dialog').open || $('#storage-dialog').open) return;
    if (editing) return;
    const k = e.key.toLowerCase();

    if (e.code === 'Space') {
      e.preventDefault();
      if (!CS.spaceDown) { CS.spaceDown = true; $('#viewport').classList.add('space-pan'); }
      return;
    }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? CS.redo() : CS.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); CS.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); CS.duplicateSelection(); return; }
    if (mod && k === 'a') { e.preventDefault(); CS.setSelection(CS.topLevel(CS.currentBoard).map((el) => el.id)); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); CS.zoomCenter(1.2); return; }
    if (mod && k === '-') { e.preventDefault(); CS.zoomCenter(1 / 1.2); return; }
    if (mod && k === '0') { e.preventDefault(); CS.zoomCenter(1 / CS.view.zoom); return; }
    if (mod) return;

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); CS.deleteSelection(); return; }
    if (e.key === 'Escape') {
      if (CS.mode === 'connect') CS.setMode('select');
      else { CS.selection.clear(); CS.selectedLine = null; CS.updateSelectionUI(); CS.renderLines(); }
      return;
    }
    if (e.key === 'Enter' && CS.selection.size === 1) {
      e.preventDefault();
      const el = CS.state.elements[[...CS.selection][0]];
      if (el.type === 'board') CS.openBoard(el.id);
      else if (el.type === 'document') CS.openDocDrawer(el.id);
      else if (el.type === 'sketch') CS.openSketchModal(el.id);
      else { const n = CS.nodeOf(el.id); const ed = n?.querySelector('.editable'); if (ed) placeCaretAtEnd(ed); }
      return;
    }
    if (e.key.startsWith('Arrow') && CS.selection.size) {
      e.preventDefault();
      if (!e.repeat) CS.checkpoint();
      const step = e.shiftKey ? GRID : 2;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      CS.selection.forEach((id) => {
        const el = CS.state.elements[id];
        if (!el || el.columnId) return;
        el.x += dx; el.y += dy;
        const n = CS.nodeOf(id);
        if (n) { n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; }
      });
      CS.renderLines();
      CS.scheduleSave();
      return;
    }
    if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) { CS.fitView(); return; }
    if (e.key === '?') { $('#help-dialog').showModal(); return; }
    const map = {
      n: 'note', h: 'heading', t: 'todo', l: 'link', i: 'image',
      s: 'swatch', d: 'document', m: 'table', k: 'sketch', o: 'comment',
      b: 'board', c: 'column', a: 'line'
    };
    if (map[k] && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      CS.addElementAt(map[k], CS.spawnPoint());
    }
  }

  /* ---------- Event Binding ---------- */
  CS.bindEvents = function bindEvents() {
    const viewport = $('#viewport');
    const cardsLayer = $('#cards-layer');
    const toolbar = $('#toolbar');

    viewport.addEventListener('pointerdown', onViewportPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) CS.zoomAt(e.clientX, e.clientY, CS.view.zoom * Math.exp(-e.deltaY * 0.01));
      else { CS.view.x -= e.deltaX; CS.view.y -= e.deltaY; CS.applyView(); CS.scheduleViewSave(); }
    }, { passive: false });

    viewport.addEventListener('dblclick', (e) => {
      const handle = e.target.closest('.resize-handle');
      if (handle) {
        e.stopPropagation();
        CS.resetSelectionHeight();
        return;
      }
      const card = e.target.closest('.card');
      if (card) {
        const el = CS.state.elements[card.dataset.id];
        if (el?.type === 'board') { clearTimeout(CS.boardFocusTimer); CS.openBoard(el.id); }
        else if (el?.type === 'document') { clearTimeout(CS.boardFocusTimer); CS.openDocDrawer(el.id); }
        else if (el?.type === 'sketch' && !e.target.closest('.editable')) { CS.openSketchModal(el.id); }
        else if (el?.type === 'image' && CS.imageSrc(el) && !e.target.closest('.editable')) CS.openLightbox(CS.imageSrc(el));
        return;
      }
      if (e.target.closest('.line-hit') || CS.mode === 'connect' || e.target.closest('.empty-tpl-btn')) return;
      CS.addElementAt('note', CS.screenToWorld(e.clientX, e.clientY + 24));
    });

    $('#empty-templates').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tpl]');
      if (!btn) return;
      CS.checkpoint();
      CS.populateTemplate(btn.dataset.tpl, CS.currentBoard);
      CS.render();
      CS.fitView();
      CS.scheduleSave();
      CS.toast('Template applied to board');
    });

    toolbar.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (!btn || e.button !== 0) return;
      e.preventDefault();
      CS.drag = { type: 'tool', tool: btn.dataset.tool, btn, startX: e.clientX, startY: e.clientY, moved: false };
    });

    cardsLayer.addEventListener('focusin', (e) => {
      if (e.target.closest('.editable')) {
        CS.pendingEditCheckpoint = true;
        e.target.closest('.card')?.classList.add('editing');
      }
    });

    cardsLayer.addEventListener('focusout', (e) => {
      const card = e.target.closest('.card');
      if (e.target.classList.contains('link-input')) { commitLinkInput(e.target); return; }
      if (!e.target.closest('.editable') || !card) return;
      card.classList.remove('editing');
      const id = card.dataset.id;
      setTimeout(() => {
        const el = CS.state.elements[id];
        if (!el || CS.drag || !['note', 'heading'].includes(el.type)) return;
        if (card.contains(document.activeElement)) return;
        const txt = (el.html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
        const hasLines = Object.values(CS.state.lines).some((l) => l.from === id || l.to === id);
        if (!txt && !hasLines) {
          CS.deleteElement(id);
          CS.selection.delete(id);
          CS.render();
          CS.scheduleSave();
        }
      }, 0);
    });

    cardsLayer.addEventListener('input', (e) => {
      if (e.target.classList.contains('swatch-picker-input')) {
        const card = e.target.closest('.card');
        const el = CS.state.elements[card?.dataset.id];
        if (!el) return;
        el.hex = e.target.value.toUpperCase();
        card.querySelector('.swatch-chip').style.background = el.hex;
        card.querySelector('.swatch-copy-btn').textContent = el.hex;
        card.querySelector('.swatch-copy-btn').dataset.copyHex = el.hex;
        card.querySelector('.swatch-hex-sub').textContent = `${el.hex} · ${hexToRgbString(el.hex)}`;
        CS.scheduleSave();
        return;
      }

      const ed = e.target.closest('.editable');
      if (!ed) return;
      const card = ed.closest('.card');
      const el = CS.state.elements[card?.dataset.id];
      if (!el) return;
      if (CS.pendingEditCheckpoint) {
        CS.checkpoint();
        CS.pendingEditCheckpoint = false;
      }

      if (el.type === 'note' && ed.dataset.field === 'html') {
        const plain = ed.textContent;
        if (plain === '- ' || plain === '* ') {
          ed.innerHTML = '';
          document.execCommand('insertUnorderedList');
        } else if (plain === '1. ') {
          ed.innerHTML = '';
          document.execCommand('insertOrderedList');
        } else if (plain === '> ') {
          ed.innerHTML = '';
          document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        }
      }

      const item = ed.closest('.todo-item');
      if (item) {
        const it = el.items.find((i) => i.id === item.dataset.item);
        if (it) it.text = ed.textContent;
        CS.updateTodoMeta(card, el);
      } else if (ed.dataset.r !== undefined && ed.dataset.c !== undefined) {
        const r = Number(ed.dataset.r), c = Number(ed.dataset.c);
        if (el.rows && el.rows[r]) el.rows[r][c] = ed.textContent;
      } else if (ed.dataset.field === 'html') {
        el.html = ed.innerHTML;
      } else if (ed.dataset.field) {
        el[ed.dataset.field] = ed.textContent;
      }
      CS.markEmpty(ed);
      CS.scheduleSave();
    });

    cardsLayer.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('link-input')) {
        if (e.key === 'Enter') { e.preventDefault(); commitLinkInput(e.target); }
        if (e.key === 'Escape') e.target.blur();
        e.stopPropagation();
        return;
      }
      const ed = e.target.closest('.editable');
      if (!ed) return;
      const card = ed.closest('.card');
      const el = CS.state.elements[card.dataset.id];
      if (e.key === 'Escape') { e.stopPropagation(); ed.blur(); CS.setSelection([el.id]); return; }
      const item = ed.closest('.todo-item');
      if (item && e.key === 'Enter') { e.preventDefault(); addTodoItemAfter(card, el, item); return; }
      if (item && e.key === 'Backspace' && ed.textContent === '' && el.items.length > 1) { e.preventDefault(); removeTodoItem(card, el, item); return; }
      if (item && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const sib = e.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
        if (sib) { e.preventDefault(); placeCaretAtEnd(sib.querySelector('.editable')); }
        return;
      }
      if (ed.classList.contains('todo-title') && e.key === 'Enter') { e.preventDefault(); placeCaretAtEnd(card.querySelector('.todo-text')); return; }
      if (ed.classList.contains('single') && e.key === 'Enter') { e.preventDefault(); ed.blur(); CS.setSelection([el.id]); }
    });

    cardsLayer.addEventListener('click', (e) => {
      const chk = e.target.closest('.todo-check');
      if (chk) {
        const card = chk.closest('.card');
        const el = CS.state.elements[card.dataset.id];
        const item = chk.closest('.todo-item');
        const it = el.items.find((i) => i.id === item.dataset.item);
        if (!it) return;
        CS.checkpoint();
        it.done = !it.done;
        item.classList.toggle('done', it.done);
        CS.updateTodoMeta(card, el);
        CS.scheduleSave();
        return;
      }
      const copyBtn = e.target.closest('[data-copy-hex]');
      if (copyBtn) {
        e.stopPropagation();
        const hex = copyBtn.dataset.copyHex;
        navigator.clipboard?.writeText(hex);
        CS.toast(`Copied ${hex} to clipboard`);
        return;
      }
      const resBtn = e.target.closest('.comment-resolve');
      if (resBtn) {
        const card = resBtn.closest('.card');
        const el = CS.state.elements[card.dataset.id];
        if (!el) return;
        CS.checkpoint();
        el.resolved = !el.resolved;
        CS.render();
        CS.scheduleSave();
      }
    });

    $('#doc-close').addEventListener('click', CS.closeDocDrawer);
    $('#doc-title-input').addEventListener('input', (e) => {
      const el = CS.state.elements[CS.activeDocId];
      if (!el) return;
      el.title = e.target.value;
      CS.scheduleSave();
    });
    $('#doc-editor').addEventListener('input', () => {
      const el = CS.state.elements[CS.activeDocId];
      if (!el) return;
      el.html = $('#doc-editor').innerHTML;
      CS.updateDocWordCount();
      CS.scheduleSave();
    });
    $$('.doc-cmd').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
        $('#doc-editor').dispatchEvent(new Event('input'));
      });
    });

    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (isEditingTarget(t)) {
        if (t.closest?.('.editable') || t.id === 'doc-editor') {
          e.preventDefault();
          let text = e.clipboardData.getData('text/plain');
          if (t.closest?.('.single')) text = text.replace(/\s*\n\s*/g, ' ');
          document.execCommand('insertText', false, text);
        }
        return;
      }
      const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); CS.addImageFiles(files, CS.spawnPoint()); return; }
      const text = e.clipboardData.getData('text/plain').trim();
      if (!text) return;
      e.preventDefault();
      if (/^#[0-9a-f]{6}$/i.test(text)) CS.addElementAt('swatch', CS.spawnPoint(), { hex: text.toUpperCase(), title: 'Pasted Swatch' });
      else if (/^https?:\/\/\S+$/i.test(text)) CS.addElementAt('link', CS.spawnPoint(), { url: text });
      else CS.addElementAt('note', CS.spawnPoint(), { html: esc(text).replace(/\n/g, '<br>') });
    });

    viewport.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const at = CS.screenToWorld(e.clientX, e.clientY);
      const target = CS.findDropTarget(e.clientX, e.clientY, true, false);
      CS.clearDropTargets();
      const col = target?.colId ? target : null;
      if (e.dataTransfer.files.length) { CS.addImageFiles(e.dataTransfer.files, at, col); return; }
      const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).trim().split('\n')[0];
      if (/^https?:\/\//i.test(url)) {
        if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) CS.addElementAt('image', at, { src: url });
        else CS.addElementAt('link', at, { url }, col);
      } else if (url) CS.addElementAt('note', at, { html: esc(url) }, col);
    });

    $('#image-input').addEventListener('change', (e) => {
      const target = CS.pendingImageTarget || { at: CS.spawnPoint() };
      CS.pendingImageTarget = null;
      CS.addImageFiles(e.target.files, target.at, target.columnTarget);
      e.target.value = '';
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { CS.spaceDown = false; viewport.classList.remove('space-pan'); }
    });
    window.addEventListener('blur', () => { CS.spaceDown = false; viewport.classList.remove('space-pan'); });

    // Topbar & iCloud Storage Dialog
    $('#breadcrumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-board]'); if (b) CS.openBoard(b.dataset.board); });
    $('#save-status').addEventListener('click', CS.openStorageModal);
    $('#storage-close').addEventListener('click', () => $('#storage-dialog').close());
    $('#btn-reveal-finder').addEventListener('click', CS.revealInFinder);
    $('#btn-force-backup').addEventListener('click', () => {
      CS.scheduleSave(true);
      CS.toast('☁️ Synced workspace & boards to iCloud Drive');
      setTimeout(CS.openStorageModal, 350);
    });
    $('#storage-boards-list').addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-board]');
      if (openBtn) {
        $('#storage-dialog').close();
        CS.openBoard(openBtn.dataset.openBoard);
        return;
      }
      const expBtn = e.target.closest('[data-export-board]');
      if (expBtn) {
        CS.exportSingleBoard(expBtn.dataset.exportBoard);
      }
    });

    $('#btn-search').addEventListener('click', CS.openSearchModal);
    $('#btn-templates').addEventListener('click', () => $('#templates-dialog').showModal());
    $('#templates-close').addEventListener('click', () => $('#templates-dialog').close());
    $('#btn-undo').addEventListener('click', CS.undo);
    $('#btn-redo').addEventListener('click', CS.redo);
    $('#btn-snap').addEventListener('click', () => {
      CS.snapEnabled = !CS.snapEnabled;
      $('#btn-snap').classList.toggle('active', CS.snapEnabled);
      CS.toast(CS.snapEnabled ? 'Smart alignment snap enabled' : 'Snap disabled');
      CS.scheduleSave();
    });
    $('#btn-theme').addEventListener('click', () => { CS.applyTheme(CS.state.theme === 'dark' ? 'light' : 'dark'); CS.scheduleSave(); });
    $('#btn-export-png').addEventListener('click', CS.exportBoardPNG);
    $('#btn-export').addEventListener('click', CS.exportData);
    $('#btn-import').addEventListener('click', () => $('#import-input').click());
    $('#import-input').addEventListener('change', CS.importData);
    $('#btn-help').addEventListener('click', () => $('#help-dialog').showModal());
    $('#help-close').addEventListener('click', () => $('#help-dialog').close());
    $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });

    $('#search-input').addEventListener('input', (e) => CS.renderSearchResults(e.target.value));
    $('#search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = $('#search-results .search-item');
        if (first) CS.jumpToElement(first.dataset.jumpId);
      }
    });
    $('#search-results').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-jump-id]');
      if (btn) CS.jumpToElement(btn.dataset.jumpId);
    });

    $('#templates-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-tpl]');
      if (!card) return;
      const tpl = card.dataset.tpl;
      const createSub = $('#tpl-new-board').checked;
      CS.checkpoint();
      $('#templates-dialog').close();
      if (createSub) {
        const titles = { moodboard: 'Moodboard', brief: 'Creative Brief', kanban: 'Project Plan', storyboard: 'Storyboard', brand: 'Brand System', mindmap: 'Mindmap' };
        const colors = { moodboard: 'rose', brief: 'sky', kanban: 'teal', storyboard: 'violet', brand: 'amber', mindmap: 'violet' };
        const pt = CS.spawnPoint();
        const b = CS.createElement('board', { x: pt.x, y: pt.y, title: titles[tpl] || 'Template Board', color: colors[tpl] || 'violet' }, CS.currentBoard);
        CS.populateTemplate(tpl, b.id);
        CS.openBoard(b.id);
      } else {
        CS.populateTemplate(tpl, CS.currentBoard);
        CS.render();
        CS.fitView();
        CS.scheduleSave();
      }
      CS.toast('Template board ready');
    });

    $('#zoom-in').addEventListener('click', () => CS.zoomCenter(1.2));
    $('#zoom-out').addEventListener('click', () => CS.zoomCenter(1 / 1.2));
    $('#zoom-reset').addEventListener('click', () => CS.zoomCenter(1 / CS.view.zoom));
    $('#zoom-fit').addEventListener('click', CS.fitView);

    // Format bar bindings
    $('#swatches').innerHTML = COLORS.map((c) => `<button class="swatch c-${c}" data-color="${c}" title="${c === 'none' ? 'Default' : c[0].toUpperCase() + c.slice(1)}" aria-label="Colour ${c}"></button>`).join('');
    $('#swatches').addEventListener('click', (e) => { const s = e.target.closest('.swatch'); if (s) CS.setColor(s.dataset.color); });

    $('#fb-font-down').addEventListener('click', () => CS.adjustSelectionFontSize(-2));
    $('#fb-font-up').addEventListener('click', () => CS.adjustSelectionFontSize(2));
    $$('[data-size-preset]').forEach((btn) => {
      btn.addEventListener('click', () => CS.applySizePreset(btn.dataset.sizePreset));
    });
    $('#fb-size-reset').addEventListener('click', CS.resetSelectionHeight);
    $('#fb-img-fit').addEventListener('click', CS.toggleSelectedImageFit);

    $$('.fb-cmd').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
    $('#fb-extract-palette').addEventListener('click', CS.extractPaletteFromSelectedImage);
    $('#fb-table-add-row').addEventListener('click', () => CS.mutateSelectedTable((el) => {
      const cols = el.rows[0]?.length || 2;
      el.rows.push(Array(cols).fill(''));
    }));
    $('#fb-table-add-col').addEventListener('click', () => CS.mutateSelectedTable((el) => {
      el.rows.forEach((r, idx) => r.push(idx === 0 ? `Col ${r.length + 1}` : ''));
    }));
    $('#fb-table-del-row').addEventListener('click', () => CS.mutateSelectedTable((el) => {
      if (el.rows.length > 2) el.rows.pop();
    }));
    $('#fb-table-del-col').addEventListener('click', () => CS.mutateSelectedTable((el) => {
      if ((el.rows[0]?.length || 0) > 1) el.rows.forEach((r) => r.pop());
    }));
    $('#fb-edit-sketch').addEventListener('click', () => {
      const id = [...CS.selection][0];
      if (id) CS.openSketchModal(id);
    });
    $('#fb-open-doc').addEventListener('click', () => {
      const id = [...CS.selection][0];
      if (id) CS.openDocDrawer(id);
    });
    $('#fb-line-style').addEventListener('click', () => {
      const l = CS.state.lines[CS.selectedLine];
      if (!l) return;
      CS.checkpoint();
      const order = ['solid', 'dashed', 'dotted'];
      l.style = order[(order.indexOf(l.style || 'solid') + 1) % order.length];
      CS.updateSelectionUI();
      CS.renderLines();
      CS.scheduleSave();
    });
    $('#fb-line-dir').addEventListener('click', () => {
      const l = CS.state.lines[CS.selectedLine];
      if (!l) return;
      CS.checkpoint();
      const order = ['forward', 'both', 'none'];
      l.dir = order[(order.indexOf(l.dir || 'forward') + 1) % order.length];
      CS.updateSelectionUI();
      CS.renderLines();
      CS.scheduleSave();
    });
    $('#fb-line-label').addEventListener('click', () => {
      if (CS.selectedLine) CS.promptLineLabel(CS.selectedLine);
    });
    $('#fb-delete').addEventListener('click', CS.deleteSelection);
    $('#fb-duplicate').addEventListener('click', CS.duplicateSelection);
    $('#fb-front').addEventListener('click', CS.bringToFront);
  };
})();
