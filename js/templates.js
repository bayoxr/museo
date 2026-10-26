/* ==========================================================================
   templates.js — Initial Museo Workspace Seed & 6 Creative Board Templates
   ========================================================================== */
(() => {
  'use strict';
  const CS = (window.Corkspace = window.Corkspace || {});
  const { uid } = CS;

  CS.seedState = function seedState() {
    CS.state = { elements: {}, lines: {}, assets: {}, views: {}, theme: 'dark', currentBoard: 'root', snap: true };
    CS.state.elements.root = { id: 'root', type: 'board', title: 'Home', boardId: null, color: 'violet' };
    const mk = (type, boardId, props) => CS.createElement(type, props, boardId);
    const items = (arr) => arr.map(([text, done]) => ({ id: uid(), text, done: !!done }));
    const line = (from, to, boardId, extra = {}) => {
      const id = uid();
      CS.state.lines[id] = { id, boardId, from: from.id, to: to.id, style: 'solid', dir: 'forward', label: '', ...extra };
    };

    // Home Workspace
    mk('heading', 'root', { x: 80, y: 26, w: 660, fontSize: 34, html: 'Welcome to Museo ✦' });
    const intro = mk('note', 'root', {
      x: 80, y: 108, w: 310, color: 'violet',
      html: '<b>Your native macOS & iCloud-synced creative workspace.</b><br><br>Resize any picture, title, board, or card freely using the <b>right</b>, <b>bottom</b>, or <b>corner</b> handles—or use <b>A− / A+</b> and <b>S / M / L / XL</b> in the top format bar.'
    });
    const todo = mk('todo', 'root', {
      x: 430, y: 108, w: 290, title: 'Try Museo Studio features',
      items: items([
        ['Drag the corner of any Picture or Title to resize it', 1],
        ['Click “iCloud Synced” in the top bar to view saved boards'],
        ['Open Moodboard & click 🎨 Extract Palette on an image'],
        ['Double-click the Creative Brief Document'],
        ['Press ⌘K to search across all boards']
      ])
    });
    mk('document', 'root', {
      x: 80, y: 310, w: 310, color: 'sky',
      title: 'Museo Studio Guide & Brief',
      html: '<h2>1. Universal Resizing</h2><p>Every item on the board—pictures, titles, boards, swatches, notes, and tables—can be resized horizontally, vertically, or diagonally from its bottom-right corner. You can also adjust text/title sizes from <code>10px</code> up to <code>120px</code> using <b>A− / A+</b> or <code>⌘[</code> / <code>⌘]</code>.</p><h2>2. Automatic iCloud Drive Sync</h2><p>Every board you create is automatically saved as an individual file inside <code>~/Library/Mobile Documents/com~apple~CloudDocs/Museo/boards/</code> alongside daily rolling backups.</p>'
    });
    const mood = mk('board', 'root', { x: 430, y: 390, title: 'Moodboard', color: 'rose' });
    const plan = mk('board', 'root', { x: 590, y: 390, title: 'Project Plan', color: 'teal' });

    mk('swatch', 'root', { x: 760, y: 390, w: 148, hex: '#9B4DFF', title: 'Museo Violet' });
    mk('swatch', 'root', { x: 924, y: 390, w: 148, hex: '#E07A5F', title: 'Warm Terracotta' });

    const col = mk('column', 'root', { x: 760, y: 108, w: 312, title: 'Quick Reference', color: 'amber' });
    const c1 = mk('note', 'root', { html: '<b>Keyboard Shortcuts</b><br><code>N</code> Note · <code>H</code> Title · <code>S</code> Swatch · <code>D</code> Doc · <code>M</code> Table · <code>K</code> Sketch · <code>⌘[</code> / <code>⌘]</code> Size' });
    const c2 = mk('link', 'root', { url: 'https://fonts.google.com', title: 'Google Fonts — Typography specimens' });
    CS.insertIntoColumn(col.id, [c1.id, c2.id], 0);
    line(intro, todo, 'root', { label: 'start here' });

    CS.populateTemplate('moodboard', mood.id);
    CS.populateTemplate('kanban', plan.id);

    return CS.state;
  };

  CS.populateTemplate = function populateTemplate(tplName, boardId) {
    const mk = (type, props) => {
      const el = CS.createElement(type, props, boardId);
      CS.justCreated.add(el.id);
      return el;
    };
    const items = (arr) => arr.map(([text, done]) => ({ id: uid(), text, done: !!done }));
    const line = (from, to, extra = {}) => {
      const id = uid();
      CS.state.lines[id] = { id, boardId, from: from.id, to: to.id, style: 'solid', dir: 'forward', label: '', ...extra };
    };

    if (tplName === 'moodboard') {
      mk('heading', { x: 60, y: 30, w: 620, fontSize: 32, html: 'Calm Studio — Visual Direction', color: 'rose' });
      const img1 = mk('image', { x: 60, y: 108, w: 410, src: 'assets/mood-studio.jpg', caption: 'Warm plaster, natural daylight & linen textures' });
      const img2 = mk('image', { x: 500, y: 108, w: 300, src: 'assets/mood-materials.jpg', caption: 'Tactile material palette' });
      mk('image', { x: 830, y: 108, w: 270, src: 'assets/mood-architecture.jpg', caption: 'Minimalist architectural forms' });
      const sw1 = mk('swatch', { x: 500, y: 450, w: 145, hex: '#C87D65', title: 'Raw Plaster' });
      mk('swatch', { x: 660, y: 450, w: 145, hex: '#8FA38A', title: 'Olive Sage' });
      mk('swatch', { x: 820, y: 450, w: 145, hex: '#D9CBB8', title: 'Travertine' });
      mk('swatch', { x: 980, y: 450, w: 145, hex: '#3E3A35', title: 'Smoked Oak' });
      const note = mk('note', { x: 60, y: 500, w: 410, color: 'amber', html: '<b>Tip:</b> Drag the bottom-right corner of any photograph or title to resize it freely, or click <b>🎨 Extract Palette</b> in the top bar!' });
      line(img2, sw1, { label: 'sampled palette', style: 'dashed' });
      line(img1, note, { label: 'direction' });
    } else if (tplName === 'brief') {
      mk('heading', { x: 60, y: 30, w: 600, fontSize: 32, html: 'Creative Brief & Project Scope', color: 'sky' });
      const doc = mk('document', {
        x: 60, y: 108, w: 340, color: 'sky',
        title: 'Campaign Creative Brief',
        html: '<h2>Background & Objective</h2><p>Define the core problem we are solving and the emotional takeaway for the audience.</p><h2>Target Audience</h2><p>Independent creators, studios, and product teams looking for a tactile spatial workspace.</p><h2>Deliverables</h2><ul><li>Brand identity & color system</li><li>Interactive prototype</li><li>Launch assets & film storyboard</li></ul>'
      });
      const goals = mk('todo', {
        x: 430, y: 108, w: 300, title: 'Key Deliverables',
        items: items([['Approve creative direction', 1], ['Finalize colour & type system'], ['Deliver responsive prototype'], ['Prepare launch reel']])
      });
      mk('table', {
        x: 60, y: 310, w: 670, title: 'Stakeholder & Timeline Matrix',
        rows: [
          ['Phase', 'Lead', 'Target Date', 'Deliverable'],
          ['01 Discovery', 'Strategy', 'Week 1', 'Research & Moodboard'],
          ['02 Design', 'Art Direction', 'Week 2', 'Visual System & UI'],
          ['03 Production', 'Engineering', 'Week 4', 'Final Build & QA']
        ]
      });
      const col = mk('column', { x: 770, y: 108, w: 296, title: 'Inspiration & Links', color: 'violet' });
      const l1 = mk('link', { url: 'https://www.awwwards.com', title: 'Awwwards — Interactive design references' });
      const c1 = mk('comment', { author: 'Creative Lead', html: 'Keep typography warm and editorial — avoid sterile corporate blue.' });
      CS.insertIntoColumn(col.id, [l1.id, c1.id], 0);
      line(doc, goals, { label: 'drives' });
    } else if (tplName === 'kanban') {
      mk('heading', { x: 60, y: 30, w: 540, fontSize: 32, html: 'Project Plan & Roadmap', color: 'teal' });
      const cols = [
        ['Backlog', 'slate', ['User interviews & synthesis', 'Audio & voice memo experiments']],
        ['To Do', 'sky', ['Collect visual references', 'Write the creative brief']],
        ['In Progress', 'amber', ['Explore three layout directions', 'Refine dark & light cork themes']],
        ['Done', 'lime', ['Kick-off alignment workshop', 'iCloud Drive + IndexedDB sync engine']]
      ];
      cols.forEach(([title, color, cards], i) => {
        const c = mk('column', { x: 60 + i * 316, y: 108, w: 292, title, color });
        CS.insertIntoColumn(c.id, cards.map((t) => mk('note', { html: t }).id), 0);
      });
      mk('todo', {
        x: 60, y: 430, w: 320, title: 'Release Milestones',
        items: items([['Architecture & Store sign-off', 1], ['Design review', 1], ['Beta testing'], ['v2.0 Launch']])
      });
      mk('table', {
        x: 410, y: 430, w: 560, title: 'Resource Allocation',
        rows: [
          ['Workstream', 'Priority', 'Status'],
          ['Canvas Engine & 2D Resizing', 'P0', 'Complete'],
          ['Museo Card Suite', 'P0', 'Complete'],
          ['iCloud Drive Sync & macOS App', 'P0', 'Ready']
        ]
      });
    } else if (tplName === 'storyboard') {
      mk('heading', { x: 60, y: 30, w: 620, fontSize: 32, html: 'Storyboard & Shot Breakdown', color: 'violet' });
      const s1 = mk('note', { x: 60, y: 108, w: 260, color: 'violet', html: '<b>Scene 01 — Establishing</b><br><br>Wide overhead shot of an architect’s desk transitioning into an infinite digital board.' });
      const s2 = mk('note', { x: 380, y: 108, w: 260, color: 'sky', html: '<b>Scene 02 — Tactile Flow</b><br><br>Close-up of dragging photographs, extracting a 5-colour palette, and connecting ideas.' });
      const s3 = mk('note', { x: 700, y: 108, w: 260, color: 'rose', html: '<b>Scene 03 — Deep Dive</b><br><br>Double-clicking a nested sub-board zooms smoothly into the full production plan.' });
      line(s1, s2, { label: 'cut to' });
      line(s2, s3, { label: 'zoom transition' });
      mk('table', {
        x: 60, y: 290, w: 580, title: 'Camera & Audio Shot List',
        rows: [
          ['Shot #', 'Framing', 'Duration', 'Audio / VO'],
          ['01A', 'Top-down Wide', '4.0s', 'Soft ambient felt piano'],
          ['02A', 'Macro UI Detail', '5.5s', 'Crisp tactile paper Foley'],
          ['03A', 'Dynamic Zoom', '4.5s', 'Main title crescendo']
        ]
      });
      mk('comment', { x: 700, y: 290, w: 260, author: 'Director', html: 'Use the Sketch tool (K) to draw quick frame compositions for Scenes 01–03.' });
    } else if (tplName === 'brand') {
      mk('heading', { x: 60, y: 30, w: 640, fontSize: 32, html: 'Brand Identity & Design System', color: 'amber' });
      mk('swatch', { x: 60, y: 108, w: 156, hex: '#19062B', title: 'Museo Obsidian' });
      mk('swatch', { x: 236, y: 108, w: 156, hex: '#F6F3EC', title: 'Warm Alabaster' });
      mk('swatch', { x: 412, y: 108, w: 156, hex: '#C06EFF', title: 'Studio Magenta' });
      mk('swatch', { x: 588, y: 108, w: 156, hex: '#38BDF8', title: 'Signal Cyan' });
      mk('note', {
        x: 60, y: 290, w: 332, color: 'violet',
        html: '<b>Typography Hierarchy</b><br><br>• <b>Display:</b> Outfit ExtraBold (Mu Monogram & Titles)<br>• <b>Body UI:</b> Inter Regular & Medium<br>• <b>Technical / HEX:</b> JetBrains Mono'
      });
      mk('table', {
        x: 412, y: 290, w: 480, title: 'Brand Voice Principles',
        rows: [
          ['We Are', 'We Are Not', 'Example Tone'],
          ['Tactile & Studio-grade', 'Cluttered or Enterprise-stiff', '“Arrange ideas the way you think.”'],
          ['iCloud & Local-first', 'Paywalled or Cloud-locked', '“Every board saved on your Mac.”']
        ]
      });
    } else if (tplName === 'mindmap') {
      const hub = mk('note', { x: 420, y: 220, w: 260, color: 'violet', html: '<b>✦ Core Product Thesis</b><br><br>How do we make creative research feel effortless and spatial?' });
      const n1 = mk('note', { x: 80, y: 80, w: 240, color: 'rose', html: '<b>Visual Moodboarding</b><br>Instant image drop + 2D resizing + dominant palette extraction.' });
      const n2 = mk('note', { x: 780, y: 80, w: 240, color: 'sky', html: '<b>Structured Writing</b><br>Slide-over long-form Documents and inline Tables.' });
      const n3 = mk('note', { x: 80, y: 380, w: 240, color: 'teal', html: '<b>Native Mac & iCloud</b><br>Saved automatically to iCloud Drive/Museo with per-board files.' });
      const n4 = mk('todo', { x: 780, y: 370, w: 250, title: 'Next Experiments', items: items([['Test palette extraction on 10 photos'], ['Export full board snapshot as PNG']]) });
      line(hub, n1, { label: 'visuals' });
      line(hub, n2, { label: 'structure' });
      line(hub, n3, { label: 'architecture' });
      line(hub, n4, { label: 'action items', style: 'dashed' });
    }
  };
})();
