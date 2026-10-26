/* ==========================================================================
   app.js — Museo Application Entry Point & Bootstrapper
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const { $ } = CS;

  async function init() {
    let saved = null;
    try { saved = await CS.Store.load(); } catch (e) { console.warn(e); }
    if (saved && saved.elements && saved.elements.root) {
      CS.state = saved;
      CS.state.lines ||= {};
      CS.state.assets ||= {};
      CS.state.views ||= {};
      CS.gcAssets();
    } else {
      CS.state = CS.seedState();
    }
    CS.currentBoard = CS.state.elements[CS.state.currentBoard] ? CS.state.currentBoard : 'root';
    CS.view = CS.state.views[CS.currentBoard] ? { ...CS.state.views[CS.currentBoard] } : { x: 140, y: 60, zoom: 1 };
    CS.snapEnabled = CS.state.snap !== false;
    $('#btn-snap').classList.toggle('active', CS.snapEnabled);
    CS.applyTheme(CS.state.theme || 'dark');
    CS.initSketchPad();
    CS.bindEvents();
    CS.render();
    CS.setStatus('saved');
    // Ensure initial sync to iCloud Drive if connected
    CS.scheduleSave();
  }

  init();
})();
