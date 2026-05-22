import UIKit
import WebKit
import WidgetKit
import UserNotifications

private final class WeakScriptMessageDelegate: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(_ delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

private struct ReminderNotificationPlan {
    let identifier: String
    let title: String
    let body: String
    let fireDate: Date
}

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    private let appGroupIdentifier = "group.com.xuyunfan.yayaschedule"
    private let widgetPayloadKey = "homeWidgetPayload"
    private let reminderNotificationIdsKey = "reminderNotificationIds"
    private let reminderNotificationPayloadKey = "reminderNotificationPayload"
    private let reminderScheduledCountKey = "reminderScheduledCount"
    private let reminderLastSyncAtKey = "reminderLastSyncAt"
    private let legacyDdlNotificationIdsKey = "ddlNotificationIds"
    private let legacyDdlNotificationPayloadKey = "ddlNotificationPayload"
    private let accountUsernameKey = "portalUsername"
    private let accountPasswordKey = "portalPassword"
    private let portalURL = URL(string: "https://one.bnu.edu.cn/")!
    private let portalOpenCooldown: TimeInterval = 6

    private var webView: WKWebView!
    private var pendingImportJson = ""
    private var portalSessionActive = false
    private var lastPortalOpenAt: TimeInterval = 0
    private var reminderScheduleGeneration = 0

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        configuration.userContentController.addUserScript(Self.yayaNativeBridgeScript())
        configuration.userContentController.add(WeakScriptMessageDelegate(self), name: "yayaBridge")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 1.0, alpha: 1.0)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "yayaBridge")
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        UNUserNotificationCenter.current().delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(rescheduleStoredReminderNotifications),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        loadLocalApp()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url else { return }
        if isLocalAppURL(url) {
            pushReminderPermissionStatus()
            deliverPendingImportIfNeeded()
            return
        }
        if isTrustedAcademicURL(url) {
            injectPortalNavigationHelper()
            injectPortalAccountHelper()
            injectAcademicImportControls()
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if isLocalAppURL(url) || isTrustedAcademicURL(url) || portalSessionActive {
            decisionHandler(.allow)
            return
        }
        if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    private func loadLocalApp() {
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web"),
              let webRoot = Bundle.main.resourceURL?.appendingPathComponent("Web") else {
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: webRoot)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "yayaBridge",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else {
            return
        }

        switch type {
        case "updateHomeWidget":
            saveWidgetPayload(body["payload"] ?? body)
        case "scheduleReminderNotifications", "scheduleDdlNotifications":
            scheduleReminderNotifications(stringValue(body["payload"]))
        case "requestNotificationPermission", "requestReminderPermissions":
            ensureNotificationAuthorization { [weak self] _ in
                self?.pushReminderPermissionStatus()
            }
        case "savePortalAccount":
            savePortalAccount(username: stringValue(body["username"]), password: stringValue(body["password"]))
        case "setLauncherIcon":
            setLauncherIcon(stringValue(body["iconId"]))
        case "openAcademicPortal":
            openAcademicPortal()
        case "returnHome":
            portalSessionActive = false
            loadLocalApp()
        case "captureAcademicPage":
            captureAcademicPage(body)
        default:
            break
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        portalSessionActive = false
        loadLocalApp()
        completionHandler()
    }

    private func openAcademicPortal() {
        let now = Date().timeIntervalSince1970
        guard now - lastPortalOpenAt >= portalOpenCooldown else { return }
        lastPortalOpenAt = now
        portalSessionActive = true
        webView.load(URLRequest(url: portalURL))
    }

    @discardableResult
    private func savePortalAccount(username: String, password: String) -> Bool {
        guard !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.isEmpty else {
            return false
        }
        let defaults = UserDefaults.standard
        defaults.set(username, forKey: accountUsernameKey)
        defaults.set(password, forKey: accountPasswordKey)
        return true
    }

    private func setLauncherIcon(_ iconId: String) {
        guard UIApplication.shared.supportsAlternateIcons else { return }
        let iconName: String?
        switch iconId {
        case "cartoon":
            iconName = "CartoonIcon"
        case "minimal":
            iconName = "MinimalIcon"
        default:
            iconName = nil
        }
        UIApplication.shared.setAlternateIconName(iconName)
    }

    private func injectPortalNavigationHelper() {
        let script = """
        (function() {
          if (window.__yayaPortalNavigationHelper) return;
          window.__yayaPortalNavigationHelper = true;
          function forceSelf() {
            try {
              window.open = function(url) {
                if (url) {
                  try { location.href = url; } catch (error) { window.location.href = url; }
                }
                return window;
              };
            } catch (error) {}
            try {
              Array.prototype.slice.call(document.querySelectorAll('a[target],form[target],area[target]')).forEach(function(node) {
                try { node.setAttribute('target', '_self'); } catch (error) {}
              });
            } catch (error) {}
          }
          document.addEventListener('click', function(event) {
            try {
              var link = event.target && event.target.closest && event.target.closest('a[target],area[target]');
              if (link && link.href) link.setAttribute('target', '_self');
            } catch (error) {}
          }, true);
          forceSelf();
          try {
            new MutationObserver(forceSelf).observe(document.documentElement, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['target']
            });
          } catch (error) {}
          setTimeout(forceSelf, 300);
          setTimeout(forceSelf, 1000);
          setTimeout(forceSelf, 2400);
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func captureAcademicPage(_ body: [String: Any]) {
        let url = stringValue(body["url"])
        guard isTrustedAcademicURL(URL(string: url)) else { return }
        let payload: [String: Any] = [
            "kind": stringValue(body["kind"]).isEmpty ? "courses" : stringValue(body["kind"]),
            "title": stringValue(body["title"]),
            "url": url,
            "text": stringValue(body["text"]),
            "html": stringValue(body["html"])
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        pendingImportJson = json
        setPortalActionStatus("已抓取，点返回鸦鸦后导入")
    }

    private func setPortalActionStatus(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            let script = """
            window.__yayaIosAcademicStatus = \(Self.javaScriptStringLiteral(text));
            var node = document.querySelector('[data-yaya-ios-academic-status]');
            if (node) node.textContent = window.__yayaIosAcademicStatus;
            """
            self?.webView.evaluateJavaScript(script)
        }
    }

    private func deliverPendingImportIfNeeded() {
        guard !pendingImportJson.isEmpty else { return }
        let json = pendingImportJson
        pendingImportJson = ""
        let script = """
        window.__yayaPendingImport = \(Self.javaScriptStringLiteral(json));
        try { window.dispatchEvent(new Event('yaya-native-import-ready')); } catch (error) {}
        """
        webView.evaluateJavaScript(script)
    }

    private func injectPortalAccountHelper() {
        let username = UserDefaults.standard.string(forKey: accountUsernameKey) ?? ""
        let password = UserDefaults.standard.string(forKey: accountPasswordKey) ?? ""
        guard !username.isEmpty, !password.isEmpty else { return }
        let script = """
        (function() {
          var username = \(Self.javaScriptStringLiteral(username));
          var password = \(Self.javaScriptStringLiteral(password));
          function visible(el) {
            if (!el) return false;
            var r = el.getBoundingClientRect();
            var s = window.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
          }
          function setValue(el, value) {
            if (!el || el.value === value) return;
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          function clickLike(el) {
            if (!el) return false;
            try {
              if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
              el.click();
              return true;
            } catch (error) {
              try {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || window }));
                return true;
              } catch (innerError) {
                return false;
              }
            }
          }
          function allDocs() {
            var docs = [];
            function add(doc) {
              if (!doc || docs.indexOf(doc) >= 0) return;
              docs.push(doc);
              try {
                Array.prototype.slice.call(doc.querySelectorAll('iframe,frame')).forEach(function(frame) {
                  try { add(frame.contentDocument || frame.contentWindow.document); } catch (error) {}
                });
              } catch (error) {}
            }
            add(document);
            return docs;
          }
          function forceSelfWindow() {
            allDocs().forEach(function(doc) {
              try {
                var win = doc.defaultView || window;
                win.open = function(url) {
                  if (url) {
                    try { win.location.href = url; } catch (error) { location.href = url; }
                  }
                  return win;
                };
              } catch (error) {}
              try {
                Array.prototype.slice.call(doc.querySelectorAll('a[target],form[target],area[target]')).forEach(function(node) {
                  try { node.setAttribute('target', '_self'); } catch (error) {}
                });
              } catch (error) {}
            });
          }
          function loginButtonNear(passwordInput) {
            var doc = passwordInput.ownerDocument || document;
            var nodes = Array.prototype.slice.call(doc.querySelectorAll('button,input[type=button],input[type=submit],a,[role=button],.btn,.ant-btn,.el-button'));
            var best = null;
            var bestScore = -1;
            nodes.forEach(function(node) {
              if (!visible(node)) return;
              var label = String([node.innerText, node.value, node.id, node.className, node.name].join(' '));
              var score = /登录|登陆|Login|Sign\\s*In|submit/i.test(label) ? 80 : 0;
              if (passwordInput && passwordInput.form && passwordInput.form.contains(node)) score += 40;
              var nr = node.getBoundingClientRect();
              var pr = passwordInput.getBoundingClientRect();
              if (nr.top >= pr.bottom - 8 && nr.top - pr.bottom < 260) score += 40;
              if (score > bestScore) { bestScore = score; best = node; }
            });
            return bestScore >= 60 ? best : null;
          }
          function userInputNear(passwordInput) {
            var doc = passwordInput.ownerDocument || document;
            var nodes = Array.prototype.slice.call(doc.querySelectorAll('input:not([type=password])')).filter(visible);
            var best = null;
            var bestScore = -1;
            nodes.forEach(function(node) {
              var meta = String([node.name, node.id, node.placeholder, node.autocomplete, node.getAttribute && node.getAttribute('aria-label')].join(' '));
              var type = String(node.type || '').toLowerCase();
              if (/hidden|submit|button|checkbox|radio|file|date|time|range|color/.test(type)) return;
              var score = /user|account|login|name|id|学号|账号|用户名|工号|手机号/i.test(meta) ? 80 : 20;
              if (passwordInput.form && passwordInput.form.contains(node)) score += 40;
              var nr = node.getBoundingClientRect();
              var pr = passwordInput.getBoundingClientRect();
              if (nr.top <= pr.top && pr.top - nr.top < 260) score += 30;
              if (score > bestScore) { bestScore = score; best = node; }
            });
            return best;
          }
          var tries = 0;
          function step() {
            tries += 1;
            forceSelfWindow();
            var docs = allDocs();
            for (var i = 0; i < docs.length; i += 1) {
              var passwordInput = Array.prototype.slice.call(docs[i].querySelectorAll('input[type=password]')).filter(visible)[0];
              if (!passwordInput) continue;
              var userInput = userInputNear(passwordInput);
              setValue(userInput, username);
              setValue(passwordInput, password);
              if (!window.__yayaIosLoginClicked) {
                var button = loginButtonNear(passwordInput);
                if (button && clickLike(button)) window.__yayaIosLoginClicked = true;
              }
              break;
            }
            if (tries < 28) setTimeout(step, 500);
          }
          step();
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func injectAcademicImportControls() {
        let script = """
        (function() {
          if (window.__yayaIosAcademicControls) return;
          window.__yayaIosAcademicControls = true;
          function capture(kind) {
            try {
              window.webkit.messageHandlers.yayaBridge.postMessage({
                type: 'captureAcademicPage',
                kind: kind,
                title: document.title || '',
                url: location.href,
                text: document.body ? document.body.innerText : '',
                html: document.documentElement ? document.documentElement.outerHTML : ''
              });
            } catch (error) {}
          }
          function send(type) {
            try { window.webkit.messageHandlers.yayaBridge.postMessage({ type: type }); } catch (error) {}
          }
          var box = document.createElement('div');
          box.setAttribute('aria-label', '鸦鸦日程导入工具');
          box.style.cssText = [
            'position:fixed',
            'left:16px',
            'right:16px',
            'bottom:calc(18px + env(safe-area-inset-bottom, 0px))',
            'z-index:2147483647',
            'display:grid',
            'grid-template-columns:1fr 1fr 1fr',
            'gap:10px',
            'padding:12px',
            'border-radius:22px',
            'background:rgba(255,255,255,.82)',
            'box-shadow:0 16px 42px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.8)',
            '-webkit-backdrop-filter:blur(18px) saturate(1.2)',
            'backdrop-filter:blur(18px) saturate(1.2)',
            'touch-action:none'
          ].join(';');
          function button(text, color, action) {
            var node = document.createElement('button');
            node.type = 'button';
            node.textContent = text;
            node.style.cssText = [
              'min-height:48px',
              'border:0',
              'border-radius:16px',
              'font-size:15px',
              'font-weight:800',
              'color:white',
              'background:' + color,
              'box-shadow:0 8px 20px rgba(37,99,235,.16)'
            ].join(';');
            node.addEventListener('click', function(event) {
              event.preventDefault();
              event.stopPropagation();
              action();
            });
            return node;
          }
          box.appendChild(button('导入课表', 'linear-gradient(135deg,#2563eb,#14b8a6)', function(){ capture('courses'); }));
          box.appendChild(button('导入考试', 'linear-gradient(135deg,#7c3aed,#2563eb)', function(){ capture('exams'); }));
          box.appendChild(button('返回鸦鸦', 'linear-gradient(135deg,#111827,#64748b)', function(){ send('returnHome'); }));
          var status = document.createElement('div');
          status.setAttribute('data-yaya-ios-academic-status', 'true');
          status.textContent = window.__yayaIosAcademicStatus || '登录后可导入课表或考试';
          status.style.cssText = [
            'grid-column:1 / -1',
            'font-size:12px',
            'font-weight:700',
            'color:rgba(15,23,42,.72)',
            'text-align:center',
            'padding:2px 4px 0'
          ].join(';');
          box.appendChild(status);
          var sx = 0, sy = 0, startLeft = 0, startTop = 0, dragging = false;
          box.addEventListener('pointerdown', function(event) {
            dragging = true;
            sx = event.clientX;
            sy = event.clientY;
            var r = box.getBoundingClientRect();
            startLeft = r.left;
            startTop = r.top;
            box.setPointerCapture(event.pointerId);
          });
          box.addEventListener('pointermove', function(event) {
            if (!dragging) return;
            var left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, startLeft + event.clientX - sx));
            var top = Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, startTop + event.clientY - sy));
            box.style.left = left + 'px';
            box.style.right = 'auto';
            box.style.top = top + 'px';
            box.style.bottom = 'auto';
          });
          box.addEventListener('pointerup', function(event) {
            dragging = false;
            try { box.releasePointerCapture(event.pointerId); } catch (error) {}
          });
          document.documentElement.appendChild(box);
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func isLocalAppURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.isFileURL && url.lastPathComponent == "index.html"
    }

    private func isTrustedAcademicURL(_ url: URL?) -> Bool {
        guard let url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return false }
        let host = (url.host ?? "").lowercased()
        if host == "bnu.edu.cn" || host.hasSuffix(".bnu.edu.cn") { return true }
        return host.contains("bnu") || host.contains("jw") || host.contains("jwc") || host.contains("xk") || host.contains("zf")
    }

    private func ensureNotificationAuthorization(_ completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                completion(true)
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    completion(granted)
                }
            case .denied:
                completion(false)
            @unknown default:
                completion(false)
            }
        }
    }

    private func pushReminderPermissionStatus() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            center.getPendingNotificationRequests { requests in
                guard let self else { return }
                let reminderRequests = requests.filter { $0.identifier.hasPrefix("reminder-") }
                let defaults = UserDefaults.standard
                let storedCount: Int
                if defaults.object(forKey: self.reminderScheduledCountKey) == nil {
                    storedCount = reminderRequests.count
                } else {
                    storedCount = defaults.integer(forKey: self.reminderScheduledCountKey)
                }
                let canNotify: Bool
                let notificationState: String
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    canNotify = true
                    notificationState = "ready"
                case .denied:
                    canNotify = false
                    notificationState = "blocked"
                case .notDetermined:
                    canNotify = false
                    notificationState = "ask"
                @unknown default:
                    canNotify = false
                    notificationState = "unknown"
                }
                let soundState: String
                let canSound: Bool
                switch settings.soundSetting {
                case .enabled:
                    soundState = "enabled"
                    canSound = true
                case .disabled:
                    soundState = "blocked"
                    canSound = false
                case .notSupported:
                    soundState = "notSupported"
                    canSound = true
                @unknown default:
                    soundState = "unknown"
                    canSound = false
                }
                let payload: [String: Any] = [
                    "native": true,
                    "notifications": notificationState,
                    "sound": soundState,
                    "exactAlarms": "ios",
                    "scheduledCount": storedCount,
                    "lastSyncAt": defaults.double(forKey: self.reminderLastSyncAtKey),
                    "canNotify": canNotify,
                    "canSound": canSound,
                    "canExact": true,
                    "needsAction": !canNotify || (canNotify && !canSound)
                ]
                guard JSONSerialization.isValidJSONObject(payload),
                      let data = try? JSONSerialization.data(withJSONObject: payload),
                      let json = String(data: data, encoding: .utf8) else {
                    return
                }
                DispatchQueue.main.async {
                    let script = """
                    window.__yayaReminderPermissionStatus = \(Self.javaScriptStringLiteral(json));
                    try { window.dispatchEvent(new Event('yaya-reminder-permission-updated')); } catch (error) {}
                    """
                    self.webView.evaluateJavaScript(script)
                }
            }
        }
    }

    @objc private func rescheduleStoredReminderNotifications() {
        pushReminderPermissionStatus()
        let defaults = UserDefaults.standard
        let payload = defaults.string(forKey: reminderNotificationPayloadKey)
            ?? defaults.string(forKey: legacyDdlNotificationPayloadKey)
            ?? ""
        guard !payload.isEmpty else { return }
        scheduleReminderNotifications(payload, persistPayload: false)
    }

    private func scheduleReminderNotifications(_ rawPayload: String, persistPayload: Bool = true) {
        reminderScheduleGeneration += 1
        let generation = reminderScheduleGeneration
        let center = UNUserNotificationCenter.current()
        let defaults = UserDefaults.standard
        let safePayload = rawPayload.isEmpty ? "[]" : rawPayload
        if persistPayload {
            defaults.set(safePayload, forKey: reminderNotificationPayloadKey)
            defaults.removeObject(forKey: legacyDdlNotificationPayloadKey)
        }
        let oldIds = (defaults.stringArray(forKey: reminderNotificationIdsKey) ?? [])
            + (defaults.stringArray(forKey: legacyDdlNotificationIdsKey) ?? [])

        func clearPendingQueue() {
            guard generation == reminderScheduleGeneration else { return }
            if !oldIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: oldIds)
            }
            defaults.set([], forKey: reminderNotificationIdsKey)
            defaults.set(0, forKey: reminderScheduledCountKey)
            defaults.set(Date().timeIntervalSince1970, forKey: reminderLastSyncAtKey)
            defaults.removeObject(forKey: legacyDdlNotificationIdsKey)
            defaults.synchronize()
            pushReminderPermissionStatus()
        }

        guard let data = safePayload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let items = object as? [[String: Any]] else {
            clearPendingQueue()
            return
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false

        var plans: [ReminderNotificationPlan] = []
        let now = Date()
        for item in items {
            let id = stringValue(item["id"])
            let date = stringValue(item["date"])
            let time = stringValue(item["time"]).isEmpty ? "23:59" : stringValue(item["time"])
            let kind = stringValue(item["kind"])
            let topicFallback = kind == "schedule" ? "日程" : "DDL"
            let topic = stringValue(item["topic"]).isEmpty ? topicFallback : stringValue(item["topic"])
            let titlePrefix = kind == "schedule" ? "日程提醒：" : "DDL提醒："
            let defaultTimeLabel = kind == "schedule" ? "开始" : "截止"
            let timeLabel = stringValue(item["timeLabel"]).isEmpty ? defaultTimeLabel : stringValue(item["timeLabel"])
            let detail = stringValue(item["content"])
            guard !id.isEmpty,
                  let deadline = formatter.date(from: "\(date) \(time)"),
                  let reminders = item["reminders"] as? [Any] else {
                continue
            }

            for reminder in reminders {
                guard let minutes = Int(stringValue(reminder)), minutes > 0 else { continue }
                let fireDate = deadline.addingTimeInterval(TimeInterval(-minutes * 60))
                if fireDate <= now.addingTimeInterval(1) { continue }
                let identifier = "reminder-\(id)-\(minutes)"
                let title = "\(titlePrefix)\(topic)"
                let body = "\(ddlReminderLabel(minutes)) · \(timeLabel) \(date) \(time)" + (detail.isEmpty ? "" : "\n\(detail)")
                plans.append(ReminderNotificationPlan(identifier: identifier, title: title, body: body, fireDate: fireDate))
            }
        }

        let nextPlans = plans.sorted { $0.fireDate < $1.fireDate }.prefix(64)
        guard !nextPlans.isEmpty else {
            clearPendingQueue()
            return
        }

        ensureNotificationAuthorization { [weak self] granted in
            guard let self else { return }
            guard generation == self.reminderScheduleGeneration else { return }
            guard granted else {
                if !oldIds.isEmpty {
                    center.removePendingNotificationRequests(withIdentifiers: oldIds)
                }
                defaults.set([], forKey: self.reminderNotificationIdsKey)
                defaults.set(0, forKey: self.reminderScheduledCountKey)
                defaults.set(Date().timeIntervalSince1970, forKey: self.reminderLastSyncAtKey)
                defaults.removeObject(forKey: self.legacyDdlNotificationIdsKey)
                defaults.synchronize()
                self.pushReminderPermissionStatus()
                return
            }
            if !oldIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: oldIds)
            }
            var nextIds: [String] = []
            for plan in nextPlans {
                let content = UNMutableNotificationContent()
                content.title = plan.title
                content.body = plan.body
                content.sound = .default
                content.categoryIdentifier = "reminder"

                var components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: plan.fireDate)
                components.calendar = Calendar.current
                components.timeZone = TimeZone.current
                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                center.add(UNNotificationRequest(identifier: plan.identifier, content: content, trigger: trigger))
                nextIds.append(plan.identifier)
            }
            defaults.set(nextIds, forKey: self.reminderNotificationIdsKey)
            defaults.set(nextIds.count, forKey: self.reminderScheduledCountKey)
            defaults.set(Date().timeIntervalSince1970, forKey: self.reminderLastSyncAtKey)
            defaults.removeObject(forKey: self.legacyDdlNotificationIdsKey)
            defaults.synchronize()
            self.pushReminderPermissionStatus()
        }
    }

    private func saveWidgetPayload(_ raw: Any) {
        let values = widgetValues(from: raw)
        let progress = min(max(numberValue(values[safe: 6]), 0), 100)
        let cleanPayload: [String: Any] = [
            "ddlTitle": stringValue(values[safe: 0], fallback: "暂无 DDL"),
            "ddlTime": stringValue(values[safe: 1]),
            "scheduleTitle": stringValue(values[safe: 2], fallback: "暂无课程或日程"),
            "scheduleTime": stringValue(values[safe: 3]),
            "schedulePlace": stringValue(values[safe: 4]),
            "scheduleLabel": stringValue(values[safe: 5], fallback: "最近日程"),
            "scheduleProgress": progress,
            "scheduleActive": boolValue(values[safe: 7]),
            "theme": widgetThemePayload(values[safe: 8]),
            "updatedAt": Date().timeIntervalSince1970
        ]

        guard JSONSerialization.isValidJSONObject(cleanPayload),
              let data = try? JSONSerialization.data(withJSONObject: cleanPayload) else {
            return
        }
        let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard
        defaults.set(data, forKey: widgetPayloadKey)
        defaults.synchronize()
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func widgetValues(from raw: Any) -> [Any] {
        if let values = raw as? [Any] { return values }
        if let text = raw as? String,
           let data = text.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) {
            if let values = object as? [Any] {
                return values
            }
            if let dictionary = object as? [String: Any] {
                return widgetValues(from: dictionary)
            }
        }
        if let dictionary = raw as? [String: Any] {
            return [
                dictionary["ddlTitle"] ?? "",
                dictionary["ddlTime"] ?? "",
                dictionary["scheduleTitle"] ?? "",
                dictionary["scheduleTime"] ?? "",
                dictionary["schedulePlace"] ?? "",
                dictionary["scheduleLabel"] ?? "",
                dictionary["scheduleProgress"] ?? 0,
                dictionary["scheduleActive"] ?? false,
                dictionary["theme"] ?? [:]
            ]
        }
        return []
    }

    private func widgetThemePayload(_ raw: Any?) -> [String: Any] {
        var dictionary: [String: Any] = [:]
        if let raw = raw as? [String: Any] {
            dictionary = raw
        } else if let text = raw as? String,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let raw = object as? [String: Any] {
            dictionary = raw
        }

        return [
            "themeId": stringValue(dictionary["themeId"], fallback: "coolGlass"),
            "accent": normalizedWidgetColor(dictionary["accent"], fallback: "#2563eb"),
            "warm": normalizedWidgetColor(dictionary["warm"], fallback: "#14b8a6"),
            "bg": normalizedWidgetColor(dictionary["bg"], fallback: "#edf5ff"),
            "ink": normalizedWidgetColor(dictionary["ink"], fallback: "#14213d"),
            "muted": normalizedWidgetColor(dictionary["muted"], fallback: "#64748b"),
            "glassAlpha": min(max(numberValue(dictionary["glassAlpha"]), 18), 96),
            "radius": min(max(numberValue(dictionary["radius"]), 10), 30)
        ]
    }

    private func normalizedWidgetColor(_ value: Any?, fallback: String) -> String {
        let text = stringValue(value).trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = "^#[0-9a-fA-F]{6}$"
        if text.range(of: pattern, options: .regularExpression) != nil {
            return text.lowercased()
        }
        return fallback
    }

    private func ddlReminderLabel(_ minutes: Int) -> String {
        switch minutes {
        case 10080: return "一周前"
        case 1440: return "一天前"
        case 600: return "十小时前"
        case 180: return "三小时前"
        case 120: return "两小时前"
        case 60: return "一小时前"
        case 30: return "半小时前"
        case 10: return "十分钟前"
        default: return "提醒"
        }
    }

    private func stringValue(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value.isEmpty ? fallback : value }
        if let value { return String(describing: value) }
        return fallback
    }

    private func numberValue(_ value: Any?) -> Double {
        if let value = value as? Double { return value.isFinite ? value : 0 }
        if let value = value as? NSNumber {
            let result = value.doubleValue
            return result.isFinite ? result : 0
        }
        if let value = value as? String, let result = Double(value) {
            return result.isFinite ? result : 0
        }
        return 0
    }

    private func boolValue(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String { return value == "true" || value == "1" }
        return false
    }

    private static func javaScriptStringLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let arrayLiteral = String(data: data, encoding: .utf8),
              arrayLiteral.count >= 2 else {
            return "\"\""
        }
        return String(arrayLiteral.dropFirst().dropLast())
    }

    private static func yayaNativeBridgeScript() -> WKUserScript {
        let fallback = #"{"native":true,"notifications":"unknown","sound":"unknown","exactAlarms":"ios","scheduledCount":0,"lastSyncAt":0,"canNotify":false,"canSound":false,"canExact":true,"needsAction":true}"#
        let source = """
        (function() {
          if (window.YayaNative && window.YayaNative.__iosBridgeReady) return;
          window.__yayaPendingImport = window.__yayaPendingImport || "";
          window.__yayaReminderPermissionStatus = window.__yayaReminderPermissionStatus || \(javaScriptStringLiteral(fallback));
          function post(type, payload) {
            try {
              payload = payload || {};
              payload.type = type;
              window.webkit.messageHandlers.yayaBridge.postMessage(payload);
              return true;
            } catch (error) {
              return false;
            }
          }
          window.YayaNative = {
            __iosBridgeReady: true,
            savePortalAccount: function(username, password) {
              username = String(username || "");
              password = String(password || "");
              if (!username || !password) return false;
              return post("savePortalAccount", { username: username, password: password });
            },
            setLauncherIcon: function(iconId) {
              return post("setLauncherIcon", { iconId: String(iconId || "") });
            },
            openAcademicPortal: function() {
              return post("openAcademicPortal");
            },
            takeImportedPage: function() {
              var value = String(window.__yayaPendingImport || "");
              window.__yayaPendingImport = "";
              return value;
            },
            requestNotificationPermission: function() {
              return post("requestNotificationPermission");
            },
            getReminderPermissionStatus: function() {
              return String(window.__yayaReminderPermissionStatus || \(javaScriptStringLiteral(fallback)));
            },
            requestReminderPermissions: function() {
              return post("requestReminderPermissions");
            },
            scheduleReminderNotifications: function(payload) {
              return post("scheduleReminderNotifications", { payload: String(payload || "[]") });
            },
            scheduleDdlNotifications: function(payload) {
              return post("scheduleReminderNotifications", { payload: String(payload || "[]") });
            },
            updateHomeWidget: function(payload) {
              var value = typeof payload === "string" ? payload : JSON.stringify(payload || {});
              return post("updateHomeWidget", { payload: value });
            }
          };
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
