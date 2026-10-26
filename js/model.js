/* ==========================================================================
   model.js — Domain Model, Hierarchy Queries & Graph Operations
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const { uid, clamp, DEFAULT_W, SWATCH_PRESETS } = CS;

  CS.boardChildren = (boardId) => Object.values(CS.state.elements).filter((e) => e.boardId === boardId);
  CS.topLevel = (boardId) => CS.boardChildren(boardId).filter((e) => !e.columnId).sort((a, b) => (a.z || 0) - (b.z || 0));
  CS.maxZ = (boardId) => CS.boardChildren(boardId).reduce((m, e) => Math.max(m, e.z || 0), 0);
  CS.imageSrc = (el) => (el.assetId ? CS.state.assets[el.assetId] : el.src) || '';

  CS.boardPathName = function boardPathName(boardId) {
    const names = [];
    let cur = boardId;
    while (cur && CS.state.elements[cur]) {
      names.unshift(CS.state.elements[cur].title || 'Untitled');
      cur = CS.state.elements[cur].boardId;
    }
    return names.join(' › ');
  };

  let swatchCounter = 0;
  CS.createElement = function createElement(type, props = {}, boardId = CS.currentBoard) {
    const el = {
      id: uid(),
      type,
      boardId,
      x: 0,
      y: 0,
      w: DEFAULT_W[type] || 260,
      color: 'none',
      columnId: null,
      z: CS.maxZ(boardId) + 1,
      createdAt: Date.now()
    };
    switch (type) {
      case 'note':
      case 'heading':
        el.html = '';
        break;
      case 'todo':
        el.title = '';
        el.items = [{ id: uid(), text: '', done: false }];
        break;
      case 'link':
        el.url = '';
        el.title = '';
        break;
      case 'image':
        el.src = '';
        el.caption = '';
        break;
      case 'swatch': {
        const [hex, label] = SWATCH_PRESETS[swatchCounter++ % SWATCH_PRESETS.length];
        el.hex = hex;
        el.title = label;
        break;
      }
      case 'document':
        el.title = 'Untitled Document';
        el.html = '<p>Start writing your creative brief, research notes, or specification here…</p>';
        break;
      case 'table':
        el.title = 'Specification Table';
        el.rows = [
          ['Deliverable', 'Owner', 'Status'],
          ['Visual Direction', 'Design', 'In Review'],
          ['Prototype Build', 'Engineering', 'In Progress']
        ];
        break;
      case 'sketch':
        el.src = '';
        el.caption = 'Sketch';
        break;
      case 'comment':
        el.author = 'Note';
        el.html = '';
        el.resolved = false;
        el.color = 'amber';
        break;
      case 'board':
        el.title = '';
        el.color = 'violet';
        break;
      case 'column':
        el.title = '';
        el.children = [];
        break;
    }
    Object.assign(el, props);
    CS.state.elements[el.id] = el;
    return el;
  };

  CS.removeFromColumn = function removeFromColumn(id) {
    const el = CS.state.elements[id];
    if (!el || !el.columnId) return;
    const col = CS.state.elements[el.columnId];
    if (col) col.children = col.children.filter((c) => c !== id);
    el.columnId = null;
  };

  CS.insertIntoColumn = function insertIntoColumn(colId, ids, index) {
    const col = CS.state.elements[colId];
    if (!col) return;
    ids = ids.filter((id) => id !== colId && CS.state.elements[id] && CS.state.elements[id].type !== 'column');
    ids.forEach(CS.removeFromColumn);
    index = clamp(index ?? col.children.length, 0, col.children.length);
    col.children.splice(index, 0, ...ids);
    ids.forEach((id) => {
      CS.state.elements[id].columnId = colId;
      CS.state.elements[id].boardId = col.boardId;
    });
  };

  CS.deleteElement = function deleteElement(id) {
    const el = CS.state.elements[id];
    if (!el) return;
    if (CS.activeDocId === id) CS.closeDocDrawer();
    if (el.type === 'board') CS.boardChildren(id).forEach((c) => CS.deleteElement(c.id));
    if (el.type === 'column') el.children.slice().forEach(CS.deleteElement);
    CS.removeFromColumn(id);
    Object.values(CS.state.lines).forEach((l) => {
      if (l.from === id || l.to === id || l.boardId === id) delete CS.state.lines[l.id];
    });
    delete CS.state.elements[id];
  };

  CS.cloneElement = function cloneElement(id, boardId, idMap) {
    const src = CS.state.elements[id];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.boardId = boardId;
    copy.columnId = null;
    idMap[id] = copy.id;
    if (copy.type === 'todo') copy.items = copy.items.map((i) => ({ ...i, id: uid() }));
    CS.state.elements[copy.id] = copy;
    if (src.type === 'column') {
      copy.children = src.children.filter((c) => CS.state.elements[c]).map((cid) => {
        const c = CS.cloneElement(cid, boardId, idMap);
        c.columnId = copy.id;
        return c.id;
      });
    }
    if (src.type === 'board') {
      CS.boardChildren(src.id).filter((c) => !c.columnId).forEach((c) => CS.cloneElement(c.id, copy.id, idMap));
    }
    return copy;
  };

  CS.moveToBoard = function moveToBoard(ids, targetId) {
    const target = CS.state.elements[targetId];
    if (!target) return;
    const moving = new Set();
    ids.forEach((id) => {
      const el = CS.state.elements[id];
      if (!el || id === targetId) return;
      moving.add(id);
      if (el.type === 'column') el.children.forEach((c) => moving.add(c));
    });
    const existing = CS.topLevel(targetId);
    let baseX = existing.length ? Math.max(...existing.map((e) => e.x + (e.w || 260))) + 60 : 80;
    let baseY = 80;
    const roots = [...moving].filter((id) => !CS.state.elements[id].columnId || !moving.has(CS.state.elements[id].columnId));
    const minX = Math.min(...roots.map((id) => CS.state.elements[id].x));
    const minY = Math.min(...roots.map((id) => CS.state.elements[id].y));
    let z = CS.maxZ(targetId);
    roots.forEach((id) => {
      const el = CS.state.elements[id];
      CS.removeFromColumn(id);
      el.x = baseX + (el.x - minX);
      el.y = baseY + (el.y - minY);
      el.z = ++z;
    });
    moving.forEach((id) => { CS.state.elements[id].boardId = targetId; });
    Object.values(CS.state.lines).forEach((l) => {
      const a = moving.has(l.from), b = moving.has(l.to);
      if (a && b) l.boardId = targetId;
      else if (a || b) delete CS.state.lines[l.id];
    });
  };
})();
