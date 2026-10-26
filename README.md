# Museo (`Mu`) — Visual Workspace for Creative Projects

**Museo** is a free, self-contained macOS visual workspace inspired by Milanote, featuring an Adobe Creative Suite-style **`Mu`** identity, universal resizing for every card and typography element, automatic **iCloud Drive** per-board persistence, and a native macOS application bundle (`Museo.app`).

---

## 1. Launching Museo on Your Mac

### Option A: Native macOS App (`Museo.app` — Recommended)
- Double-click **`Museo.app`** in Finder (or drag **`Museo.app`** to `/Applications` or your macOS Dock).
- `Museo.app` automatically starts the local iCloud Drive sync engine (`server.py`) in the background and opens a native macOS `WKWebView` window with full macOS menu bar shortcuts (`⌘S` Sync to iCloud Drive, `⌘O` Reveal iCloud Folder, `⌘Z` Undo, `⌘⇧Z` Redo, `⌘C`/`⌘V` Copy/Paste).

### Option B: Browser + iCloud Sync Server
```bash
python3 server.py 4173
```
Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

---

## 2. Universal Resizing (Pictures, Titles, Notes, Boards & More)

Every item on a Museo board can be resized both spatially and typographically:

1. **Interactive 3-Axis Drag Handles**:
   - **Right edge (`.resize-e`)**: Drag to adjust card width (`w`).
   - **Bottom edge (`.resize-s`)**: Drag to adjust card/image height (`h`).
   - **Bottom-Right corner (`.resize-se`)**: Drag to resize both width and height simultaneously.
   - **Hold `Shift` while resizing a Picture**: Locks the image's aspect ratio.
   - **Double-click any resize handle**: Resets the card's height back to automatic (`Auto`).
2. **Format Bar Size & Typography Controls** (shown whenever any card is selected):
   - **`A−` / `A+` (50% – 300%)**: Scales the font size of titles, headings, notes, board labels, tables, and checklists on the selected card(s). Click the percentage readout (`100%`) to reset to default.
   - **`S` · `M` · `L` · `XL`**: One-click width presets tailored to each card type (`180px` / `260px` / `380px` / `540px`, or `320px` / `480px` / `680px` / `920px` for Section Headings).
   - **`Auto`**: Resets explicit height so the card wraps its content naturally.
   - **`Crop` / `Fit`** (for Pictures): Toggle between cover-crop (`object-fit: cover`) and full uncropped image display (`object-fit: contain`).

---

## 3. Reliable Multi-Layer Board Storage & iCloud Drive Sync

Museo guarantees you never lose a board by saving every change across **three layers simultaneously**:

1. **macOS iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/Museo/`)**:
   - `workspace.json` — Complete workspace state across all nested boards.
   - `boards/<board-name>__<board-id>.json` — Individual JSON file for **every single board**, updated automatically whenever you edit.
   - `backups/workspace-YYYY-MM-DD.json` — Automatic daily rolling snapshot.
2. **Local Documents Mirror (`~/Documents/Museo/`)**:
   - Keeps an offline mirror on your Mac alongside iCloud Drive.
3. **Browser IndexedDB + `localStorage` Emergency Snapshot**:
   - Instant sub-millisecond local persistence even if running purely offline.

Click the **`iCloud Synced · N Boards`** pill in the top header at any time to inspect your storage paths, trigger an immediate sync, or open your iCloud Drive `Museo` folder directly in Finder.

---

## 4. Modular Project Architecture

```text
museo/
├── Museo.app/               # Native macOS application bundle (Cocoa + WebKit + AppIcon.icns)
├── index.html               # App shell, SVG sprites, topbar, toolbar, format bar & modals
├── server.py                # Zero-dependency Python HTTP + iCloud Drive atomic sync server
├── package.json             # Project scripts (start, build:mac)
├── macos/
│   ├── GenerateIcon.swift   # CoreGraphics generator for the Adobe-style "Mu" AppIcon.icns
│   ├── MuseoApp.swift       # Native macOS Cocoa + WKWebView wrapper & process manager
│   ├── Info.plist           # macOS bundle metadata
│   └── build_app.sh         # One-command build script for Museo.app
├── css/
│   ├── tokens.css           # Design tokens, dark/light themes, resets & scrollbars
│   ├── layout.css           # Topbar, Mu brand logo, iCloud pill, left toolbar & right rail
│   ├── canvas.css           # Infinite board viewport, dot/line/blueprint grids & SVG connectors
│   ├── cards.css            # All 10 card types, 3-way resize handles & --card-fs font scaling
│   └── modals.css           # Floating format bar, iCloud storage dialog, command palette & toasts
├── js/
│   ├── config.js            # Global namespace (window.CS), constants, palettes & ID generator
│   ├── store.js             # Multi-layer storage (IndexedDB + iCloud API + File System Access)
│   ├── model.js             # State tree, board lookup, undo/redo history & card CRUD
│   ├── templates.js         # Seed workspace & 4 starter board templates
│   ├── renderer.js          # DOM rendering for breadcrumbs, cards, universal handles & wires
│   ├── features.js          # Presentation mode, command palette, iCloud modal, sketch & export
│   ├── interactions.js      # Pointer pan/zoom, marquee, 3-axis card resize & format bar actions
│   └── app.js               # Bootstrap, keyboard shortcuts & toolbar wiring
└── assets/
    ├── museo-icon.png       # 512×512 Adobe-style "Mu" application icon
    ├── mood-studio.jpg
    ├── mood-materials.jpg
    └── mood-architecture.jpg
```
