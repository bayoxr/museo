/* ==========================================================================
   store.js — iCloud Drive + Per-Board File Sync + IndexedDB Persistence
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const { $ } = CS;

  /* ---------- IndexedDB Driver (with localStorage fallback) ---------- */
  const DB_NAME = 'corkspace'; // kept compatible so existing boards are preserved
  const STORE = 'kv';
  const KEY = 'state';
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function idbGet(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  CS.storageMeta = {
    connected: false,
    mode: 'Browser IndexedDB',
    path: '~/Library/Mobile Documents/com~apple~CloudDocs/Museo',
    boardCount: 0,
    boards: [],
    savedAt: null
  };

  CS.Store = {
    async load() {
      // 1. Try native macOS / iCloud Drive backend first if running over HTTP(S)
      if (/^https?:/.test(location.protocol)) {
        try {
          const res = await fetch('/api/load', { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            CS.storageMeta.connected = true;
            CS.storageMeta.mode = json.mode || 'iCloud Drive';
            CS.storageMeta.path = json.path || CS.storageMeta.path;
            if (json.state && json.state.elements && json.state.elements.root) {
              try { await idbSet(KEY, json.state); } catch {}
              return json.state;
            }
          }
        } catch {}
      }

      // 2. Fallback to IndexedDB / localStorage
      try {
        const local = await idbGet(KEY);
        if (local && CS.storageMeta.connected) {
          // Migrate existing IndexedDB state into iCloud Drive immediately
          this.save(local);
        }
        return local;
      } catch (e) {
        console.warn('IndexedDB unavailable, using localStorage', e);
        const raw = localStorage.getItem('corkspace:' + KEY);
        return raw ? JSON.parse(raw) : null;
      }
    },

    async save(state, forceBackup = false) {
      const clean = JSON.parse(JSON.stringify(state));
      // 1. Always save locally in IndexedDB for instant offline safety
      try {
        await idbSet(KEY, clean);
      } catch (e) {
        try { localStorage.setItem('corkspace:' + KEY, JSON.stringify(clean)); } catch {}
      }

      // 2. Sync workspace + individual Board files to macOS iCloud Drive via server
      if (/^https?:/.test(location.protocol)) {
        try {
          const url = forceBackup ? '/api/save?backup=1' : '/api/save';
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: clean, forceBackup })
          });
          if (res.ok) {
            const info = await res.json();
            CS.storageMeta.connected = true;
            CS.storageMeta.mode = info.mode || 'iCloud Drive';
            CS.storageMeta.path = info.path || CS.storageMeta.path;
            CS.storageMeta.boardCount = info.boardCount || 0;
            CS.storageMeta.boards = info.boards || [];
            CS.storageMeta.savedAt = info.savedAt || null;
          }
        } catch {}
      }
    }
  };

  /* ---------- Shared Runtime State ---------- */
  CS.state = null;             // { elements, lines, assets, views, theme, currentBoard, snap }
  CS.currentBoard = 'root';
  CS.view = { x: 140, y: 60, zoom: 1 };
  CS.selection = new Set();
  CS.selectedLine = null;
  CS.undoStack = [];
  CS.redoStack = [];
  CS.pendingEditCheckpoint = false;
  CS.mode = 'select';          // 'select' | 'connect'
  CS.connectFrom = null;
  CS.connectPreview = null;
  CS.spaceDown = false;
  CS.snapEnabled = true;
  CS.drag = null;
  CS.justCreated = new Set();
  CS.pendingImageTarget = null;
  CS.boardFocusTimer = null;
  CS.activeDocId = null;
  CS.activeSketchId = null;

  /* ---------- Undo / Redo History ---------- */
  const snapshot = () => JSON.stringify({ elements: CS.state.elements, lines: CS.state.lines });

  CS.checkpoint = function checkpoint() {
    CS.undoStack.push(snapshot());
    if (CS.undoStack.length > 100) CS.undoStack.shift();
    CS.redoStack.length = 0;
  };

  function restore(snap) {
    const s = JSON.parse(snap);
    CS.state.elements = s.elements;
    CS.state.lines = s.lines;
    if (!CS.state.elements[CS.currentBoard]) CS.currentBoard = 'root';
    CS.selection.clear();
    CS.selectedLine = null;
    CS.render();
    CS.scheduleSave();
  }

  CS.undo = function undo() {
    if (!CS.undoStack.length) return CS.toast('Nothing to undo');
    document.activeElement?.blur?.();
    CS.redoStack.push(snapshot());
    restore(CS.undoStack.pop());
  };

  CS.redo = function redo() {
    if (!CS.redoStack.length) return CS.toast('Nothing to redo');
    document.activeElement?.blur?.();
    CS.undoStack.push(snapshot());
    restore(CS.redoStack.pop());
  };

  /* ---------- Debounced Save & Asset GC ---------- */
  let saveTimer = null;
  let viewSaveTimer = null;

  CS.setStatus = function setStatus(s) {
    const el = $('#save-status');
    if (!el) return;
    el.className = 'save-status ' + s;
    const label = el.querySelector('span');
    if (s === 'saving') label.textContent = 'Syncing…';
    else if (s === 'error') label.textContent = 'Sync error';
    else label.textContent = CS.storageMeta.connected ? `${CS.storageMeta.mode} Synced` : 'Saved Locally';
  };

  CS.scheduleSave = function scheduleSave(forceBackup = false) {
    CS.setStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      CS.state.views[CS.currentBoard] = { ...CS.view };
      CS.state.currentBoard = CS.currentBoard;
      CS.state.snap = CS.snapEnabled;
      try {
        await CS.Store.save(CS.state, forceBackup);
        CS.setStatus('saved');
      } catch (e) {
        console.error(e);
        CS.setStatus('error');
        CS.toast('Could not save — storage may be full');
      }
    }, forceBackup ? 10 : 400);
  };

  CS.scheduleViewSave = function scheduleViewSave() {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => CS.scheduleSave(false), 800);
  };

  CS.gcAssets = function gcAssets() {
    const used = new Set(Object.values(CS.state.elements).map((e) => e.assetId).filter(Boolean));
    Object.keys(CS.state.assets).forEach((k) => { if (!used.has(k)) delete CS.state.assets[k]; });
  };
})();
