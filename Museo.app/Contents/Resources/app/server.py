#!/usr/bin/env python3
"""
Museo — Local-First & iCloud Drive Persistence Server
Automatically saves the full workspace AND every individual board as JSON files
inside macOS iCloud Drive (~/Library/Mobile Documents/com~apple~CloudDocs/Museo)
with a local fallback/mirror in ~/Documents/Museo.
"""

import datetime
import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

APP_DIR = Path(__file__).resolve().parent
HOME = Path.home()
ICLOUD_ROOT = HOME / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
DOCS_ROOT = HOME / "Documents"


def get_storage_dirs():
    """Return primary storage directory (iCloud Drive if available, else Documents) and mirror."""
    if ICLOUD_ROOT.exists():
        primary = ICLOUD_ROOT / "Museo"
        mode = "iCloud Drive"
    else:
        primary = DOCS_ROOT / "Museo"
        mode = "Local Documents"

    mirror = DOCS_ROOT / "Museo"
    for base in (primary, mirror):
        (base / "boards").mkdir(parents=True, exist_ok=True)
        (base / "backups").mkdir(parents=True, exist_ok=True)
    return primary, mirror, mode


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", (text or "untitled").strip()).strip("-").lower()
    return s[:48] or "untitled"


def write_atomic(path: Path, data_bytes: bytes):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data_bytes)
    tmp.replace(path)


