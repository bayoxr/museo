import Cocoa
import WebKit
import UniformTypeIdentifiers

class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var serverPort: Int = 4173

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()
        setupWindow()
        startBackendAndLoad()
    }

    func resolveAppDirectory() -> String {
        let fm = FileManager.default
        let bundleURL = Bundle.main.bundleURL
        let parentDir = bundleURL.deletingLastPathComponent().path
        if fm.fileExists(atPath: "\(parentDir)/server.py") && fm.fileExists(atPath: "\(parentDir)/index.html") {
            return parentDir
        }
        if let resPath = Bundle.main.resourcePath {
            let bundledApp = "\(resPath)/app"
            if fm.fileExists(atPath: "\(bundledApp)/server.py") {
                return bundledApp
            }
        }
        return parentDir
    }

    func startBackendAndLoad() {
        let appDir = resolveAppDirectory()
        let serverScript = "\(appDir)/server.py"

        // Check if a Museo server is already running on 4173
        if isPortAlreadyServingMuseo(port: 4173) {
            self.serverPort = 4173
            self.loadWorkspaceURL()
            return
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        proc.arguments = [serverScript, "4173"]
        proc.currentDirectoryURL = URL(fileURLWithPath: appDir)

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe

        do {
            try proc.run()
            self.serverProcess = proc
        } catch {
            // Fallback ephemeral port
            loadFallbackFileURL(appDir: appDir)
            return
        }

        // Wait up to 2.5s for MUSEO_READY or port readiness
        DispatchQueue.global(qos: .userInitiated).async {
            for _ in 0..<25 {
                if self.isPortAlreadyServingMuseo(port: 4173) {
                    DispatchQueue.main.async {
                        self.serverPort = 4173
                        self.loadWorkspaceURL()
                    }
                    return
                }
                Thread.sleep(forTimeInterval: 0.1)
            }
            DispatchQueue.main.async {
                self.loadWorkspaceURL()
            }
        }
    }

    func isPortAlreadyServingMuseo(port: Int) -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/storage-info") else { return false }
        var req = URLRequest(url: url)
        req.timeoutInterval = 0.25
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        let task = URLSession.shared.dataTask(with: req) { data, resp, _ in
            if let http = resp as? HTTPURLResponse, http.statusCode == 200, data != nil {
                ok = true
            }
            sem.signal()
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 0.3)
        return ok
    }

    func loadWorkspaceURL() {
        if let url = URL(string: "http://127.0.0.1:\(serverPort)/") {
            webView.load(URLRequest(url: url))
        }
    }

    func loadFallbackFileURL(appDir: String) {
        let indexURL = URL(fileURLWithPath: "\(appDir)/index.html")
        let dirURL = URL(fileURLWithPath: appDir)
        webView.loadFileURL(indexURL, allowingReadAccessTo: dirURL)
    }

    func setupWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width = min(1480, max(1120, screenRect.width * 0.88))
        let height = min(940, max(720, screenRect.height * 0.88))
        let x = screenRect.origin.x + (screenRect.width - width) * 0.5
        let y = screenRect.origin.y + (screenRect.height - height) * 0.5

        window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Museo"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedRed: 0.08, green: 0.08, blue: 0.09, alpha: 1.0)
        window.minSize = NSSize(width: 920, height: 600)
        window.setFrameAutosaveName("MuseoMainWindow")

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window.contentView?.addSubview(webView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func setupMainMenu() {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        // 1. Museo App Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Museo", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Sync All Boards to iCloud Drive", action: #selector(syncNow(_:)), keyEquivalent: "s")
        appMenu.addItem(withTitle: "Reveal iCloud Storage Folder…", action: #selector(revealICloud(_:)), keyEquivalent: "o")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Museo", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Museo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // 2. Edit Menu (Crucial for Cmd+C / Cmd+V / Cmd+Z / Cmd+A in WKWebView)
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // 3. View Menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        viewMenu.addItem(withTitle: "Reload Workspace", action: #selector(reloadWebView(_:)), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")

        // 4. Window Menu
        let winMenuItem = NSMenuItem()
        mainMenu.addItem(winMenuItem)
        let winMenu = NSMenu(title: "Window")
        winMenuItem.submenu = winMenu
        winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    }

    @objc func syncNow(_ sender: Any?) {
        webView.evaluateJavaScript("if (window.CS && CS.commitChange) { CS.commitChange(); CS.toast && CS.toast('Synced all boards to iCloud Drive'); }", completionHandler: nil)
    }

    @objc func revealICloud(_ sender: Any?) {
        webView.evaluateJavaScript("if (window.CS && CS.revealInFinder) { CS.revealInFinder(); }", completionHandler: nil)
    }

    @objc func reloadWebView(_ sender: Any?) {
        webView.reload()
    }

    // MARK: - WKUIDelegate (Native File Upload + JS Dialogs)
    func webView(_ webView: WKWebView,
                 runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in
            if result == .OK {
                completionHandler(panel.urls)
            } else {
                completionHandler(nil)
            }
        }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Museo"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Museo"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { resp in
            completionHandler(resp == .alertFirstButtonReturn)
        }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { resp in
            if resp == .alertFirstButtonReturn {
                completionHandler(input.stringValue)
            } else {
                completionHandler(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let proc = serverProcess, proc.isRunning {
            proc.terminate()
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
