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
            injectPortalAccountHelper()
            injectAcademicImportControlsV2()
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
        case "requestNotificationPermission":
            requestIOSNotificationPermission(openSettingsWhenDenied: false)
        case "requestReminderPermissions":
            requestIOSNotificationPermission(openSettingsWhenDenied: true)
        case "requestBackgroundRunPermission":
            pushReminderPermissionStatus()
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
        guard notification.request.content.categoryIdentifier != "reminder" else {
            completionHandler([])
            return
        }
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list])
        } else {
            completionHandler([.alert])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        center.removeDeliveredNotifications(withIdentifiers: [response.notification.request.identifier])
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
            "kind": normalizedAcademicImportKind(stringValue(body["kind"])),
            "title": stringValue(body["title"]),
            "url": url,
            "text": limitedImportText(stringValue(body["text"])),
            "html": limitedImportText(stringValue(body["html"])),
            "termLabel": stringValue(body["termLabel"]),
            "termStart": stringValue(body["termStart"]),
            "confirmedTerm": boolValue(body["confirmedTerm"])
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        pendingImportJson = json
        setPortalActionStatus(boolValue(body["confirmedTerm"]) ? "已确认，正在返回鸦鸦导入" : "已抓取，正在返回鸦鸦导入")
    }

    private func normalizedAcademicImportKind(_ value: String) -> String {
        let kind = value.lowercased()
        return kind == "exam" || kind == "exams" ? "exam" : "course"
    }

    private func limitedImportText(_ value: String) -> String {
        let maxLength = 1_200_000
        guard value.count > maxLength else { return value }
        let headLength = 820_000
        let tailLength = maxLength - headLength
        let head = value.prefix(headLength)
        let tail = value.suffix(tailLength)
        return "\(head)\n<!-- yaya-import-truncated \(value.count) chars; preserved head and tail -->\n\(tail)"
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
          if (window.__yayaPortalAssistVersion === 'manual-prefill-v1') return;
          window.__yayaPortalAssistVersion = 'manual-prefill-v1';
          var username = \(Self.javaScriptStringLiteral(username));
          var password = \(Self.javaScriptStringLiteral(password));
          function visible(el) {
            if (!el) return false;
            var r = el.getBoundingClientRect();
            var s = el.ownerDocument.defaultView.getComputedStyle(el);
            var aria = String(el.getAttribute && el.getAttribute('aria-disabled') || '');
            var cls = String(el.className || '');
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && !el.readOnly && aria !== 'true' && !/disabled|is-disabled|btn-disabled/.test(cls);
          }
          function setValue(el, value) {
            if (!el || el.value === value) return;
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          function labelText(el) {
            try { return String([el.innerText, el.textContent, el.value, el.title, el.getAttribute && el.getAttribute('aria-label')].join(' ')).replace(/\\s+/g, ' ').trim(); } catch (error) { return ''; }
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
          function userInputNear(passwordInput) {
            var doc = passwordInput.ownerDocument || document;
            var nodes = Array.prototype.slice.call(doc.querySelectorAll('input:not([type=password])')).filter(visible);
            for (var i = 0; i < nodes.length; i += 1) {
              var node = nodes[i];
              var meta = String([node.name, node.id, node.placeholder, node.autocomplete, node.getAttribute && node.getAttribute('aria-label')].join(' '));
              var type = String(node.type || '').toLowerCase();
              if (/hidden|submit|button|checkbox|radio|file|date|time|range|color/.test(type)) continue;
              if (/user|account|login|name|id|学号|账号|用户名|工号|手机号/i.test(meta)) return node;
            }
            for (var j = 0; j < nodes.length; j += 1) {
              if (passwordInput.form && passwordInput.form.contains(nodes[j])) return nodes[j];
            }
            return nodes[0] || null;
          }
          function prefill() {
            forceSelfWindow();
            var docs = allDocs();
            for (var d = 0; d < docs.length; d += 1) {
              var doc = docs[d];
              var passwordInput = Array.prototype.slice.call(doc.querySelectorAll('input[type=password]')).filter(visible)[0];
              if (!passwordInput) continue;
              var userInput = userInputNear(passwordInput);
              if (userInput && !userInput.dataset.yayaPrefilled && !userInput.value) {
                setValue(userInput, username);
                userInput.dataset.yayaPrefilled = '1';
              }
              if (!passwordInput.dataset.yayaPrefilled && !passwordInput.value) {
                setValue(passwordInput, password);
                passwordInput.dataset.yayaPrefilled = '1';
              }
              return;
            }
          }
          function observe() {
            allDocs().forEach(function(doc) {
              if (doc.__yayaManualPrefillObserver) return;
              try {
                doc.__yayaManualPrefillObserver = new MutationObserver(function() {
                  clearTimeout(window.__yayaManualPrefillTimer);
                  window.__yayaManualPrefillTimer = setTimeout(prefill, 180);
                });
                doc.__yayaManualPrefillObserver.observe(doc.documentElement || doc, { subtree: true, childList: true, attributes: true });
              } catch (error) {
              }
            });
          }
          prefill();
          setTimeout(prefill, 650);
          observe();
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func injectAcademicImportControlsV2() {
        let script = """
        (function() {
          if (window.__yayaIosAcademicControlsV2) return;
          window.__yayaIosAcademicControlsV2 = true;
          function post(type, payload) {
            try {
              payload = payload || {};
              payload.type = type;
              window.webkit.messageHandlers.yayaBridge.postMessage(payload);
              return true;
            } catch (error) { return false; }
          }
          function norm(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }
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
          function selectedTerms(doc) {
            var out = [];
            try {
              var nodes = doc.querySelectorAll('select,input[type=radio],input[type=checkbox],input[type=hidden],input[type=text]');
              for (var i = 0; i < nodes.length; i += 1) {
                var el = nodes[i];
                var meta = norm([el.name, el.id, el.className, el.title, el.getAttribute && el.getAttribute('aria-label')].join(' '));
                if (!/学期|学年|semester|term|xq|xn|xnm|xqm/i.test(meta)) continue;
                if (el.tagName && el.tagName.toLowerCase() === 'select') {
                  var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
                  out.push('当前选中学期 ' + meta + ' ' + norm(el.value) + ' ' + norm(opt && (opt.text || opt.value)));
                } else {
                  var type = String(el.type || '').toLowerCase();
                  if ((type === 'radio' || type === 'checkbox') && !el.checked) continue;
                  if (el.value || el.checked) out.push('当前学期字段 ' + meta + ' ' + norm(el.value));
                }
              }
            } catch (error) {}
            return out.join('\\n');
          }
          function collect() {
            var html = '', text = '';
            var docs = allDocs();
            for (var i = 0; i < docs.length; i += 1) {
              var doc = docs[i];
              try {
                html += '\\n<!-- yaya-doc-' + i + ' -->\\n' + (doc.body ? doc.body.innerHTML : (doc.documentElement ? doc.documentElement.outerHTML : ''));
                text += '\\n' + selectedTerms(doc) + '\\n' + (doc.body ? doc.body.innerText : '');
              } catch (error) {}
            }
            return { html: html, text: text };
          }
          function mark(data) { return norm(data.text).slice(0, 18000); }
          function visible(el) {
            try {
              var s = el.ownerDocument.defaultView.getComputedStyle(el);
              var r = el.getBoundingClientRect();
              return s.display !== 'none' && s.visibility !== 'hidden' && r.width >= 0 && r.height >= 0;
            } catch (error) { return true; }
          }
          function disabled(el) {
            if (!el) return false;
            var cls = String(el.className || '');
            var aria = String(el.getAttribute && el.getAttribute('aria-disabled') || '');
            return !!(el.disabled || aria === 'true' || /disabled|layui-disabled|is-disabled|ant-pagination-disabled|btn-disabled/.test(cls) || disabled(el.parentElement && el.parentElement !== document.body ? el.parentElement : null));
          }
          function targetOf(el) {
            if (!el) return null;
            if (el.matches && el.matches('button,a')) return el;
            return (el.querySelector && el.querySelector('button,a')) || el;
          }
          function usable(el) {
            var t = targetOf(el);
            return t && visible(t) && !disabled(t);
          }
          function findNext() {
            var docs = allDocs();
            var selectors = ['.layui-laypage-next','.el-pagination .btn-next','.ant-pagination-next button','.ant-pagination-next','button[aria-label*=Next]','button[aria-label*=下一]','a[aria-label*=Next]','a[aria-label*=下一]','a[title*=下一]','button[title*=下一]','li[title*=下一]'];
            for (var d = 0; d < docs.length; d += 1) {
              var doc = docs[d];
              for (var s = 0; s < selectors.length; s += 1) {
                try {
                  var list = doc.querySelectorAll(selectors[s]);
                  for (var i = 0; i < list.length; i += 1) if (usable(list[i])) return targetOf(list[i]);
                } catch (error) {}
              }
              try {
                var nodes = doc.querySelectorAll('a,button,li,span');
                for (var n = 0; n < nodes.length; n += 1) {
                  var el = nodes[n];
                  var txt = norm(el.textContent);
                  var title = norm(el.getAttribute && el.getAttribute('title'));
                  var aria = norm(el.getAttribute && el.getAttribute('aria-label'));
                  var cls = String(el.className || '');
                  if (txt === '下一页' || txt === '下页' || txt === '>' || txt === '›' || txt === '»' || title.indexOf('下一') >= 0 || aria.indexOf('下一') >= 0 || /next/i.test(cls)) {
                    if (usable(el)) return targetOf(el);
                  }
                }
              } catch (error) {}
            }
            return null;
          }
          function clickNext(el) {
            try { el.scrollIntoView({ block: 'center' }); } catch (error) {}
            try { el.click(); } catch (error) {
              try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView })); } catch (innerError) {}
            }
          }
          function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
          async function crawl(kind) {
            if (window.__yayaIosAcademicImportBusy) return null;
            window.__yayaIosAcademicImportBusy = true;
            try {
              var pages = [], seen = {};
              for (var page = 0; page < 80; page += 1) {
                var data = collect();
                var key = mark(data);
                if (key && !seen[key]) { seen[key] = 1; pages.push(data); }
                var next = findNext();
                if (!next) break;
                var before = key;
                clickNext(next);
                var changed = false;
                for (var t = 0; t < 34; t += 1) {
                  await sleep(260);
                  var now = mark(collect());
                  if (now && now !== before) { changed = true; break; }
                }
                if (!changed) break;
              }
              if (!pages.length) pages.push(collect());
              return {
                pages: pages.length,
                html: pages.map(function(p, i) { return '\\n<!-- yaya-page-' + (i + 1) + ' -->\\n' + p.html; }).join('\\n'),
                text: pages.map(function(p) { return p.text; }).join('\\n')
              };
            } finally {
              window.__yayaIosAcademicImportBusy = false;
            }
          }
          function ymd(date) {
            var y = date.getFullYear();
            var m = String(date.getMonth() + 1).padStart(2, '0');
            var d = String(date.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + d;
          }
          function monday(year, month, day) {
            var d = new Date(year, month - 1, day);
            while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
            return ymd(d);
          }
          function guessTerm(raw) {
            var text = norm(raw);
            var m = text.match(/(20\\d{2})\\s*[-—–~至]\\s*(20\\d{2}).{0,40}?(春季|秋季|夏季|第?\\s*[一二12]\\s*学期|[上下]学期|12|16|[123])?/);
            var now = new Date();
            var first = m ? Number(m[1]) : now.getFullYear();
            var second = m ? Number(m[2]) : first + 1;
            var hint = m && m[3] ? m[3] : '';
            var kind = /夏|16|03|3/.test(hint) ? 'summer' : /春|下|第二|二|2|12/.test(hint) ? 'spring' : 'autumn';
            var label = first + '-' + second + '学年' + (kind === 'spring' ? '春季学期' : kind === 'summer' ? '夏季学期' : '秋季学期');
            var start = kind === 'spring' ? monday(second, 2, 20) : kind === 'summer' ? monday(second, 6, 20) : monday(first, 9, 1);
            return { label: label, start: start };
          }
          function setStatus(text) {
            window.__yayaIosAcademicStatus = text;
            var node = document.querySelector('[data-yaya-ios-academic-status]');
            if (node) node.textContent = text;
          }
          function showTermDialog(data) {
            var old = document.getElementById('yaya-term-confirm');
            if (old) old.remove();
            var info = guessTerm((data && data.text || '') + '\\n' + (data && data.html || ''));
            var back = document.createElement('div');
            back.id = 'yaya-term-confirm';
            back.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);touch-action:none';
            ['touchmove','wheel','pointerdown'].forEach(function(type) {
              back.addEventListener(type, function(event) {
                if (event.target === back) { event.preventDefault(); event.stopPropagation(); }
              }, { capture: true, passive: false });
            });
            var card = document.createElement('form');
            card.style.cssText = 'width:min(360px,calc(100vw - 28px));display:grid;gap:12px;padding:16px;border-radius:24px;border:1px solid rgba(255,255,255,.72);background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(232,242,255,.86));box-shadow:0 22px 52px rgba(24,48,90,.28),inset 0 1px 0 rgba(255,255,255,.9);font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;color:#16233a';
            card.innerHTML = '<strong style="font-size:18px">确认学期</strong><span style="font-size:12px;color:rgba(22,35,58,.68)">已采集 ' + (data && data.pages || 1) + ' 页课表，请确认后写入鸦鸦日程。</span><label style="display:grid;gap:6px;font-weight:800;font-size:13px">开学日期<input name="termStart" type="date" value="' + info.start + '" style="height:44px;border-radius:15px;border:1px solid rgba(37,99,235,.18);padding:0 12px;font:inherit"></label><label style="display:grid;gap:6px;font-weight:800;font-size:13px">学期名称<input name="termLabel" type="text" value="' + info.label + '" style="height:44px;border-radius:15px;border:1px solid rgba(37,99,235,.18);padding:0 12px;font:inherit"></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button type="button" data-cancel style="height:46px;border:0;border-radius:16px;background:rgba(100,116,139,.14);font-weight:900;color:#334155">取消</button><button type="submit" style="height:46px;border:0;border-radius:16px;background:linear-gradient(135deg,#2563eb,#14b8a6);font-weight:900;color:white">确认导入</button></div>';
            card.querySelector('[data-cancel]').onclick = function() { back.remove(); };
            card.onsubmit = function(event) {
              event.preventDefault();
              var label = card.elements.termLabel.value || info.label;
              var start = card.elements.termStart.value || info.start;
              post('captureAcademicPage', { kind: 'course', title: (document.title || '') + ' 共' + (data && data.pages || 1) + '页', url: location.href, text: data.text, html: data.html, termLabel: label, termStart: start, confirmedTerm: true });
              setStatus('已确认，正在返回鸦鸦导入');
              setTimeout(function() { post('returnHome'); }, 160);
            };
            back.appendChild(card);
            document.documentElement.appendChild(back);
          }
          function makePanel() {
            var old = document.getElementById('yaya-sync-panel');
            if (old) old.remove();
            var box = document.createElement('div');
            box.id = 'yaya-sync-panel';
            box.setAttribute('aria-label', '鸦鸦日程导入工具');
            box.style.cssText = 'position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:2147483646;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:176px;max-width:min(260px,calc(100vw - 28px));padding:11px 12px 12px;border:1px solid rgba(255,255,255,.72);border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(232,242,255,.78));box-shadow:0 18px 46px rgba(24,48,90,.26),inset 0 1px 0 rgba(255,255,255,.86);-webkit-backdrop-filter:blur(18px) saturate(1.35);backdrop-filter:blur(18px) saturate(1.35);font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;color:#16233a;user-select:none;-webkit-user-select:none;touch-action:none';
            var handle = document.createElement('div');
            handle.style.cssText = 'grid-column:1/-1;height:18px;display:grid;place-items:center;cursor:move;touch-action:none;margin:-3px 0 -1px';
            handle.innerHTML = '<i style="display:block;width:48px;height:5px;border-radius:999px;background:linear-gradient(90deg,rgba(37,99,235,.45),rgba(20,184,166,.5));box-shadow:0 1px 0 rgba(255,255,255,.8),0 6px 12px rgba(37,99,235,.16)"></i>';
            box.appendChild(handle);
            function button(text, tone, fn) {
              var node = document.createElement('button');
              node.type = 'button';
              node.textContent = text;
              var skin = tone === 'home'
                ? 'linear-gradient(135deg,rgba(255,255,255,.92),rgba(239,246,255,.74));color:#1f3b66;border-color:rgba(37,99,235,.18)'
                : tone === 'exam' ? 'linear-gradient(135deg,#5b6ee1,#8b5cf6)' : 'linear-gradient(135deg,#2563eb,#14b8a6)';
              node.style.cssText = 'min-height:48px;border:1px solid rgba(255,255,255,.64);border-radius:17px;padding:0 14px;font-size:14px;font-weight:900;line-height:1.12;color:#fff;background:' + skin + ';box-shadow:0 10px 22px rgba(42,87,150,.20),inset 0 1px 0 rgba(255,255,255,.42);touch-action:manipulation';
              if (tone === 'home') node.style.gridColumn = '1/-1';
              node.onclick = function(event) { event.preventDefault(); event.stopPropagation(); fn(node); };
              box.appendChild(node);
              return node;
            }
            button('导入课表', 'course', function(node) {
              node.textContent = '采集中...';
              setStatus('正在分页采集课表');
              crawl('course').then(function(data) {
                node.textContent = '导入课表';
                if (!data) { setStatus('未抓取到内容，请换页面重试'); return; }
                setStatus('请在弹窗确认学期');
                showTermDialog(data);
              });
            });
            button('导入考试', 'exam', function(node) {
              node.textContent = '采集中...';
              setStatus('正在分页采集考试');
              crawl('exam').then(function(data) {
                node.textContent = '导入考试';
                if (!data) { setStatus('未抓取到内容，请换页面重试'); return; }
                post('captureAcademicPage', { kind: 'exam', title: (document.title || '') + ' 共' + (data.pages || 1) + '页', url: location.href, text: data.text, html: data.html });
                setStatus('已抓取，正在返回鸦鸦导入');
                setTimeout(function() { post('returnHome'); }, 180);
              });
            });
            button('返回鸦鸦', 'home', function() { post('returnHome'); });
            var status = document.createElement('div');
            status.setAttribute('data-yaya-ios-academic-status', 'true');
            status.textContent = window.__yayaIosAcademicStatus || '登录后可导入课表或考试';
            status.style.cssText = 'grid-column:1 / -1;font-size:12px;font-weight:800;color:rgba(15,23,42,.72);text-align:center;padding:2px 4px 0';
            box.appendChild(status);
            function clamp(left, top) {
              var margin = 10, r = box.getBoundingClientRect();
              var maxLeft = Math.max(margin, window.innerWidth - r.width - margin);
              var maxTop = Math.max(margin, window.innerHeight - r.height - margin);
              return { x: Math.min(Math.max(left, margin), maxLeft), y: Math.min(Math.max(top, margin), maxTop) };
            }
            function place(left, top) {
              var p = clamp(left, top);
              box.style.left = Math.round(p.x) + 'px';
              box.style.top = Math.round(p.y) + 'px';
              box.style.right = 'auto';
              box.style.bottom = 'auto';
            }
            var drag = null;
            handle.addEventListener('pointerdown', function(event) {
              var r = box.getBoundingClientRect();
              drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top };
              try { handle.setPointerCapture(event.pointerId); } catch (error) {}
              event.preventDefault();
              event.stopPropagation();
            }, true);
            window.addEventListener('pointermove', function(event) {
              if (!drag) return;
              place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
              event.preventDefault();
            }, true);
            function end(event) {
              if (!drag) return;
              try { handle.releasePointerCapture(drag.id); } catch (error) {}
              drag = null;
            }
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            window.addEventListener('resize', function() {
              var r = box.getBoundingClientRect();
              place(r.left, r.top);
            }, true);
            document.documentElement.appendChild(box);
          }
          makePanel();
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

    private func hasNotificationAuthorization(_ completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                completion(true)
            case .notDetermined, .denied:
                completion(false)
            @unknown default:
                completion(false)
            }
        }
    }

    private func requestIOSNotificationPermission(openSettingsWhenDenied: Bool) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            guard let self else { return }
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                self.rescheduleStoredReminderNotifications()
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, _ in
                    if granted {
                        self?.rescheduleStoredReminderNotifications()
                    } else {
                        self?.pushReminderPermissionStatus()
                    }
                }
            case .denied:
                if openSettingsWhenDenied {
                    self.openIOSNotificationSettings()
                } else {
                    self.pushReminderPermissionStatus()
                }
            @unknown default:
                self.pushReminderPermissionStatus()
            }
        }
    }

    private func openIOSNotificationSettings() {
        DispatchQueue.main.async { [weak self] in
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                self?.pushReminderPermissionStatus()
                return
            }
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
            self?.pushReminderPermissionStatus()
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
                case .authorized:
                    canNotify = true
                    notificationState = "granted"
                case .provisional:
                    canNotify = true
                    notificationState = "provisional"
                case .ephemeral:
                    canNotify = true
                    notificationState = "ephemeral"
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
                    "platform": "ios",
                    "notifications": notificationState,
                    "sound": soundState,
                    "exactAlarms": "not-required",
                    "backgroundRun": "ios-managed",
                    "scheduledCount": storedCount,
                    "lastSyncAt": defaults.double(forKey: self.reminderLastSyncAtKey),
                    "canNotify": canNotify,
                    "canSound": canSound,
                    "canExact": true,
                    "canBackground": true,
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
            let rawAlarmKey = stringValue(item["alarmKey"])
            let alarmKey = rawAlarmKey.isEmpty ? "\(kind)|\(id)|\(date)|\(time)" : rawAlarmKey
            let safeAlarmKey = alarmKey.replacingOccurrences(of: "[^A-Za-z0-9_-]+", with: "-", options: .regularExpression)
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
                let identifier = "reminder-\(safeAlarmKey)-\(minutes)"
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

        hasNotificationAuthorization { [weak self] granted in
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
        let fallback = #"{"native":true,"platform":"ios","notifications":"unknown","sound":"unknown","exactAlarms":"not-required","backgroundRun":"ios-managed","scheduledCount":0,"lastSyncAt":0,"canNotify":false,"canSound":false,"canExact":true,"canBackground":true,"needsAction":true}"#
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
            requestBackgroundRunPermission: function() {
              return post("requestBackgroundRunPermission");
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