def save_workspace_and_boards(state: dict, force_backup: bool = False) -> dict:
    primary, mirror, mode = get_storage_dirs()
    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
    payload = {
        "app": "museo",
        "version": 3,
        "savedAt": now_iso,
        "data": state,
    }
    raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    # 1. Save master workspace.json to iCloud Drive (and local Documents mirror)
    write_atomic(primary / "workspace.json", raw)
    if mirror != primary:
        try:
            write_atomic(mirror / "workspace.json", raw)
        except Exception:
            pass

    # 2. Save EVERY individual Board into its own file in boards/
    elements = state.get("elements") or {}
    lines = state.get("lines") or {}
    assets = state.get("assets") or {}

    boards = [el for el in elements.values() if isinstance(el, dict) and el.get("type") == "board"]
    active_filenames = set()
    board_summaries = []

    for b in boards:
        bid = b.get("id", "unknown")
        btitle = b.get("title") or ("Home" if bid == "root" else "Untitled Board")
        fname = f"{slugify(btitle)}__{bid}.json"
        active_filenames.add(fname)

        # Collect elements & lines belonging directly to this board
        b_elements = {
            eid: el for eid, el in elements.items()
            if isinstance(el, dict) and (eid == bid or el.get("boardId") == bid)
        }
        b_lines = {
            lid: ln for lid, ln in lines.items()
            if isinstance(ln, dict) and ln.get("boardId") == bid
        }
        b_assets = {
            el.get("assetId"): assets[el.get("assetId")]
            for el in b_elements.values()
            if el.get("assetId") and el.get("assetId") in assets
        }

        board_payload = {
            "app": "museo-board",
            "version": 3,
            "boardId": bid,
            "title": btitle,
            "savedAt": now_iso,
            "itemCount": max(0, len(b_elements) - 1),
            "data": {
                "board": b,
                "elements": b_elements,
                "lines": b_lines,
                "assets": b_assets,
            },
        }
        b_raw = json.dumps(board_payload, ensure_ascii=False, indent=2).encode("utf-8")
        write_atomic(primary / "boards" / fname, b_raw)
        if mirror != primary:
            try:
                write_atomic(mirror / "boards" / fname, b_raw)
            except Exception:
                pass

        board_summaries.append({
            "id": bid,
            "title": btitle,
            "file": fname,
            "itemCount": max(0, len(b_elements) - 1),
        })

    # Clean up deleted board files
    for existing in (primary / "boards").glob("*.json"):
        if existing.name not in active_filenames:
            try:
                existing.unlink()
            except Exception:
                pass

    # 3. Daily rolling backup in backups/
    today_str = datetime.date.today().isoformat()
    backup_name = (
        f"workspace-{datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')}.json"
        if force_backup
        else f"workspace-{today_str}.json"
    )
    backup_file = primary / "backups" / backup_name
    if force_backup or not backup_file.exists():
        write_atomic(backup_file, raw)
        # Keep most recent 30 backups
        backups = sorted((primary / "backups").glob("workspace-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[30:]:
            try:
                old.unlink()
            except Exception:
                pass

    return {
        "ok": True,
        "mode": mode,
        "path": str(primary),
        "savedAt": now_iso,
        "boardCount": len(board_summaries),
        "boards": board_summaries,
    }


def get_storage_status() -> dict:
    primary, mirror, mode = get_storage_dirs()
    ws_file = primary / "workspace.json"
    saved_at = None
    if ws_file.exists():
        saved_at = datetime.datetime.fromtimestamp(ws_file.stat().st_mtime).isoformat(timespec="seconds")

    boards = []
    for f in sorted((primary / "boards").glob("*.json")):
        try:
            meta = json.loads(f.read_text("utf-8"))
            boards.append({
                "id": meta.get("boardId", f.stem),
                "title": meta.get("title", f.stem),
                "file": f.name,
                "itemCount": meta.get("itemCount", 0),
                "savedAt": meta.get("savedAt"),
            })
        except Exception:
            pass

    backups = sorted((primary / "backups").glob("workspace-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {
        "ok": True,
        "mode": mode,
        "path": str(primary),
        "mirrorPath": str(mirror),
        "savedAt": saved_at,
        "boardCount": len(boards),
        "boards": boards,
        "backupCount": len(backups),
    }


class MuseoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, format, *args):
        # Quiet static asset logs
        pass

    def _send_json(self, obj: dict, status: int = 200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/storage-info":
            return self._send_json(get_storage_status())

        if parsed.path == "/api/load":
            primary, mirror, mode = get_storage_dirs()
            for candidate in (primary / "workspace.json", mirror / "workspace.json"):
                if candidate.exists():
                    try:
                        raw = json.loads(candidate.read_text("utf-8"))
                        state = raw.get("data") if isinstance(raw, dict) and "data" in raw else raw
                        return self._send_json({
                            "ok": True,
                            "mode": mode,
                            "path": str(primary),
                            "savedAt": raw.get("savedAt") if isinstance(raw, dict) else None,
                            "state": state,
                        })
                    except Exception as e:
                        return self._send_json({"ok": False, "error": str(e)}, 500)
            return self._send_json({"ok": True, "mode": mode, "path": str(primary), "state": None})

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b"{}"

        if parsed.path == "/api/save":
            try:
                payload = json.loads(body.decode("utf-8"))
                state = payload.get("state") if isinstance(payload, dict) and "state" in payload else payload
                qs = parse_qs(parsed.query)
                force_backup = qs.get("backup", ["0"])[0] == "1" or bool(payload.get("forceBackup"))
                res = save_workspace_and_boards(state, force_backup=force_backup)
                return self._send_json(res)
            except Exception as e:
                return self._send_json({"ok": False, "error": str(e)}, 500)

        if parsed.path == "/api/reveal-finder":
            primary, _, _ = get_storage_dirs()
            try:
                subprocess.Popen(["open", str(primary)])
                return self._send_json({"ok": True, "path": str(primary)})
            except Exception as e:
                return self._send_json({"ok": False, "error": str(e)}, 500)

        return self._send_json({"ok": False, "error": "Not found"}, 404)


class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("MUSEO_PORT", "4173"))
    primary, _, mode = get_storage_dirs()
    with ReusableTCPServer(("127.0.0.1", port), MuseoHandler) as httpd:
        actual_port = httpd.server_address[1]
        print(f"MUSEO_READY port={actual_port} mode={mode} path={primary}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
