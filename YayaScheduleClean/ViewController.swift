import UIKit
import WebKit
import WidgetKit
import UserNotifications
import UniformTypeIdentifiers

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

private struct AcademicFrameSnapshot {
    let url: String
    let title: String
    let text: String
    let html: String
    let courseScore: Int
    let examScore: Int
    let capturedAt: TimeInterval
}

private final class ReminderNotificationIdCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var ids: [String] = []

    func append(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        ids.append(id)
    }

    func values() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return ids
    }
}

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate, UIScrollViewDelegate, WKDownloadDelegate, UIDocumentPickerDelegate {
    private let appGroupIdentifier = "group.com.xuyunfan.yayaschedule"
    private let widgetPayloadKey = "homeWidgetPayload"
    private let widgetPayloadSignatureKey = "homeWidgetPayloadSignature"
    private let widgetKind = "YayaScheduleWidget"
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
    private let externalOpenCooldown: TimeInterval = 1.2
    private let nativeFileImportMaxBytes = 12 * 1024 * 1024
    private static let portalDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()
    private static let reminderDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        return formatter
    }()
    private static let portalDateFormatterLock = NSLock()
    private static let reminderDateFormatterLock = NSLock()

    private static func parsePortalDate(_ text: String) -> Date? {
        portalDateFormatterLock.lock()
        defer { portalDateFormatterLock.unlock() }
        return portalDateFormatter.date(from: text)
    }

    private static func formatPortalDate(_ date: Date) -> String {
        portalDateFormatterLock.lock()
        defer { portalDateFormatterLock.unlock() }
        return portalDateFormatter.string(from: date)
    }

    private static func parseReminderDate(date: String, time: String) -> Date? {
        reminderDateFormatterLock.lock()
        defer { reminderDateFormatterLock.unlock() }
        return reminderDateFormatter.date(from: "\(date) \(time)")
    }

    private var webView: WKWebView!
    private var pendingImportJsonQueue: [String] = []
    private var pendingFileImportJsonQueue: [String] = []
    private var portalSessionActive = false
    private var lastPortalOpenAt: TimeInterval = 0
    private var lastExternalOpenURL = ""
    private var lastExternalOpenAt: TimeInterval = 0
    private var reminderScheduleGeneration = 0
    private var lastReminderSchedulePayload = ""
    private var lastReminderScheduleAt: TimeInterval = 0
    private var lastActiveReminderRefreshAt: TimeInterval = 0
    private var lastReminderPermissionStatusPayload = ""
    private var lastReminderPermissionStatusAt: TimeInterval = 0
    private var reminderPermissionStatusRequestInFlight = false
    private var widgetReloadWorkItem: DispatchWorkItem?
    private var widgetPayloadGeneration = 0
    private var portalUiConfig: [String: Any] = [:]
    private var portalUiJSONCache = "{}"
    private var lastAcademicInjectionKey = ""
    private var lastAcademicInjectionAt: TimeInterval = 0
    private var lastPortalActionStatus = ""
    private var academicWebInteractionActive = false
    private var lastKeyboardInset: CGFloat = -1
    private weak var portalTermOverlay: UIView?
    private var academicDownloadDestinations: [ObjectIdentifier: URL] = [:]
    private var academicFrameSnapshots: [AcademicFrameSnapshot] = []
    private var pendingAcademicAutoImportKind = ""

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.websiteDataStore = .default()
        configuration.userContentController.addUserScript(Self.iosInteractionGuardScript())
        configuration.userContentController.addUserScript(Self.academicFrameCaptureScript())
        configuration.userContentController.addUserScript(Self.yayaNativeBridgeScript())
        configuration.userContentController.add(WeakScriptMessageDelegate(self), name: "yayaBridge")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 1.0, alpha: 1.0)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        configureWebViewScrollBehavior()
        view = webView
    }

    deinit {
        widgetReloadWorkItem?.cancel()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "yayaBridge")
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        UNUserNotificationCenter.current().delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleKeyboardWillChangeFrame),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleKeyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
        loadLocalApp()
    }

    private func configureWebViewScrollBehavior() {
        let scrollView = webView.scrollView
        scrollView.delegate = self
        scrollView.delaysContentTouches = false
        scrollView.canCancelContentTouches = true
        scrollView.keyboardDismissMode = .interactive
        applyWebInteractionMode(academic: false, resetZoom: true)
    }

    private func applyWebInteractionMode(for url: URL?, resetZoom: Bool = false) {
        let academic = !isLocalAppURL(url) && (portalSessionActive || isTrustedAcademicURL(url))
        applyWebInteractionMode(academic: academic, resetZoom: resetZoom)
    }

    private func applyWebInteractionMode(academic: Bool, resetZoom: Bool = false) {
        guard webView != nil else { return }
        let scrollView = webView.scrollView
        if !academic {
            if resetZoom || scrollView.zoomScale != 1 {
                scrollView.setZoomScale(1, animated: false)
            }
            scrollView.minimumZoomScale = 1
            scrollView.maximumZoomScale = 1
            scrollView.bouncesZoom = false
            scrollView.pinchGestureRecognizer?.isEnabled = false
            webView.allowsBackForwardNavigationGestures = false
            academicWebInteractionActive = false
            return
        }
        scrollView.minimumZoomScale = 0.35
        scrollView.maximumZoomScale = 5
        if scrollView.zoomScale < scrollView.minimumZoomScale {
            scrollView.setZoomScale(scrollView.minimumZoomScale, animated: false)
        } else if scrollView.zoomScale > scrollView.maximumZoomScale {
            scrollView.setZoomScale(scrollView.maximumZoomScale, animated: false)
        }
        scrollView.bouncesZoom = true
        scrollView.pinchGestureRecognizer?.isEnabled = true
        webView.allowsBackForwardNavigationGestures = true
        academicWebInteractionActive = true
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        academicWebInteractionActive ? scrollView.subviews.first : nil
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if !academicWebInteractionActive, scrollView.zoomScale != 1 {
            scrollView.setZoomScale(1, animated: false)
        }
    }

    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
        guard !academicWebInteractionActive else { return }
        scrollView.pinchGestureRecognizer?.isEnabled = false
        scrollView.setZoomScale(1, animated: false)
    }

    @objc private func handleKeyboardWillChangeFrame(_ notification: Notification) {
        pushKeyboardInset(from: notification, hidden: false)
    }

    @objc private func handleKeyboardWillHide(_ notification: Notification) {
        pushKeyboardInset(from: notification, hidden: true)
    }

    private func pushKeyboardInset(from notification: Notification, hidden: Bool) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.pushKeyboardInset(from: notification, hidden: hidden)
            }
            return
        }
        let inset: CGFloat
        if hidden {
            inset = 0
        } else if let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
            let keyboardFrame = view.convert(frame, from: nil)
            inset = max(0, view.bounds.maxY - keyboardFrame.minY - view.safeAreaInsets.bottom)
        } else {
            inset = 0
        }
        pushKeyboardInset(inset)
    }

    private func pushKeyboardInset(_ inset: CGFloat) {
        let roundedInset = max(0, (inset * 10).rounded() / 10)
        guard abs(roundedInset - lastKeyboardInset) >= 1 else { return }
        lastKeyboardInset = roundedInset
        let script = """
        (function() {
          var inset = \(String(format: "%.1f", Double(roundedInset)));
          window.__yayaIosKeyboardInset = inset;
          try {
            document.documentElement.style.setProperty('--yaya-ios-keyboard-inset', inset + 'px');
            window.YayaLayers && window.YayaLayers.registerRuntime && window.YayaLayers.registerRuntime('platform', { iosKeyboardInset: inset, iosKeyboardInsetReady: true });
            window.dispatchEvent(new CustomEvent('yaya-ios-keyboard-inset-updated', { detail: { inset: inset } }));
          } catch (error) {}
        })();
        """
        webView.evaluateJavaScript(script)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url else { return }
        applyWebInteractionMode(for: url)
        if isLocalAppURL(url) {
            pushKeyboardInset(lastKeyboardInset < 0 ? 0 : lastKeyboardInset)
            pushReminderPermissionStatus()
            deliverPendingImportIfNeeded()
            deliverPendingFileImportIfNeeded()
            return
        }
        if isTrustedAcademicURL(url) {
            hidePortalTermOverlay()
            guard shouldInjectAcademicHelpers(for: url) else { return }
            lastPortalActionStatus = ""
            injectAcademicZoomPolicy()
            injectPortalNavigationHelper()
            injectPortalAccountHelper()
            injectAcademicImportControlsV2()
            resumePendingAcademicAutoImport()
        }
    }

    private func shouldInjectAcademicHelpers(for url: URL) -> Bool {
        let key = [url.host ?? "", url.path, url.query ?? ""].joined(separator: "|")
        let now = Date().timeIntervalSince1970
        if key == lastAcademicInjectionKey, now - lastAcademicInjectionAt < 0.8 {
            return false
        }
        lastAcademicInjectionKey = key
        lastAcademicInjectionAt = now
        return true
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
        if #available(iOS 14.5, *),
           navigationAction.shouldPerformDownload,
           (isTrustedAcademicURL(url) || portalSessionActive) {
            decisionHandler(.download)
            return
        }
        if isLocalAppURL(url) || isTrustedAcademicURL(url) || portalSessionActive {
            applyWebInteractionMode(for: url, resetZoom: isLocalAppURL(url))
            decisionHandler(.allow)
            return
        }
        if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            openExternalURL(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if shouldDownloadAcademicResponse(navigationResponse) {
            decisionHandler(.download)
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
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else {
            return nil
        }
        if isLocalAppURL(url) || isTrustedAcademicURL(url) || portalSessionActive {
            webView.load(navigationAction.request)
        } else if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            openExternalURL(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        DispatchQueue.main.async { [weak self] in
            let alert = UIAlertController(title: self?.webDialogTitle(for: frame), message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "好", style: .default) { _ in
                completionHandler()
            })
            guard let presenter = self?.webDialogPresenter() else {
                completionHandler()
                return
            }
            presenter.present(alert, animated: true)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        lastAcademicInjectionKey = ""
        if portalSessionActive || isTrustedAcademicURL(webView.url) {
            setPortalActionStatus("网页已恢复，请继续操作")
            webView.reload()
        } else {
            loadLocalApp()
        }
    }

    private func handleNavigationFailure(_ error: Error) {
        let nsError = error as NSError
        guard nsError.domain != NSURLErrorDomain || nsError.code != NSURLErrorCancelled else { return }
        guard portalSessionActive || isTrustedAcademicURL(webView.url) else { return }
        setPortalActionStatus("网页加载失败，请检查网络后重试")
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        DispatchQueue.main.async { [weak self] in
            let alert = UIAlertController(title: self?.webDialogTitle(for: frame), message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
                completionHandler(false)
            })
            alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
                completionHandler(true)
            })
            guard let presenter = self?.webDialogPresenter() else {
                completionHandler(false)
                return
            }
            presenter.present(alert, animated: true)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        DispatchQueue.main.async { [weak self] in
            let alert = UIAlertController(title: self?.webDialogTitle(for: frame), message: prompt, preferredStyle: .alert)
            alert.addTextField { field in
                field.text = defaultText
            }
            alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
                completionHandler(nil)
            })
            alert.addAction(UIAlertAction(title: "确定", style: .default) { [weak alert] _ in
                completionHandler(alert?.textFields?.first?.text)
            })
            guard let presenter = self?.webDialogPresenter() else {
                completionHandler(defaultText)
                return
            }
            presenter.present(alert, animated: true)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    private func webDialogTitle(for frame: WKFrameInfo) -> String? {
        let host = frame.request.url?.host ?? webView.url?.host
        guard let host, !host.isEmpty else { return nil }
        return host
    }

    private func webDialogPresenter() -> UIViewController? {
        guard view.window != nil else { return nil }
        var presenter: UIViewController = self
        while let next = presenter.presentedViewController {
            presenter = next
        }
        return presenter is UIAlertController ? nil : presenter
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let directory = academicDownloadDirectory()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let filename = sanitizedAcademicDownloadFilename(suggestedFilename, response: response)
        let destination = uniqueAcademicDownloadURL(directory.appendingPathComponent(filename))
        academicDownloadDestinations[ObjectIdentifier(download)] = destination
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        let key = ObjectIdentifier(download)
        guard let url = academicDownloadDestinations.removeValue(forKey: key) else { return }
        if enqueueNativeFileImport(url: url, preferDeferred: true) {
            setPortalActionStatus("课表文件已导出并暂存：\(url.lastPathComponent)，点返回鸦鸦后自动解析")
        } else {
            setPortalActionStatus("课表文件已导出：\(url.lastPathComponent)，如未能自动解析请用文件导入")
            presentAcademicExport(url)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        academicDownloadDestinations.removeValue(forKey: ObjectIdentifier(download))
        setPortalActionStatus("课表文件导出失败，请在课表页重试")
    }

    private func shouldDownloadAcademicResponse(_ navigationResponse: WKNavigationResponse) -> Bool {
        guard let url = navigationResponse.response.url,
              isTrustedAcademicURL(url) || portalSessionActive else {
            return false
        }
        if !navigationResponse.canShowMIMEType {
            return true
        }
        let response = navigationResponse.response
        let mime = (response.mimeType ?? "").lowercased()
        let filename = response.suggestedFilename?.lowercased() ?? url.lastPathComponent.lowercased()
        let text = [mime, filename, url.absoluteString.lowercased()].joined(separator: " ")
        return text.range(of: #"excel|spreadsheet|csv|zip|octet-stream|download|export|\.xls(?:x)?(?:\b|[?#])|\.csv(?:\b|[?#])"#, options: .regularExpression) != nil
    }

    private func academicDownloadDirectory() -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return documents.appendingPathComponent("教务导出", isDirectory: true)
    }

    private func sanitizedAcademicDownloadFilename(_ suggestedFilename: String, response: URLResponse) -> String {
        let fallback = response.suggestedFilename ?? "课表导出.xls"
        var name = suggestedFilename.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { name = fallback }
        name = name.replacingOccurrences(of: #"[/\\:*?"<>|]+"#, with: "-", options: .regularExpression)
        if !name.contains(".") {
            let mime = (response.mimeType ?? "").lowercased()
            name += mime.contains("csv") ? ".csv" : mime.contains("spreadsheet") || mime.contains("excel") ? ".xls" : ".dat"
        }
        return name.isEmpty ? "课表导出.xls" : name
    }

    private func uniqueAcademicDownloadURL(_ url: URL) -> URL {
        let directory = url.deletingLastPathComponent()
        let base = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        var candidate = url
        var index = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            let suffix = ext.isEmpty ? "" : ".\(ext)"
            candidate = directory.appendingPathComponent("\(base)-\(index)\(suffix)")
            index += 1
        }
        return candidate
    }

    private func presentAcademicExport(_ url: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = controller.popoverPresentationController {
                popover.sourceView = self.view
                popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.maxY - 40, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            if self.presentedViewController == nil {
                self.present(controller, animated: true)
            }
        }
    }

    private func openExternalURL(_ url: URL) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.openExternalURL(url)
            }
            return
        }
        let now = Date().timeIntervalSince1970
        let key = url.absoluteString
        if key == lastExternalOpenURL, now - lastExternalOpenAt < externalOpenCooldown {
            return
        }
        lastExternalOpenURL = key
        lastExternalOpenAt = now
        UIApplication.shared.open(url, options: [:]) { [weak self] success in
            guard !success else { return }
            DispatchQueue.main.async {
                guard self?.lastExternalOpenURL == key else { return }
                self?.lastExternalOpenURL = ""
                self?.lastExternalOpenAt = 0
            }
        }
    }

    private func loadLocalApp() {
        hidePortalTermOverlay()
        applyWebInteractionMode(academic: false, resetZoom: true)
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
        case "configurePortalUi":
            configurePortalUi(stringValue(body["payload"]))
        case "openAcademicPortal":
            openAcademicPortal()
        case "openFileImport":
            openNativeFileImport()
        case "returnHome":
            portalSessionActive = false
            loadLocalApp()
        case "queueAcademicAutoImport":
            queueAcademicAutoImport(body)
        case "academicFrameSnapshot":
            storeAcademicFrameSnapshot(body)
        case "requestAcademicFrameImport":
            importFromAcademicFrameCache(body)
        case "captureAcademicPage":
            captureAcademicPage(body)
        case "confirmAcademicTerm":
            confirmAcademicTerm(body)
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
        DispatchQueue.main.async { [weak self] in
            self?.portalSessionActive = false
            self?.loadLocalApp()
        }
        completionHandler()
    }

    private func openAcademicPortal() {
        let now = Date().timeIntervalSince1970
        guard now - lastPortalOpenAt >= portalOpenCooldown else { return }
        lastPortalOpenAt = now
        portalSessionActive = true
        hidePortalTermOverlay()
        applyWebInteractionMode(academic: true)
        webView.load(URLRequest(url: portalURL))
    }

    private func openNativeFileImport() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: supportedImportContentTypes(), asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        picker.modalPresentationStyle = .formSheet
        guard let presenter = webDialogPresenter() else {
            deliverNativeFileImportError("当前无法打开文件选择")
            return
        }
        presenter.present(picker, animated: true)
    }

    private func supportedImportContentTypes() -> [UTType] {
        var types: [UTType] = [.html, .xml, .plainText, .text, .commaSeparatedText]
        ["xls", "csv", "tsv", "html", "htm", "mht", "mhtml", "txt"].compactMap { UTType(filenameExtension: $0) }.forEach { type in
            if !types.contains(type) {
                types.append(type)
            }
        }
        return types
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let filename = url.lastPathComponent.isEmpty ? "iOS 文件导入" : url.lastPathComponent
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }
            do {
                let values = try? url.resourceValues(forKeys: [.fileSizeKey])
                if let size = values?.fileSize, size > self.nativeFileImportMaxBytes {
                    DispatchQueue.main.async {
                        self.deliverNativeFileImportError("文件过大，请选择 12MB 以内的课表文件")
                    }
                    return
                }
                let data = try Data(contentsOf: url)
                DispatchQueue.main.async {
                    self.deliverNativeFileImport(name: filename, data: data, preferDeferred: false)
                }
            } catch {
                DispatchQueue.main.async {
                    self.deliverNativeFileImportError("文件读取失败，请重新选择课表文件")
                }
            }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        deliverNativeFileImportCancelled()
    }

    @discardableResult
    private func enqueueNativeFileImport(url: URL, preferDeferred: Bool) -> Bool {
        let filename = url.lastPathComponent.isEmpty ? "教务导出课表" : url.lastPathComponent
        do {
            let values = try? url.resourceValues(forKeys: [.fileSizeKey])
            if let size = values?.fileSize, size > nativeFileImportMaxBytes {
                deliverNativeFileImportError("文件过大，请选择 12MB 以内的课表文件")
                return false
            }
            let data = try Data(contentsOf: url)
            return deliverNativeFileImport(name: filename, data: data, preferDeferred: preferDeferred)
        } catch {
            deliverNativeFileImportError("文件读取失败，请重新选择课表文件")
            return false
        }
    }

    @discardableResult
    private func deliverNativeFileImport(name: String, data: Data, preferDeferred: Bool = false) -> Bool {
        guard data.count <= nativeFileImportMaxBytes else {
            deliverNativeFileImportError("文件过大，请选择 12MB 以内的课表文件")
            return false
        }
        let payload: [String: Any] = [
            "name": name,
            "base64": data.base64EncodedString()
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else {
            deliverNativeFileImportError("文件导入失败，请重新选择")
            return false
        }
        if preferDeferred || !isLocalAppURL(webView.url) {
            pendingFileImportJsonQueue.append(json)
            return true
        }
        let script = """
        window.__yayaPendingFileImport = \(json);
        try {
          window.dispatchEvent(new CustomEvent('yaya-native-file-import-ready', { detail: window.__yayaPendingFileImport }));
        } catch (error) {
          try { window.dispatchEvent(new Event('yaya-native-file-import-ready')); } catch (ignored) {}
        }
        """
        webView.evaluateJavaScript(script)
        return true
    }

    private func deliverNativeFileImportError(_ message: String) {
        let payload: [String: Any] = [
            "error": true,
            "message": message
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else {
            return
        }
        let script = """
        window.__yayaPendingFileImport = \(json);
        try {
          window.dispatchEvent(new CustomEvent('yaya-native-file-import-ready', { detail: window.__yayaPendingFileImport }));
        } catch (error) {
          try { window.dispatchEvent(new Event('yaya-native-file-import-ready')); } catch (ignored) {}
        }
        """
        webView.evaluateJavaScript(script)
    }

    private func deliverNativeFileImportCancelled() {
        let payload: [String: Any] = [
            "cancelled": true,
            "message": "已取消文件选择"
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else {
            return
        }
        let script = """
        window.__yayaPendingFileImport = \(json);
        try {
          window.dispatchEvent(new CustomEvent('yaya-native-file-import-ready', { detail: window.__yayaPendingFileImport }));
        } catch (error) {
          try { window.dispatchEvent(new Event('yaya-native-file-import-ready')); } catch (ignored) {}
        }
        """
        webView.evaluateJavaScript(script)
    }

    @discardableResult
    private func savePortalAccount(username: String, password: String) -> Bool {
        let normalizedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedUsername.isEmpty, !password.isEmpty else {
            return false
        }
        let defaults = UserDefaults.standard
        defaults.set(normalizedUsername, forKey: accountUsernameKey)
        defaults.set(password, forKey: accountPasswordKey)
        return true
    }

    private func injectAcademicZoomPolicy() {
        let script = """
        (function() {
          try {
            var doc = document;
            var meta = doc.querySelector('meta[name="viewport"]');
            if (!meta) {
              doc.documentElement.dataset.yayaAcademicZoom = 'native';
              return;
            }
            var content = String(meta.getAttribute('content') || '');
            var kept = [];
            content.split(',').forEach(function(part) {
              var text = String(part || '').trim();
              if (!text) return;
              var key = text.split('=')[0].trim().toLowerCase();
              if (key === 'maximum-scale' || key === 'minimum-scale' || key === 'user-scalable') return;
              kept.push(text);
            });
            kept.push('minimum-scale=0.25');
            kept.push('maximum-scale=5');
            kept.push('user-scalable=yes');
            meta.setAttribute('content', kept.join(', '));
            doc.documentElement.dataset.yayaAcademicZoom = 'enabled';
          } catch (error) {}
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func setLauncherIcon(_ iconId: String) {
        guard UIApplication.shared.supportsAlternateIcons else {
            pushLauncherIconStatus(iconId: iconId, success: false, message: "当前系统不支持切换图标")
            return
        }
        let normalizedIconId = normalizedLauncherIconId(iconId)
        let iconName = launcherIconName(for: normalizedIconId)
        guard UIApplication.shared.alternateIconName != iconName else {
            pushLauncherIconStatus(iconId: normalizedIconId, success: true, message: "图标已是当前选择")
            return
        }
        UIApplication.shared.setAlternateIconName(iconName) { [weak self] error in
            DispatchQueue.main.async {
                if let error {
                    self?.pushLauncherIconStatus(iconId: normalizedIconId, success: false, message: "图标切换失败：\(error.localizedDescription)")
                } else {
                    self?.pushLauncherIconStatus(iconId: normalizedIconId, success: true, message: "图标已切换")
                }
            }
        }
    }

    private func normalizedLauncherIconId(_ iconId: String) -> String {
        switch iconId {
        case "cartoon", "minimal", "transparent":
            return iconId
        default:
            return "cartoon"
        }
    }

    private func launcherIconName(for iconId: String) -> String? {
        switch iconId {
        case "cartoon":
            return "CartoonIcon"
        case "minimal":
            return "MinimalIcon"
        case "transparent":
            return "TransparentIcon"
        default:
            return "CartoonIcon"
        }
    }

    private func pushLauncherIconStatus(iconId: String, success: Bool, message: String) {
        let payload: [String: Any] = [
            "iconId": iconId,
            "success": success,
            "message": message
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }
        let script = """
        window.__yayaLauncherIconStatus = \(json);
        try { window.dispatchEvent(new CustomEvent('yaya-launcher-icon-updated', { detail: window.__yayaLauncherIconStatus })); } catch (error) {}
        """
        webView.evaluateJavaScript(script)
    }

    private func injectPortalNavigationHelper() {
        let script = """
        (function() {
          if (window.__yayaPortalNavigationHelper) return;
          window.__yayaPortalNavigationHelper = true;
          var originalOpen = window.__yayaPortalOriginalOpen || window.open;
          window.__yayaPortalOriginalOpen = originalOpen;
          function exportLike(value) {
            value = String(value || '').toLowerCase();
            return /导出|下载|课表|excel|xls|xlsx|csv|export|download|down|file|dc|exp/.test(value);
          }
          function exportLikeNode(node) {
            if (!node) return false;
            var text = '';
            try {
              text = [
                node.textContent,
                node.getAttribute && node.getAttribute('href'),
                node.getAttribute && node.getAttribute('action'),
                node.getAttribute && node.getAttribute('download'),
                node.getAttribute && node.getAttribute('title'),
                node.getAttribute && node.getAttribute('aria-label'),
                node.className,
                node.id
              ].join(' ');
            } catch (error) {}
            return exportLike(text);
          }
          function forceSelf() {
            try {
              window.open = function(url, target, features) {
                if (url) {
                  if (exportLike(url) && originalOpen) return originalOpen.call(window, url, target || '_blank', features);
                  try { location.href = url; } catch (error) { window.location.href = url; }
                }
                return window;
              };
            } catch (error) {}
            try {
              Array.prototype.slice.call(document.querySelectorAll('a[target],form[target],area[target]')).forEach(function(node) {
                if (exportLikeNode(node)) return;
                try { node.setAttribute('target', '_self'); } catch (error) {}
              });
            } catch (error) {}
          }
          document.addEventListener('click', function(event) {
            try {
              var link = event.target && event.target.closest && event.target.closest('a[target],area[target]');
              if (link && link.href && !exportLikeNode(link)) link.setAttribute('target', '_self');
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
            "confirmedTerm": boolValue(body["confirmedTerm"]),
            "termDetected": boolValue(body["termDetected"])
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        enqueuePendingImportJson(json)
        let count = pendingImportJsonQueue.count
        let status = boolValue(body["confirmedTerm"])
            ? "已暂存第 \(count) 次导入，可继续导入其他学期或返回鸦鸦"
            : "已抓取第 \(count) 次导入，点返回鸦鸦完成导入"
        setPortalActionStatus(status)
    }

    private func storeAcademicFrameSnapshot(_ body: [String: Any]) {
        let url = stringValue(body["url"])
        guard isTrustedAcademicURL(URL(string: url)) else { return }
        let courseScore = Int(numberValue(body["courseScore"]))
        let examScore = Int(numberValue(body["examScore"]))
        guard max(courseScore, examScore) >= 42 else { return }
        let snapshot = AcademicFrameSnapshot(
            url: url,
            title: stringValue(body["title"]),
            text: limitedImportText(stringValue(body["text"])),
            html: limitedImportText(stringValue(body["html"])),
            courseScore: courseScore,
            examScore: examScore,
            capturedAt: Date().timeIntervalSince1970
        )
        academicFrameSnapshots.removeAll { existing in
            existing.url == snapshot.url && existing.title == snapshot.title
        }
        academicFrameSnapshots.append(snapshot)
        if academicFrameSnapshots.count > 24 {
            academicFrameSnapshots.removeFirst(academicFrameSnapshots.count - 24)
        }
    }

    private func importFromAcademicFrameCache(_ body: [String: Any]) {
        let kind = normalizedAcademicImportKind(stringValue(body["kind"]))
        let now = Date().timeIntervalSince1970
        let best = academicFrameSnapshots
            .filter { now - $0.capturedAt < 300 }
            .sorted { first, second in
                kind == "exam" ? first.examScore > second.examScore : first.courseScore > second.courseScore
            }
            .first { snapshot in
                kind == "exam" ? snapshot.examScore >= 42 : snapshot.courseScore >= 46
            }
        guard let snapshot = best else {
            setPortalActionStatus(kind == "exam" ? "未发现可用考试缓存，请手动进入考试安排页后重试" : "未发现可用课表缓存，请手动进入我的课表后重试")
            return
        }
        let payload: [String: Any] = [
            "kind": kind,
            "title": "\(snapshot.title) frame缓存",
            "url": snapshot.url,
            "text": snapshot.text,
            "html": snapshot.html,
            "pages": 1,
            "termDetected": false,
            "termLabel": "",
            "termStart": "",
            "confirmedTerm": false
        ]
        if kind == "exam" {
            captureAcademicPage(payload)
        } else {
            confirmAcademicTerm(payload)
        }
    }

    private func queueAcademicAutoImport(_ body: [String: Any]) {
        let kind = normalizedAcademicImportKind(stringValue(body["kind"]))
        guard kind == "course" || kind == "exam" else { return }
        pendingAcademicAutoImportKind = kind
    }

    private func resumePendingAcademicAutoImport() {
        let kind = pendingAcademicAutoImportKind
        guard kind == "course" || kind == "exam" else { return }
        pendingAcademicAutoImportKind = ""
        setPortalActionStatus("正在继续自动导入")
        let script = """
        (function() {
          var kind = \(Self.javaScriptStringLiteral(kind));
          function run() {
            try {
              if (window.__yayaRunAcademicImportForNative) {
                window.__yayaRunAcademicImportForNative(kind);
                return true;
              }
            } catch (error) {}
            return false;
          }
          try {
            if (window.__yayaRunAcademicImportForNative) {
              window.__yayaRunAcademicImportForNative(kind);
              return true;
            }
          } catch (error) {}
          setTimeout(run, 700);
          return false;
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func configurePortalUi(_ payload: String) {
        guard let data = payload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else {
            return
        }
        let json = serializedPortalUiJSON(dictionary)
        guard json != portalUiJSONCache else { return }
        portalUiConfig = dictionary
        portalUiJSONCache = json
    }

    private func portalUiJSON() -> String {
        if !portalUiJSONCache.isEmpty { return portalUiJSONCache }
        portalUiJSONCache = serializedPortalUiJSON(portalUiConfig)
        return portalUiJSONCache
    }

    private func serializedPortalUiJSON(_ dictionary: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(dictionary),
              let data = try? JSONSerialization.data(withJSONObject: dictionary, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return json
    }

    private func portalColor(_ key: String, fallback: UIColor) -> UIColor {
        colorFromHex(stringValue(portalUiConfig[key]), fallback: fallback)
    }

    private func colorFromHex(_ value: String, fallback: UIColor) -> UIColor {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("#"), text.count == 7 else { return fallback }
        let hex = String(text.dropFirst())
        guard let raw = Int(hex, radix: 16) else { return fallback }
        return UIColor(
            red: CGFloat((raw >> 16) & 0xff) / 255.0,
            green: CGFloat((raw >> 8) & 0xff) / 255.0,
            blue: CGFloat(raw & 0xff) / 255.0,
            alpha: 1.0
        )
    }

    private func portalRadius() -> CGFloat {
        min(max(CGFloat(numberValue(portalUiConfig["radius"])) + 4.0, 18.0), 34.0)
    }

    private func portalStyledButton(_ title: String, filled: Bool) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .heavy)
        button.titleLabel?.numberOfLines = 2
        button.titleLabel?.lineBreakMode = .byWordWrapping
        button.titleLabel?.textAlignment = .center
        button.titleLabel?.adjustsFontSizeToFitWidth = true
        button.titleLabel?.minimumScaleFactor = 0.78
        button.contentEdgeInsets = UIEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
        button.layer.cornerRadius = max(16, portalRadius() - 7)
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor.white.withAlphaComponent(0.52).cgColor
        button.clipsToBounds = true
        if filled {
            button.backgroundColor = portalColor("accent", fallback: UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1))
            button.setTitleColor(.white, for: .normal)
        } else {
            button.backgroundColor = portalColor("panel", fallback: UIColor(red: 0.94, green: 0.97, blue: 1, alpha: 1)).withAlphaComponent(0.86)
            button.setTitleColor(portalColor("ink", fallback: UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1)), for: .normal)
        }
        return button
    }

    private func showPortalOptionPicker(title: String, options: [String], selectedIndex: Int, onSelect: @escaping (Int) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let overlay = UIView(frame: self.view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            overlay.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 0.22)
            overlay.isUserInteractionEnabled = true

            let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialLight))
            card.translatesAutoresizingMaskIntoConstraints = false
            card.layer.cornerRadius = self.portalRadius()
            card.layer.borderWidth = 1
            card.layer.borderColor = UIColor.white.withAlphaComponent(0.62).cgColor
            card.clipsToBounds = true
            card.contentView.backgroundColor = self.portalColor("card", fallback: UIColor.white).withAlphaComponent(0.76)

            let stack = UIStackView()
            stack.axis = .vertical
            stack.spacing = 12
            stack.translatesAutoresizingMaskIntoConstraints = false
            card.contentView.addSubview(stack)

            let titleLabel = UILabel()
            titleLabel.text = title
            titleLabel.textColor = self.portalColor("ink", fallback: UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1))
            titleLabel.font = .systemFont(ofSize: 18, weight: .heavy)
            titleLabel.numberOfLines = 0
            stack.addArrangedSubview(titleLabel)

            let scroll = UIScrollView()
            scroll.showsVerticalScrollIndicator = true
            let optionStack = UIStackView()
            optionStack.axis = .vertical
            optionStack.spacing = 8
            optionStack.translatesAutoresizingMaskIntoConstraints = false
            scroll.addSubview(optionStack)
            let safeSelected = max(0, min(max(0, options.count - 1), selectedIndex))
            for (index, option) in options.enumerated() {
                let button = self.portalStyledButton(option, filled: index == safeSelected)
                button.titleLabel?.font = .systemFont(ofSize: 14, weight: .heavy)
                button.heightAnchor.constraint(equalToConstant: 46).isActive = true
                button.addAction(UIAction { _ in
                    onSelect(index)
                    overlay.removeFromSuperview()
                }, for: .touchUpInside)
                optionStack.addArrangedSubview(button)
            }
            stack.addArrangedSubview(scroll)
            scroll.heightAnchor.constraint(equalToConstant: min(360, max(150, CGFloat(options.count * 54)))).isActive = true
            NSLayoutConstraint.activate([
                optionStack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
                optionStack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
                optionStack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
                optionStack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
                optionStack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor)
            ])

            let cancel = self.portalStyledButton("取消", filled: false)
            cancel.heightAnchor.constraint(equalToConstant: 48).isActive = true
            cancel.addAction(UIAction { _ in
                overlay.removeFromSuperview()
            }, for: .touchUpInside)
            stack.addArrangedSubview(cancel)

            overlay.addSubview(card)
            self.view.addSubview(overlay)
            NSLayoutConstraint.activate([
                card.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                card.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 380),
                card.widthAnchor.constraint(equalTo: overlay.widthAnchor, constant: -48),
                stack.topAnchor.constraint(equalTo: card.contentView.topAnchor, constant: 16),
                stack.leadingAnchor.constraint(equalTo: card.contentView.leadingAnchor, constant: 18),
                stack.trailingAnchor.constraint(equalTo: card.contentView.trailingAnchor, constant: -18),
                stack.bottomAnchor.constraint(equalTo: card.contentView.bottomAnchor, constant: -16)
            ])
        }
    }

    private func hidePortalTermOverlay() {
        portalTermOverlay?.removeFromSuperview()
        portalTermOverlay = nil
    }

    private func confirmAcademicTerm(_ body: [String: Any]) {
        let pages = max(1, Int(numberValue(body["pages"])))
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.hidePortalTermOverlay()

            let overlay = UIView(frame: self.view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            overlay.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 0.22)
            overlay.isUserInteractionEnabled = true

            let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialLight))
            card.translatesAutoresizingMaskIntoConstraints = false
            card.layer.cornerRadius = self.portalRadius()
            card.layer.borderWidth = 1
            card.layer.borderColor = UIColor.white.withAlphaComponent(0.62).cgColor
            card.layer.shadowColor = UIColor.black.cgColor
            card.layer.shadowOpacity = 0.18
            card.layer.shadowRadius = 26
            card.layer.shadowOffset = CGSize(width: 0, height: 18)
            card.clipsToBounds = true
            card.contentView.backgroundColor = self.portalColor("card", fallback: UIColor.white).withAlphaComponent(0.72)

            let stack = UIStackView()
            stack.axis = .vertical
            stack.spacing = 10
            stack.translatesAutoresizingMaskIntoConstraints = false
            card.contentView.addSubview(stack)

            let head = UIStackView()
            head.axis = .horizontal
            head.alignment = .center
            head.spacing = 10
            let title = UILabel()
            title.text = "确认学期"
            title.textColor = self.portalColor("ink", fallback: UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1))
            title.font = .systemFont(ofSize: 19, weight: .heavy)
            title.numberOfLines = 0
            let back = self.portalStyledButton("←", filled: false)
            back.titleLabel?.font = .systemFont(ofSize: 22, weight: .heavy)
            back.widthAnchor.constraint(equalToConstant: 44).isActive = true
            back.heightAnchor.constraint(equalToConstant: 44).isActive = true
            head.addArrangedSubview(title)
            head.addArrangedSubview(back)
            stack.addArrangedSubview(head)

            let academicSelection = self.currentAcademicSelection()
            var selectedYear = academicSelection.year
            var selectedTermIndex = academicSelection.termIndex
            let autoCard = UIView()
            autoCard.backgroundColor = self.portalColor("panel", fallback: UIColor(red: 0.94, green: 0.97, blue: 1, alpha: 1)).withAlphaComponent(0.82)
            autoCard.layer.cornerRadius = max(16, self.portalRadius() - 7)
            autoCard.layer.borderWidth = 1
            autoCard.layer.borderColor = UIColor.white.withAlphaComponent(0.52).cgColor
            let autoStack = UIStackView()
            autoStack.axis = .vertical
            autoStack.spacing = 4
            autoStack.translatesAutoresizingMaskIntoConstraints = false
            autoCard.addSubview(autoStack)
            let autoLabel = UILabel()
            autoLabel.text = "手动选择"
            autoLabel.textColor = self.portalColor("muted", fallback: UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1))
            autoLabel.font = .systemFont(ofSize: 12, weight: .heavy)
            autoStack.addArrangedSubview(autoLabel)
            let detectedLabel = UILabel()
            detectedLabel.text = "开学日期与学期"
            detectedLabel.textColor = self.portalColor("ink", fallback: UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1))
            detectedLabel.font = .systemFont(ofSize: 18, weight: .heavy)
            detectedLabel.numberOfLines = 0
            autoStack.addArrangedSubview(detectedLabel)
            let note = UILabel()
            note.text = "已采集 \(pages) 页课表。请按当前页面实际学期手动选择，确认后可继续导入其他学期。"
            note.textColor = self.portalColor("muted", fallback: UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1))
            note.font = .systemFont(ofSize: 12, weight: .semibold)
            note.numberOfLines = 0
            autoStack.addArrangedSubview(note)
            stack.addArrangedSubview(autoCard)
            NSLayoutConstraint.activate([
                autoStack.topAnchor.constraint(equalTo: autoCard.topAnchor, constant: 12),
                autoStack.leadingAnchor.constraint(equalTo: autoCard.leadingAnchor, constant: 14),
                autoStack.trailingAnchor.constraint(equalTo: autoCard.trailingAnchor, constant: -14),
                autoStack.bottomAnchor.constraint(equalTo: autoCard.bottomAnchor, constant: -12)
            ])

            func fieldTitle(_ text: String) -> UILabel {
                let label = UILabel()
                label.text = text
                label.textColor = self.portalColor("muted", fallback: UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1))
                label.font = .systemFont(ofSize: 13, weight: .heavy)
                return label
            }

            stack.addArrangedSubview(fieldTitle("开学日期"))
            let initialStart = self.portalSuggestedTermStart(firstYear: selectedYear, termIndex: selectedTermIndex)
            let startButton = self.portalStyledButton(initialStart.isEmpty ? "选择开学日期" : initialStart, filled: false)
            startButton.contentHorizontalAlignment = .leading
            startButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .heavy)
            startButton.heightAnchor.constraint(equalToConstant: 48).isActive = true
            startButton.addAction(UIAction { [weak self, weak startButton] _ in
                guard let self, let startButton else { return }
                self.showPortalInternalDatePicker(anchor: startButton, fallbackDate: initialStart)
            }, for: .touchUpInside)
            stack.addArrangedSubview(startButton)

            stack.addArrangedSubview(fieldTitle("学期"))
            let yearOptions = (2000...2076).map { "\($0)-\($0 + 1)学年" }
            let termOptions = ["秋季学期", "春季学期", "夏季学期"]
            let yearButton = self.portalStyledButton("\(selectedYear)-\(selectedYear + 1)学年", filled: false)
            let termButton = self.portalStyledButton(termOptions[max(0, min(termOptions.count - 1, selectedTermIndex))], filled: false)
            yearButton.heightAnchor.constraint(equalToConstant: 48).isActive = true
            termButton.heightAnchor.constraint(equalToConstant: 48).isActive = true
            let termRow = UIStackView(arrangedSubviews: [yearButton, termButton])
            termRow.axis = .horizontal
            termRow.spacing = 10
            termRow.distribution = .fillProportionally
            yearButton.widthAnchor.constraint(equalTo: termButton.widthAnchor, multiplier: 1.45).isActive = true
            stack.addArrangedSubview(termRow)
            yearButton.addAction(UIAction { [weak self, weak yearButton] _ in
                guard let self else { return }
                self.showPortalOptionPicker(title: "选择学年", options: yearOptions, selectedIndex: selectedYear - 2000) { index in
                    selectedYear = min(2076, max(2000, 2000 + index))
                    yearButton?.setTitle("\(selectedYear)-\(selectedYear + 1)学年", for: .normal)
                    startButton.setTitle(self.portalSuggestedTermStart(firstYear: selectedYear, termIndex: selectedTermIndex), for: .normal)
                }
            }, for: .touchUpInside)
            termButton.addAction(UIAction { [weak self, weak termButton] _ in
                guard let self else { return }
                self.showPortalOptionPicker(title: "选择学期", options: termOptions, selectedIndex: selectedTermIndex) { index in
                    selectedTermIndex = max(0, min(termOptions.count - 1, index))
                    termButton?.setTitle(termOptions[selectedTermIndex], for: .normal)
                    startButton.setTitle(self.portalSuggestedTermStart(firstYear: selectedYear, termIndex: selectedTermIndex), for: .normal)
                }
            }, for: .touchUpInside)

            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 10
            row.distribution = .fillEqually
            let cancel = self.portalStyledButton("取消导入", filled: false)
            let confirm = self.portalStyledButton("确认导入", filled: true)
            row.addArrangedSubview(cancel)
            row.addArrangedSubview(confirm)
            row.heightAnchor.constraint(equalToConstant: 48).isActive = true
            stack.addArrangedSubview(row)

            back.addAction(UIAction { [weak self] _ in
                self?.hidePortalTermOverlay()
            }, for: .touchUpInside)
            cancel.addAction(UIAction { [weak self] _ in
                self?.hidePortalTermOverlay()
            }, for: .touchUpInside)
            confirm.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                var confirmed = body
                let start = self.normalizedPortalDate(startButton.title(for: .normal) ?? "")
                confirmed["kind"] = "course"
                confirmed["termLabel"] = self.termLabel(firstYear: selectedYear, termIndex: selectedTermIndex)
                confirmed["termStart"] = start.isEmpty ? self.portalSuggestedTermStart(firstYear: selectedYear, termIndex: selectedTermIndex) : start
                confirmed["confirmedTerm"] = true
                confirmed["termDetected"] = false
                self.captureAcademicPage(confirmed)
                self.hidePortalTermOverlay()
            }, for: .touchUpInside)

            overlay.addSubview(card)
            self.view.addSubview(overlay)
            self.portalTermOverlay = overlay

            NSLayoutConstraint.activate([
                card.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                card.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
                card.widthAnchor.constraint(equalTo: overlay.widthAnchor, constant: -36),
                stack.topAnchor.constraint(equalTo: card.contentView.topAnchor, constant: 16),
                stack.leadingAnchor.constraint(equalTo: card.contentView.leadingAnchor, constant: 18),
                stack.trailingAnchor.constraint(equalTo: card.contentView.trailingAnchor, constant: -18),
                stack.bottomAnchor.constraint(equalTo: card.contentView.bottomAnchor, constant: -16)
            ])
        }
    }

    private func showPortalInternalDatePicker(anchor: UIButton, fallbackDate: String) {
        DispatchQueue.main.async { [weak self, weak anchor] in
            guard let self, let anchor else { return }
            let overlay = UIView(frame: self.view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            overlay.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 0.22)
            overlay.isUserInteractionEnabled = true

            let currentDateText = self.normalizedPortalDate(anchor.title(for: .normal) ?? "")
            let fallbackDateText = self.normalizedPortalDate(fallbackDate)
            let seed = currentDateText.isEmpty ? fallbackDateText : currentDateText
            let seedDate = Self.parsePortalDate(seed) ?? Date()
            let seedParts = Calendar.current.dateComponents([.year, .month, .day], from: seedDate)
            var selectedYear = min(max(seedParts.year ?? 2026, 2000), 2077)
            var selectedMonth = min(max(seedParts.month ?? 9, 1), 12)
            var selectedDay = min(max(seedParts.day ?? 1, 1), self.portalDaysInMonth(year: selectedYear, month: selectedMonth))

            let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialLight))
            card.translatesAutoresizingMaskIntoConstraints = false
            card.layer.cornerRadius = self.portalRadius()
            card.layer.borderWidth = 1
            card.layer.borderColor = UIColor.white.withAlphaComponent(0.62).cgColor
            card.clipsToBounds = true
            card.contentView.backgroundColor = self.portalColor("card", fallback: UIColor.white).withAlphaComponent(0.76)

            let stack = UIStackView()
            stack.axis = .vertical
            stack.spacing = 12
            stack.translatesAutoresizingMaskIntoConstraints = false
            card.contentView.addSubview(stack)

            let title = UILabel()
            title.text = "选择开学日期"
            title.textColor = self.portalColor("ink", fallback: UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1))
            title.font = .systemFont(ofSize: 18, weight: .heavy)
            stack.addArrangedSubview(title)

            let yearOptions = (2000...2077).map { "\($0)" }
            let monthOptions = (1...12).map { String(format: "%02d", $0) }
            let dayOptions = (1...31).map { String(format: "%02d", $0) }
            let pickerRow = UIStackView()
            pickerRow.axis = .horizontal
            pickerRow.spacing = 8
            pickerRow.distribution = .fillProportionally
            let yearButton = self.portalStyledButton("\(selectedYear)", filled: false)
            let monthButton = self.portalStyledButton(String(format: "%02d", selectedMonth), filled: false)
            let dayButton = self.portalStyledButton(String(format: "%02d", selectedDay), filled: false)
            [yearButton, monthButton, dayButton].forEach { button in
                button.titleLabel?.font = .systemFont(ofSize: 15, weight: .heavy)
                button.heightAnchor.constraint(equalToConstant: 48).isActive = true
                pickerRow.addArrangedSubview(button)
            }
            yearButton.widthAnchor.constraint(equalTo: monthButton.widthAnchor, multiplier: 1.35).isActive = true
            stack.addArrangedSubview(pickerRow)

            let syncDay = {
                selectedDay = min(selectedDay, self.portalDaysInMonth(year: selectedYear, month: selectedMonth))
                yearButton.setTitle("\(selectedYear)", for: .normal)
                monthButton.setTitle(String(format: "%02d", selectedMonth), for: .normal)
                dayButton.setTitle(String(format: "%02d", selectedDay), for: .normal)
            }
            yearButton.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                self.showPortalOptionPicker(title: "选择年份", options: yearOptions, selectedIndex: selectedYear - 2000) { index in
                    selectedYear = min(2077, max(2000, 2000 + index))
                    syncDay()
                }
            }, for: .touchUpInside)
            monthButton.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                self.showPortalOptionPicker(title: "选择月份", options: monthOptions, selectedIndex: selectedMonth - 1) { index in
                    selectedMonth = max(1, min(12, index + 1))
                    syncDay()
                }
            }, for: .touchUpInside)
            dayButton.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                self.showPortalOptionPicker(title: "选择日期", options: dayOptions, selectedIndex: selectedDay - 1) { index in
                    selectedDay = min(index + 1, self.portalDaysInMonth(year: selectedYear, month: selectedMonth))
                    syncDay()
                }
            }, for: .touchUpInside)

            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 10
            row.distribution = .fillEqually
            let cancel = self.portalStyledButton("取消", filled: false)
            let confirm = self.portalStyledButton("确认", filled: true)
            row.addArrangedSubview(cancel)
            row.addArrangedSubview(confirm)
            row.heightAnchor.constraint(equalToConstant: 48).isActive = true
            stack.addArrangedSubview(row)

            cancel.addAction(UIAction { _ in
                overlay.removeFromSuperview()
            }, for: .touchUpInside)
            confirm.addAction(UIAction { _ in
                anchor.setTitle(String(format: "%04d-%02d-%02d", selectedYear, selectedMonth, selectedDay), for: .normal)
                overlay.removeFromSuperview()
            }, for: .touchUpInside)

            overlay.addSubview(card)
            self.view.addSubview(overlay)
            NSLayoutConstraint.activate([
                card.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                card.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 380),
                card.widthAnchor.constraint(equalTo: overlay.widthAnchor, constant: -48),
                stack.topAnchor.constraint(equalTo: card.contentView.topAnchor, constant: 16),
                stack.leadingAnchor.constraint(equalTo: card.contentView.leadingAnchor, constant: 18),
                stack.trailingAnchor.constraint(equalTo: card.contentView.trailingAnchor, constant: -18),
                stack.bottomAnchor.constraint(equalTo: card.contentView.bottomAnchor, constant: -16)
            ])
        }
    }

    private func normalizedPortalDate(_ value: String) -> String {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return "" }
        return text
    }

    private func currentAcademicSelection() -> (year: Int, termIndex: Int) {
        let components = Calendar.current.dateComponents([.year, .month], from: Date())
        let calendarYear = components.year ?? 2026
        let month = components.month ?? 9
        let termIndex = month >= 8 ? 0 : (month >= 6 ? 2 : 1)
        let firstYear = termIndex == 0 ? calendarYear : calendarYear - 1
        return (min(max(firstYear, 2000), 2076), termIndex)
    }

    private func portalSuggestedTermStart(firstYear: Int, termIndex: Int) -> String {
        let index = max(0, min(2, termIndex))
        if index == 1 { return portalNearestMonday(year: firstYear + 1, month: 2, day: 23) }
        if index == 2 { return portalNearestMonday(year: firstYear + 1, month: 6, day: 24) }
        return portalNearestMonday(year: firstYear, month: 9, day: 1)
    }

    private func portalNearestMonday(year: Int, month: Int, day: Int) -> String {
        let calendar = Calendar(identifier: .gregorian)
        var best = calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
        var bestDistance = Int.max
        for offset in -4...4 {
            guard let candidate = calendar.date(from: DateComponents(year: year, month: month, day: day + offset)) else { continue }
            let distance = abs(offset)
            if calendar.component(.weekday, from: candidate) == 2 && distance < bestDistance {
                best = candidate
                bestDistance = distance
            }
        }
        return Self.formatPortalDate(best)
    }

    private func portalDaysInMonth(year: Int, month: Int) -> Int {
        let calendar = Calendar(identifier: .gregorian)
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: date) else {
            return 31
        }
        return range.count
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

    private func enqueuePendingImportJson(_ json: String) {
        guard !json.isEmpty else { return }
        pendingImportJsonQueue.append(json)
    }

    private func drainPendingImportPayload() -> String {
        guard !pendingImportJsonQueue.isEmpty else { return "" }
        let queue = pendingImportJsonQueue
        pendingImportJsonQueue.removeAll()
        if queue.count == 1 { return queue[0] }
        let objects = queue.compactMap { item -> Any? in
            guard let data = item.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: data)
        }
        guard JSONSerialization.isValidJSONObject(objects),
              let data = try? JSONSerialization.data(withJSONObject: objects),
              let json = String(data: data, encoding: .utf8) else {
            return queue.first ?? ""
        }
        return json
    }

    private func drainPendingFileImportPayload() -> String {
        guard !pendingFileImportJsonQueue.isEmpty else { return "" }
        let json = pendingFileImportJsonQueue.removeFirst()
        return json
    }

    private func setPortalActionStatus(_ text: String) {
        guard text != lastPortalActionStatus else { return }
        lastPortalActionStatus = text
        DispatchQueue.main.async { [weak self] in
            let script = """
            window.__yayaIosAcademicStatus = \(Self.javaScriptStringLiteral(text));
            var node = document.querySelector('[data-yaya-ios-academic-status]');
            if (node) node.textContent = window.__yayaIosAcademicStatus;
            """
            self?.webView.evaluateJavaScript(script)
        }
    }

    private func academicYear(from label: String, start: String) -> Int {
        if let match = label.range(of: #"20\d{2}\s*[-—–~至]\s*20\d{2}"#, options: .regularExpression) {
            let first = label[match].prefix(4)
            if let year = Int(first) { return min(max(year, 2000), 2076) }
        }
        if start.count >= 7, let year = Int(start.prefix(4)), let month = Int(start.dropFirst(5).prefix(2)) {
            return min(max(month >= 8 ? year : year - 1, 2000), 2076)
        }
        let year = Calendar.current.component(.year, from: Date())
        return min(max(year, 2000), 2076)
    }

    private func termKindIndex(from label: String, start: String) -> Int {
        if label.range(of: #"夏|暑|第三|第\s*[三3]|三\s*学期"#, options: .regularExpression) != nil { return 2 }
        if label.range(of: #"春|下|第二|第\s*[二2]|二\s*学期"#, options: .regularExpression) != nil { return 1 }
        if label.range(of: #"秋|上|第一|第\s*[一1]|一\s*学期"#, options: .regularExpression) != nil { return 0 }
        if start.count >= 7, let month = Int(start.dropFirst(5).prefix(2)) {
            if month >= 6 && month < 8 { return 2 }
            if month < 8 { return 1 }
        }
        return 0
    }

    private func termLabel(firstYear: Int, termIndex: Int) -> String {
        let labels = ["秋季学期", "春季学期", "夏季学期"]
        let safeIndex = min(max(termIndex, 0), labels.count - 1)
        return "\(firstYear)-\(firstYear + 1)学年\(labels[safeIndex])"
    }

    private func deliverPendingImportIfNeeded() {
        let json = drainPendingImportPayload()
        guard !json.isEmpty else { return }
        let script = """
        window.__yayaPendingImport = \(Self.javaScriptStringLiteral(json));
        try { window.dispatchEvent(new Event('yaya-native-import-ready')); } catch (error) {}
        """
        webView.evaluateJavaScript(script)
    }

    private func deliverPendingFileImportIfNeeded() {
        let json = drainPendingFileImportPayload()
        guard !json.isEmpty else { return }
        let script = """
        window.__yayaPendingFileImport = \(json);
        try {
          window.dispatchEvent(new CustomEvent('yaya-native-file-import-ready', { detail: window.__yayaPendingFileImport }));
        } catch (error) {
          try { window.dispatchEvent(new Event('yaya-native-file-import-ready')); } catch (ignored) {}
        }
        """
        webView.evaluateJavaScript(script)
    }

    private func injectPortalAccountHelper() {
        let username = UserDefaults.standard.string(forKey: accountUsernameKey) ?? ""
        let password = UserDefaults.standard.string(forKey: accountPasswordKey) ?? ""
        guard !username.isEmpty, !password.isEmpty else { return }
        let script = """
        (function() {
          if (window.__yayaPortalAssistVersion === 'manual-prefill-v4') return;
          window.__yayaPortalAssistVersion = 'manual-prefill-v4';
          var username = \(Self.javaScriptStringLiteral(username));
          var password = \(Self.javaScriptStringLiteral(password));
          var startedAt = Date.now();
          var maxRuns = 10;
          var runCount = 0;
          function visible(el) {
            if (!el) return false;
            var r = el.getBoundingClientRect();
            var s = el.ownerDocument.defaultView.getComputedStyle(el);
            var aria = String(el.getAttribute && el.getAttribute('aria-disabled') || '');
            var cls = String(el.className || '');
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && !el.readOnly && aria !== 'true' && !/disabled|is-disabled|btn-disabled/.test(cls);
          }
          function setValue(el, value) {
            if (!el || el.value === value) return false;
            var proto = Object.getPrototypeOf(el);
            var ownSetter = Object.getOwnPropertyDescriptor(el, 'value') && Object.getOwnPropertyDescriptor(el, 'value').set;
            var protoSetter = proto && Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
            try {
              if (protoSetter && ownSetter !== protoSetter) protoSetter.call(el, value);
              else el.value = value;
            } catch (error) {
              try { el.value = value; } catch (ignored) {}
            }
            try {
              el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value }));
            } catch (error) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
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
          function exportLike(value) {
            value = String(value || '').toLowerCase();
            return /导出|下载|课表|excel|xls|xlsx|csv|export|download|down|file|dc|exp/.test(value);
          }
          function exportLikeNode(node) {
            if (!node) return false;
            var text = '';
            try {
              text = [
                node.textContent,
                node.getAttribute && node.getAttribute('href'),
                node.getAttribute && node.getAttribute('action'),
                node.getAttribute && node.getAttribute('download'),
                node.getAttribute && node.getAttribute('title'),
                node.getAttribute && node.getAttribute('aria-label'),
                node.className,
                node.id
              ].join(' ');
            } catch (error) {}
            return exportLike(text);
          }
          function forceSelfWindow() {
            allDocs().forEach(function(doc) {
              try {
                var win = doc.defaultView || window;
                var originalOpen = win.__yayaPortalOriginalOpen || win.open;
                win.__yayaPortalOriginalOpen = originalOpen;
                win.open = function(url, target, features) {
                  if (url) {
                    if (exportLike(url) && originalOpen) return originalOpen.call(win, url, target || '_blank', features);
                    try { win.location.href = url; } catch (error) { location.href = url; }
                  }
                  return win;
                };
              } catch (error) {}
              try {
                Array.prototype.slice.call(doc.querySelectorAll('a[target],form[target],area[target]')).forEach(function(node) {
                  if (exportLikeNode(node)) return;
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
          function isManualLoginTarget(target) {
            try {
              if (!target) return false;
              var node = target.closest && target.closest('input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]');
              if (!node) node = target;
              return /input|textarea|select/i.test(node.tagName || '') || node.isContentEditable;
            } catch (error) {
              return false;
            }
          }
          function releaseToManual(doc) {
            if (!doc) return;
            doc.__yayaUserEditedLogin = true;
            doc.__yayaManualLoginReleasedAt = Date.now();
            try {
              if (doc.__yayaManualPrefillTimer) clearTimeout(doc.__yayaManualPrefillTimer);
              if (doc.__yayaManualPrefillObserver) doc.__yayaManualPrefillObserver.disconnect();
            } catch (error) {}
          }
          function stopPrefill(doc) {
            if (!doc) return;
            try {
              if (doc.__yayaManualPrefillTimer) clearTimeout(doc.__yayaManualPrefillTimer);
              if (doc.__yayaManualPrefillObserver) doc.__yayaManualPrefillObserver.disconnect();
              doc.__yayaManualPrefillObserver = null;
            } catch (error) {}
          }
          function shouldFill(el, value) {
            if (!el) return false;
            var doc = el.ownerDocument || document;
            if (doc.__yayaUserEditedLogin) return false;
            var current = String(el.value || '').trim();
            if (current && current !== value) return false;
            if (current === value) return false;
            var count = Number(el.dataset.yayaPrefillCount || 0);
            return count < 2;
          }
          function markFilled(el) {
            if (!el) return;
            el.dataset.yayaPrefillCount = String(Number(el.dataset.yayaPrefillCount || 0) + 1);
          }
          function installUserEditGuard(doc) {
            if (!doc || doc.__yayaUserEditGuard) return;
            doc.__yayaUserEditGuard = true;
            try {
              ['touchstart', 'pointerdown', 'mousedown', 'keydown', 'beforeinput', 'input', 'compositionstart', 'paste'].forEach(function(name) {
                doc.addEventListener(name, function(event) {
                  if (event && event.isTrusted === false) return;
                  if (isManualLoginTarget(event && event.target)) releaseToManual(doc);
                }, true);
              });
              doc.addEventListener('focusin', function(event) {
                if (event && event.isTrusted === false) return;
                if (isManualLoginTarget(event && event.target)) doc.__yayaLoginFieldFocusedAt = Date.now();
              }, true);
            } catch (error) {}
          }
          function prefill() {
            runCount += 1;
            forceSelfWindow();
            var docs = allDocs();
            if (runCount > maxRuns || Date.now() - startedAt > 10000) {
              docs.forEach(stopPrefill);
              return;
            }
            for (var d = 0; d < docs.length; d += 1) {
              var doc = docs[d];
              installUserEditGuard(doc);
              if (doc.__yayaUserEditedLogin) continue;
              var passwordInput = Array.prototype.slice.call(doc.querySelectorAll('input[type=password]')).filter(visible)[0];
              if (!passwordInput) continue;
              var userInput = userInputNear(passwordInput);
              var filledUser = false;
              var filledPassword = false;
              if (shouldFill(userInput, username) && setValue(userInput, username)) {
                markFilled(userInput);
                filledUser = true;
              }
              if (shouldFill(passwordInput, password) && setValue(passwordInput, password)) {
                markFilled(passwordInput);
                filledPassword = true;
              }
              if ((filledUser || String(userInput && userInput.value || '').trim() === username) && (filledPassword || String(passwordInput.value || '').trim() === password)) {
                doc.__yayaAutoPrefillDone = true;
                setTimeout(function(targetDoc) { stopPrefill(targetDoc); }, 800, doc);
              }
              return;
            }
          }
          function observe() {
            allDocs().forEach(function(doc) {
              if (doc.__yayaManualPrefillObserver) return;
              try {
                doc.__yayaManualPrefillObserver = new MutationObserver(function() {
                  clearTimeout(doc.__yayaManualPrefillTimer);
                  doc.__yayaManualPrefillTimer = setTimeout(prefill, 220);
                });
                doc.__yayaManualPrefillObserver.observe(doc.documentElement || doc, { subtree: true, childList: true });
              } catch (error) {
              }
            });
          }
          prefill();
          setTimeout(prefill, 650);
          setTimeout(prefill, 1800);
          setTimeout(function() { allDocs().forEach(stopPrefill); }, 11000);
          observe();
        })();
        """
        webView.evaluateJavaScript(script)
    }

    private func injectAcademicImportControlsV2() {
        let portalUiLiteral = Self.javaScriptStringLiteral(portalUiJSON())
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
          var portalUi = {};
          try { portalUi = JSON.parse(\(portalUiLiteral) || "{}"); } catch (error) {}
          function portalColor(key, fallback) {
            var value = portalUi && portalUi[key];
            return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
          }
          function portalNumber(key, fallback) {
            var value = Number(portalUi && portalUi[key]);
            return Number.isFinite(value) ? value : fallback;
          }
          function hexRgb(hex) {
            hex = portalColor('_', hex).replace('#', '');
            return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
          }
          function rgba(hex, alpha) {
            var c = hexRgb(hex);
            return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
          }
          function mixHex(first, second, weight) {
            var a = hexRgb(first), b = hexRgb(second), w = Math.max(0, Math.min(1, Number(weight) || 0)), x = 1 - w;
            function part(v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }
            return '#' + part(a.r * x + b.r * w) + part(a.g * x + b.g * w) + part(a.b * x + b.b * w);
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
            function termCount(value) {
              return (norm(value).match(/20\\d{2}\\s*[-—–~至/]\\s*20\\d{2}|\\b20\\d{2}20\\d{2}[123]\\b|20\\d{2}\\s*年/g) || []).length;
            }
            function add(value) {
              var text = norm(value);
              if (termCount(text) > 1 && text.length > 80) return;
              if (text && /20\\d{2}/.test(text) && out.indexOf(text) < 0) out.push(text);
            }
            function fieldMeta(el) {
              return norm([
                el && el.name,
                el && el.id,
                el && el.className,
                el && el.title,
                el && el.getAttribute && el.getAttribute('aria-label'),
                el && el.getAttribute && el.getAttribute('placeholder'),
                el && el.getAttribute && el.getAttribute('data-name')
              ].join(' '));
            }
            function expandedChoiceNode(node) {
              if (!node || !node.closest) return false;
              if (node.closest('select')) return false;
              if (node.closest('.ant-select-selector,.ant-select-selection-item,.ant-select-selection-selected-value,.el-select__wrapper,.el-input,.select2-selection,.select2-selection__rendered,.layui-form-select,[role=combobox]')) return false;
              return !!node.closest('[role=listbox],[role=option],.ant-select-dropdown,.ant-select-item-option,.el-select-dropdown,.el-select-dropdown__item,.select2-results,.select2-results__option,.layui-anim,.dropdown-menu,.picker-panel');
            }
            function nearbyLabel(el) {
              try {
                var label = null;
                if (el.id) {
                  Array.prototype.slice.call(doc.querySelectorAll('label[for]')).forEach(function(node) {
                    if (!label && node.getAttribute('for') === el.id) label = node;
                  });
                }
                var text = label ? label.textContent : '';
                var parent = el.parentElement;
                for (var depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
                  text += ' ' + (parent.getAttribute('aria-label') || '') + ' ' + (parent.getAttribute('title') || '');
                  var labelled = parent.querySelector && parent.querySelector('label,.label,.form-label,.layui-form-label,.el-form-item__label');
                  if (labelled) text += ' ' + labelled.textContent;
                }
                return norm(text);
              } catch (error) {
                return '';
              }
            }
            function fragmentsOf(root) {
              var values = [];
              function push(value) {
                var text = norm(value);
                if (text && /20\\d{2}/.test(text) && values.indexOf(text) < 0) values.push(text);
              }
              push(root.getAttribute && root.getAttribute('value') || root.value || '');
              push(root.getAttribute && root.getAttribute('title'));
              push(root.getAttribute && root.getAttribute('aria-label'));
              var selector = 'option[selected],option:checked,.ant-select-selection-item,.ant-select-selection-selected-value,.select2-selection__rendered,.layui-this,.el-input__inner,.el-select__selected-item,[aria-checked=true]';
              try {
                Array.prototype.slice.call(root.querySelectorAll(selector)).forEach(function(node) {
                  if (expandedChoiceNode(node)) return;
                  push(node.getAttribute && node.getAttribute('value') || node.value || '');
                  push(node.getAttribute && node.getAttribute('title'));
                  push(node.getAttribute && node.getAttribute('aria-label'));
                  push(node.textContent);
                });
              } catch (error) {}
              if (!values.length && !expandedChoiceNode(root) && termCount(root.textContent) <= 1) push(root.textContent);
              return values.sort(function(a, b) {
                return termCount(a) - termCount(b) || a.length - b.length;
              }).slice(0, 4);
            }
            try {
              var nodes = doc.querySelectorAll('select,input[type=radio],input[type=checkbox],input[type=hidden],input[type=text]');
              for (var i = 0; i < nodes.length; i += 1) {
                var el = nodes[i];
                var meta = norm(fieldMeta(el) + ' ' + nearbyLabel(el));
                if (!/学期|学年|semester|term|xq|xn|xnm|xqm/i.test(meta)) continue;
                if (el.tagName && el.tagName.toLowerCase() === 'select') {
                  var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
                  add('当前选中学期 ' + meta + ' ' + norm(el.value) + ' ' + norm(opt && (opt.text || opt.value)));
                } else {
                  var type = String(el.type || '').toLowerCase();
                  if ((type === 'radio' || type === 'checkbox') && !el.checked) continue;
                  if (el.value || el.checked) add('当前学期字段 ' + meta + ' ' + norm(el.value));
                }
              }
              var widgets = doc.querySelectorAll('.ant-select,.ant-select-selector,.ant-select-selection-item,.el-select,.el-select__wrapper,.el-input,.layui-form-select,.select2-selection,[role=combobox],[aria-haspopup=listbox],[class*=semester],[class*=term],[id*=xq],[id*=xn]');
              for (var w = 0; w < widgets.length; w += 1) {
                var widget = widgets[w];
                if (expandedChoiceNode(widget)) continue;
                var widgetMeta = norm(fieldMeta(widget) + ' ' + nearbyLabel(widget));
                fragmentsOf(widget).forEach(function(widgetText) {
                  if ((/学期|学年|semester|term|xq|xn|xnm|xqm/i.test(widgetMeta) || /学期|学年|春季|秋季|夏季|春|秋|夏|上学期|下学期|第?\\s*[一二三123]\\s*学期/.test(widgetText)) && /20\\d{2}/.test(widgetText)) {
                    add('当前选中学期 ' + widgetMeta + ' ' + widgetText);
                  }
                });
              }
              var selected = doc.querySelectorAll('[aria-checked=true],.selected,.layui-this');
              for (var s = 0; s < selected.length; s += 1) {
                var item = selected[s];
                if (expandedChoiceNode(item)) continue;
                var itemMeta = norm(fieldMeta(item) + ' ' + nearbyLabel(item));
                var itemText = norm(item.textContent || item.getAttribute('title') || item.getAttribute('aria-label') || '');
                if (/20\\d{2}/.test(itemText) && (/学期|学年|semester|term|xq|xn|xnm|xqm/i.test(itemMeta) || /学期|学年|春季|秋季|夏季|春|秋|夏|上学期|下学期|第?\\s*[一二三123]\\s*学期/.test(itemText))) {
                  add('当前选中学期 ' + itemMeta + ' ' + itemText);
                }
              }
            } catch (error) {}
            return out.join('\\n');
          }
          function courseTitleTerms(doc) {
            var out = [];
            function add(value) {
              var text = norm(value);
              if (text && /20\\d{2}/.test(text) && /课表标题|我的课表|个人课表|学生课表|课程表|课表|标题/i.test(text) && out.indexOf(text) < 0) out.push('课表标题 ' + text.slice(0, 220));
            }
            try {
              Array.prototype.slice.call(doc.querySelectorAll('title,h1,h2,h3,h4,h5,h6,caption,legend,.title,[class*=title],[id*=title],[class*=bt],[id*=bt]')).forEach(function(node) {
                add(node.textContent || node.getAttribute('title') || node.getAttribute('aria-label') || '');
              });
            } catch (error) {}
            return out.join('\\n');
          }
          function docText(doc) {
            try { return doc && doc.body ? norm(doc.body.innerText) : ''; } catch (error) { return ''; }
          }
          function relevant(doc, kind) {
            var text = docText(doc);
            if (!text) return false;
            if (kind === 'exam') return /考试|考场|考试时间|考试地点|监考|座位/.test(text);
            return /课表|课程|上课|任课|教师|学分|节次|周次|星期|教学班/.test(text);
          }
          function payloadScore(kind, value) {
            var raw = String(value || '');
            var text = norm(raw);
            if (!text) return 0;
            var score = 0;
            var courseHits = text.match(/课表|课程名称|课程|上课|任课|教师|地点|学分|节次|周次|星期|教学班|周[一二三四五六日天]|第\\s*\\d+\\s*节|\\[\\d{1,2}(?:-\\d{1,2})?\\]/g) || [];
            var examHits = text.match(/考试|考场|考试时间|考试地点|考试轮次|考核方式|监考|座位|考试日期|科目|闭卷|开卷|机考|tableId|DataTable|keywords/g) || [];
            score += (kind === 'exam' ? examHits : courseHits).length * 8;
            score += (/20\\d{2}|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}/.test(text) ? 10 : 0);
            score += (/星期|周[一二三四五六日天]|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(text) ? 10 : 0);
            score += (/<table|<tbody|<tr|<td|role=.?(table|grid)/i.test(raw) ? 22 : 0);
            score += (text.length > 500 ? 6 : 0);
            if (/登录|密码|验证码|统一身份认证/.test(text) && score < 54) score -= 28;
            return score;
          }
          function nodeText(node) {
            try { return norm([node.innerText, node.textContent, node.value, node.title, node.getAttribute && node.getAttribute('aria-label')].join('\n')); } catch (error) { return ''; }
          }
          function nodeHtml(node) {
            try { return node.outerHTML || ''; } catch (error) { return ''; }
          }
          function addStructuredItem(items, kind, node, source, docIndex, nodeIndex) {
            var text = nodeText(node);
            var html = nodeHtml(node);
            var score = payloadScore(kind, text + ' ' + html);
            if (score < (kind === 'exam' ? 34 : 40)) return;
            items.push({ score: score, source: source, docIndex: docIndex, nodeIndex: nodeIndex, text: text, html: html });
          }
          function collectStructured(kind) {
            var items = [];
            var selected = '';
            var selectors = [
              'table', '#keywords', '.table_outer', '.datalist', '.framework', '.content', '#thePageArea', '#theSearchArea',
              '[role=table]', '[role=grid]', '.ant-table', '.ant-table-content', '.el-table', '.layui-table', '.ui-jqgrid', '.datagrid', '.bootstrap-table', '.x-grid',
              '[class*=kcb]', '[id*=kcb]', '[class*=timetable]', '[class*=schedule]', '[class*=course]', '[id*=course]', '[class*=exam]', '[id*=exam]', '[class*=ksap]', '[id*=ksap]'
            ].join(',');
            allDocs().forEach(function(doc, docIndex) {
              try { selected += '\n' + selectedTerms(doc) + '\n' + courseTitleTerms(doc); } catch (error) {}
              try {
                Array.prototype.slice.call(doc.querySelectorAll(selectors)).forEach(function(node, nodeIndex) {
                  addStructuredItem(items, kind, node, 'dom-structure', docIndex, nodeIndex);
                });
              } catch (error) {}
              try {
                Array.prototype.slice.call(doc.querySelectorAll('script[type*=json],script:not([src]),textarea,pre')).forEach(function(node, nodeIndex) {
                  var text = nodeText(node);
                  if (!text || text.length > 260000) return;
                  var score = payloadScore(kind, text);
                  if (score < (kind === 'exam' ? 46 : 52)) return;
                  items.push({ score: score - 6, source: 'embedded-data', docIndex: docIndex, nodeIndex: nodeIndex, text: text, html: '<table data-yaya-embedded-data="true"><tr><td>' + escapeHtml(text).replace(/\\n/g, '</td></tr><tr><td>') + '</td></tr></table>' });
                });
              } catch (error) {}
            });
            items.sort(function(a, b) { return b.score - a.score; });
            var html = '', text = norm(selected);
            items.slice(0, kind === 'exam' ? 20 : 32).forEach(function(item, index) {
              text += '\n<!-- yaya-structured-' + index + ' score=' + item.score + ' -->\n' + item.text;
              html += '\n<!-- yaya-structured-' + index + ' source=' + item.source + ' score=' + item.score + ' -->\n' + item.html;
            });
            return { method: 'structured-dom', pages: Math.max(1, Math.min(items.length || 1, kind === 'exam' ? 20 : 32)), html: html, text: text };
          }
          function resourceLikely(kind, url) {
            var text = String(url || '').toLowerCase();
            if (!/^https?:/.test(text)) return false;
            if (/\\.(?:png|jpe?g|gif|webp|svg|css|woff2?|ttf|ico)(?:\\?|#|$)/i.test(text)) return false;
            if (kind === 'exam') return /exam|ks|kaoshi|kssj|kcap|ksap|datatable|tableid|keywords|考试|考场|cjcx|xsdks/i.test(text);
            return /kcb|kb|xskb|xskbcx|ckdgxsxdkchj|course|lesson|schedule|timetable|jskb|xsxk|xkjg|xk|课表|课程/i.test(text);
          }
          async function fetchTextWithTimeout(url, timeoutMs) {
            var controller = null;
            var timer = null;
            try {
              var options = { credentials: 'include', cache: 'no-store' };
              if (typeof AbortController !== 'undefined') {
                controller = new AbortController();
                options.signal = controller.signal;
                timer = setTimeout(function() {
                  try { controller.abort(); } catch (error) {}
                }, timeoutMs || 2600);
              }
              var response = await fetch(url, options);
              if (timer) clearTimeout(timer);
              var type = String(response.headers && response.headers.get('content-type') || '').toLowerCase();
              if (!response.ok || /image|font|css/.test(type)) return null;
              var body = await response.text();
              return { body: body, type: type };
            } catch (error) {
              if (timer) clearTimeout(timer);
              return null;
            }
          }
          async function collectResourcePayloads(kind) {
            var entries = [];
            try { entries = performance && performance.getEntriesByType ? performance.getEntriesByType('resource') : []; } catch (error) { entries = []; }
            var seen = {}, urls = [];
            entries.forEach(function(entry) {
              var url = String(entry && entry.name || '');
              if (!resourceLikely(kind, url) || seen[url]) return;
              seen[url] = true;
              urls.push(url);
            });
            urls = urls.slice(-18).reverse();
            var items = [];
            for (var i = 0; i < urls.length; i += 1) {
              try {
                var payload = await fetchTextWithTimeout(urls[i], 2600);
                if (!payload) continue;
                var body = payload.body;
                if (!body || body.length > 900000) continue;
                var score = payloadScore(kind, body + ' ' + urls[i]);
                if (score < (kind === 'exam' ? 46 : 52)) continue;
                var looksHtml = /<table|<tr|<td|<tbody|<html/i.test(body);
                items.push({ url: urls[i], score: score, text: body, html: looksHtml ? body : '<table data-yaya-resource-data="true"><tr><td>' + escapeHtml(body).replace(/\\n/g, '</td></tr><tr><td>') + '</td></tr></table>' });
              } catch (error) {}
            }
            items.sort(function(a, b) { return b.score - a.score; });
            var html = '', text = '';
            items.slice(0, 8).forEach(function(item, index) {
              text += '\n<!-- yaya-resource-' + index + ' score=' + item.score + ' url=' + item.url + ' -->\n' + item.text;
              html += '\n<!-- yaya-resource-' + index + ' score=' + item.score + ' url=' + item.url + ' -->\n' + item.html;
            });
            return { method: 'resource-payload', pages: Math.max(1, items.length), html: html, text: text };
          }
          function collect(kind) {
            var html = '', text = '';
            var docs = allDocs();
            for (var i = 0; i < docs.length; i += 1) {
              var doc = docs[i];
              try {
                var rel = relevant(doc, kind);
                if (!rel) continue;
                html += '\\n<!-- yaya-doc-' + i + ' -->\\n' + (doc.body ? doc.body.innerHTML : (doc.documentElement ? doc.documentElement.outerHTML : ''));
                text += '\\n' + (doc.body ? doc.body.innerText : '');
              } catch (error) {}
            }
            return { html: html, text: text };
          }
          function mark(data) { return norm(data.text).slice(0, 18000); }
          function visible(el) {
            try {
              var s = el.ownerDocument.defaultView.getComputedStyle(el);
              var r = el.getBoundingClientRect();
              return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
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
          function findNext(kind) {
            var docs = allDocs();
            var selectors = ['.layui-laypage-next','.el-pagination .btn-next','.ant-pagination-next button','.ant-pagination-next','button[aria-label*=Next]','button[aria-label*=下一]','a[aria-label*=Next]','a[aria-label*=下一]','a[title*=下一]','button[title*=下一]','li[title*=下一]'];
            for (var d = 0; d < docs.length; d += 1) {
              var doc = docs[d];
              if (!relevant(doc, kind)) continue;
              for (var s = 0; s < selectors.length; s += 1) {
                try {
                  var list = doc.querySelectorAll(selectors[s]);
                  for (var i = 0; i < list.length; i += 1) if (usable(list[i])) return targetOf(list[i]);
                } catch (error) {}
              }
              try {
                var nodes = doc.querySelectorAll('.layui-laypage a,.layui-laypage button,.el-pagination button,.el-pagination li,.ant-pagination button,.ant-pagination li,.pagination a,.pagination button,a,button,li,span');
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
                var data = collect(kind);
                var key = mark(data);
                if (key && !seen[key]) { seen[key] = 1; pages.push(data); }
                var next = findNext(kind);
                if (!next) break;
                var before = key;
                clickNext(next);
                var changed = false;
                for (var t = 0; t < 34; t += 1) {
                  await sleep(260);
                  var now = mark(collect(kind));
                  if (now && now !== before) { changed = true; break; }
                }
                if (!changed) break;
              }
              if (!pages.length) pages.push(collect(kind));
              return {
                method: 'paged',
                pages: pages.length,
                html: pages.map(function(p, i) { return '\\n<!-- yaya-page-' + (i + 1) + ' -->\\n' + p.html; }).join('\\n'),
                text: pages.map(function(p) { return p.text; }).join('\\n')
              };
            } finally {
              window.__yayaIosAcademicImportBusy = false;
            }
          }
          function hasUsefulPayload(data, kind) {
            var text = norm([(data && data.text) || '', (data && data.html) || ''].join(' '));
            if (!text || text.length < 18) return false;
            if (kind === 'exam') return /考试|考场|考试时间|考试地点|考试轮次|考核方式|监考|座位|tableId|DataTable|keywords/.test(text) && /20\\d{2}|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}/.test(text);
            return /课表|课程|课程名称|\\[课程号\\]课程名|上课|上课时间、地点|任课|教师|学分|节次|周次|星期|教学班|周[一二三四五六日天]|\\[\\d{1,2}(?:-\\d{1,2})?\\]/.test(text);
          }
          function escapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, function(ch) {
              return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;';
            });
          }
          function exportNodeText(node) {
            try {
              return norm([
                node.textContent,
                node.value,
                node.getAttribute && node.getAttribute('href'),
                node.getAttribute && node.getAttribute('action'),
                node.getAttribute && node.getAttribute('download'),
                node.getAttribute && node.getAttribute('title'),
                node.getAttribute && node.getAttribute('aria-label'),
                node.className,
                node.id
              ].join(' '));
            } catch (error) {
              return '';
            }
          }
          function triggerAcademicExport(kind) {
            var now = Date.now();
            if (window.__yayaIosAcademicExportClickedAt && now - window.__yayaIosAcademicExportClickedAt < 3500) return '';
            var best = null;
            allDocs().forEach(function(doc) {
              try {
                var nodes = Array.prototype.slice.call(doc.querySelectorAll('a,button,input[type=button],input[type=submit],[role=button],.btn,.button'));
                nodes.forEach(function(node) {
                  if (!visible(node) || disabled(node)) return;
                  var text = exportNodeText(node);
                  if (!text) return;
                  var score = 0;
                  if (/导出|下载|excel|xls|csv|export|download|down|file|dc|exp/i.test(text)) score += 45;
                  if (kind === 'exam' && /考试|考场|exam/i.test(text)) score += 22;
                  if (kind !== 'exam' && /课表|课程|我的课表|schedule|course|kcb/i.test(text)) score += 22;
                  if (/删除|取消|返回|退出|登录|修改|保存|查询|检索|打印/i.test(text)) score -= 18;
                  if (!/导出|下载|excel|xls|csv|export|download|down|dc|exp/i.test(text)) score -= 28;
                  if (score < 42) return;
                  if (!best || score > best.score) best = { node: targetOf(node), score: score, text: text };
                });
              } catch (error) {}
            });
            if (!best || !best.node) return '';
            window.__yayaIosAcademicExportClickedAt = now;
            clickNext(best.node);
            return best.text.slice(0, 80);
          }
          function academicPageText() {
            var docs = allDocs();
            var out = norm(location.href + ' ' + document.title);
            docs.forEach(function(doc) {
              if (out.length < 24000) out += ' ' + docText(doc);
            });
            return out;
          }
          function loginBlocked() {
            var text = academicPageText();
            return /cas\\.bnu\\.edu\\.cn|统一身份认证|扫码登录|手机验证码登录/.test(text) && /用户名|密码|登录/.test(text);
          }
          function portalOnly() {
            var text = academicPageText();
            return /one\\.bnu\\.edu\\.cn|数字京师|办事大厅|信息门户/.test(text) && !/zyfw\\.bnu\\.edu\\.cn|教务管理系统/.test(text);
          }
          function targetPath(kind) {
            return kind === 'exam' ? '/student/ksap.ksapb.html?menucode=JW130603' : '/student/xkjg.wdkb.jsp?menucode=JW130418';
          }
          function deskFrame() {
            try {
              return document.querySelector('iframe#frmDesk,frame#frmDesk,iframe[name=frmDesk],frame[name=frmDesk]');
            } catch (error) {
              return null;
            }
          }
          function clickSearch(kind) {
            var docs = allDocs();
            for (var d = 0; d < docs.length; d += 1) {
              try {
                var nodes = docs[d].querySelectorAll('button,input[type=button],input[type=submit],a,.btn,.button');
                for (var i = 0; i < nodes.length; i += 1) {
                  var el = nodes[i];
                  var text = norm((el.value || '') + ' ' + (el.textContent || '') + ' ' + (el.title || '') + ' ' + ((el.getAttribute && el.getAttribute('aria-label')) || ''));
                  if (!/检索|查询|搜索|考试安排表|我的课表/.test(text)) continue;
                  if (!usable(el)) continue;
                  clickNext(targetOf(el));
                  return true;
                }
              } catch (error) {}
            }
            return false;
          }
          async function waitUseful(kind) {
            for (var i = 0; i < 24; i += 1) {
              await sleep(300);
              if (hasUsefulPayload(collectStructured(kind), kind)) return true;
            }
            return false;
          }
          async function prepareAcademicImport(kind) {
            if (loginBlocked()) return '检测到登录页，请重新填写账号与密码并登录后再导入';
            if (portalOnly()) {
              post('queueAcademicAutoImport', { kind: kind });
              try { location.href = 'http://zyfw.bnu.edu.cn' + targetPath(kind); } catch (error) {}
              return '正在进入教务系统，登录正常会继续自动导入';
            }
            if (hasUsefulPayload(collectStructured(kind), kind)) return true;
            var frame = deskFrame();
            if (frame && /zyfw\\.bnu\\.edu\\.cn/i.test(location.host)) {
              var target = targetPath(kind);
              var src = String(frame.getAttribute('src') || frame.src || '');
              if (src.indexOf(target) < 0) {
                frame.src = target;
                setStatus(kind === 'exam' ? '正在打开考试安排' : '正在打开我的课表');
                await sleep(1400);
              }
            }
            if (hasUsefulPayload(collectStructured(kind), kind)) return true;
            if (clickSearch(kind)) {
              setStatus(kind === 'exam' ? '正在检索考试安排' : '正在检索课表');
              await waitUseful(kind);
            }
            return true;
          }
          function finishAcademicImport(kind, data) {
            if (!hasUsefulPayload(data, kind)) return false;
            if (kind === 'exam') {
              post('captureAcademicPage', { kind: 'exam', title: (document.title || '') + ' 共' + (data.pages || 1) + '页', url: location.href, text: data.text, html: data.html });
              return true;
            }
            confirmTerm(data);
            return true;
          }
          async function runAcademicImport(kind, node) {
            if (node) node.textContent = kind === 'exam' ? '采集考试中...' : '采集课表中...';
            setStatus(kind === 'exam' ? '正在读取考试页面结构' : '正在读取课表页面结构');
            try {
              var ready = await prepareAcademicImport(kind);
              if (ready !== true) {
                setStatus(ready || (kind === 'exam' ? '请进入考试安排页后再导入' : '请进入我的课表页后再导入'));
                return;
              }
              var data = collectStructured(kind);
              if (finishAcademicImport(kind, data)) {
                setStatus(kind === 'exam' ? '已从页面结构抓取考试' : '已从页面结构抓取课表，请确认学期');
                return;
              }
              setStatus(kind === 'exam' ? '正在读取教务请求中的考试数据' : '正在读取教务请求中的课表数据');
              data = await collectResourcePayloads(kind);
              if (finishAcademicImport(kind, data)) {
                setStatus(kind === 'exam' ? '已从教务请求数据抓取考试' : '已从教务请求数据抓取课表，请确认学期');
                return;
              }
              var exportHint = triggerAcademicExport(kind);
              if (exportHint) {
                setStatus('已触发网页导出，导出完成后点返回鸦鸦自动读取');
                return;
              }
              setStatus(kind === 'exam' ? '未发现可用导出，正在读取分页考试源数据' : '未发现可用导出，正在读取分页课表源数据');
              data = await crawl(kind);
              if (finishAcademicImport(kind, data)) {
                setStatus(kind === 'exam' ? '已抓取考试，点返回鸦鸦完成导入' : '请确认学期');
                return;
              }
              setStatus(kind === 'exam' ? '正在读取完整考试页面文本' : '正在读取完整课表页面文本');
              data = collect(kind);
              if (finishAcademicImport(kind, data)) {
                setStatus(kind === 'exam' ? '已从页面文本抓取考试' : '已从页面文本抓取课表，请确认学期');
                return;
              }
              if (post('requestAcademicFrameImport', { kind: kind })) {
                setStatus(kind === 'exam' ? '正在尝试读取考试 frame 缓存；若失败请手动进入考试安排页后重试' : '正在尝试读取课表 frame 缓存；若失败请手动进入“网上选课-我的课表”后重试');
                return;
              }
              setStatus(kind === 'exam' ? '未抓取到考试，请进入考试安排页或使用网页导出后重试' : '未抓取到课表，请进入“网上选课-我的课表”检索，或使用网页导出后重试');
            } finally {
              if (node) node.textContent = kind === 'exam' ? '导入考试' : '导入课表';
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
          function kindOf(hint) {
            hint = norm(hint);
            if (/夏|暑|第三|第\\s*[三3]|三\\s*学期|16|03|3\\s*学期/.test(hint)) return 'summer';
            if (/春|下|第二|第\\s*[二2]|二\\s*学期|2\\s*学期|12/.test(hint)) return 'spring';
            if (/秋|上|第一|第\\s*[一1]|一\\s*学期|1\\s*学期|01/.test(hint)) return 'autumn';
            return '';
          }
          function buildTerm(first, second, hint) {
            first = Number(first);
            second = Number(second || first + 1);
            var kind = kindOf(hint);
            var label = first + '-' + second + '学年' + (kind === 'spring' ? '春季学期' : kind === 'summer' ? '夏季学期' : kind === 'autumn' ? '秋季学期' : '');
            var start = kind === 'spring' ? monday(second, 2, 20) : kind === 'summer' ? monday(second, 6, 20) : monday(first, 9, 1);
            return { label: label, start: start, kind: kind };
          }
          function termFromCode(first, code, zfCode) {
            var second = String(Number(first) + 1);
            code = norm(code);
            if (code === '1' || code === '01' || (zfCode && code === '3')) return buildTerm(first, second, '第一学期');
            if (code === '2' || code === '02' || code === '12') return buildTerm(first, second, '第二学期');
            if (code === '3' || code === '16' || code === '03') return buildTerm(first, second, '夏季');
            return null;
          }
          function termFieldValue(first, rawTerm, zfCode) {
            var second = String(Number(first) + 1);
            var value = norm(rawTerm);
            var code = (value.match(/^(12|16|0?[123])$/) || [])[1];
            if (code) return termFromCode(first, code, zfCode);
            if (kindOf(value)) return buildTerm(first, second, value);
            return null;
          }
          function emptyTerm() {
            return { label: '', start: '', kind: '', detected: false };
          }
          function zfTermFields(raw) {
            var text = norm(raw);
            var token = '(12|16|0?[123]|第?\\s*[一二三123]\\s*学期|[上下]学期|春季|秋季|夏季|[上下春秋夏暑](?:\\s*学期)?)';
            var m = text.match(new RegExp('(?:xnm|xndm|xn|学年)[^\\d]{0,24}(20\\d{2}).{0,120}(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}' + token, 'i'));
            if (m) return termFieldValue(m[1], m[2], true);
            m = text.match(new RegExp('(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}' + token + '.{0,120}(?:xnm|xndm|xn|学年)[^\\d]{0,24}(20\\d{2})', 'i'));
            if (m) return termFieldValue(m[2], m[1], true);
            var y = text.match(/(?:xnm|xndm|xn|学年)[^\\d]{0,24}(20\\d{2})/i);
            var t = text.match(new RegExp('(?:xqm|xqdm|xq|学期)[^\\d一二三上下春秋夏暑]{0,24}' + token, 'i'));
            if (y && t) return termFieldValue(y[1], t[1], true);
            return null;
          }
          function strictZfTermFields(raw) {
            var text = norm(raw);
            var year = '(?:xnm|xndm|xn|year|academicYear)';
            var term = '(?:xqm|xqdm|xq|semester|term)';
            var token = '(12|16|0?[123]|第?\\s*[一二三123]\\s*学期|[上下]学期|春季|秋季|夏季|[上下春秋夏暑](?:\\s*学期)?)';
            var m = text.match(new RegExp(year + '[^\\d]{0,24}(20\\d{2}).{0,120}' + term + '[^\\d一二三上下春秋夏暑]{0,24}' + token, 'i'));
            if (m) return termFieldValue(m[1], m[2], true);
            m = text.match(new RegExp(term + '[^\\d一二三上下春秋夏暑]{0,24}' + token + '.{0,120}' + year + '[^\\d]{0,24}(20\\d{2})', 'i'));
            if (m) return termFieldValue(m[2], m[1], true);
            var y = text.match(new RegExp(year + '[^\\d]{0,24}(20\\d{2})', 'i'));
            var t = text.match(new RegExp(term + '[^\\d一二三上下春秋夏暑]{0,24}' + token, 'i'));
            if (y && t) return termFieldValue(y[1], t[1], true);
            return null;
          }
          function parseTermCandidate(raw, allowYearOnly) {
            var text = norm(raw);
            var m, info;
            info = zfTermFields(text);
            if (info && info.kind) return info;
            m = text.match(/(20\\d{2})\\s*[-—–~至]\\s*(20\\d{2})\\s*学年.{0,40}?(春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期|12|16|0?[123])/);
            if (m) return buildTerm(m[1], m[2], m[3] || '');
            m = text.match(/(20\\d{2})\\s*[-—–~至]\\s*(20\\d{2}).{0,40}?(春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期|12|16|0?[123])/);
            if (m) return buildTerm(m[1], m[2], m[3] || '');
            m = text.match(/(20\\d{2})\\s*[-—–~至/]\\s*(20\\d{2})\\s*[-_/]?\\s*(12|16|0?[123])(?:\\b|学期)/);
            if (m) {
              var byCode = termFromCode(m[1], m[3], false);
              if (byCode && byCode.kind) return byCode;
            }
            m = text.match(/\\b(20\\d{2})(20\\d{2})([123])\\b/);
            if (m) {
              var compact = termFromCode(m[1], m[3], false);
              if (compact && compact.kind) return compact;
            }
            m = text.match(/(20\\d{2})\\s*年\\s*(春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期)/);
            if (m) {
              var year = Number(m[1]), kind = kindOf(m[2]);
              return buildTerm(kind === 'autumn' ? year : year - 1, kind === 'autumn' ? year + 1 : year, m[2]);
            }
            if (allowYearOnly) {
              m = text.match(/(20\\d{2})\\s*[-—–~至]\\s*(20\\d{2})\\s*学年/);
              if (m) return buildTerm(m[1], m[2], '');
            }
            return null;
          }
          function addTermCandidate(list, value) {
            var text = norm(value);
            if (text && /20\\d{2}/.test(text) && list.indexOf(text) < 0) list.push(text);
          }
          function titleTermCandidates(text) {
            var list = [];
            var lines = String(text || '').split(/[\\n\\r]+/);
            for (var i = 0; i < lines.length; i++) {
              var line = norm(lines[i]);
              if (/课表标题|我的课表|个人课表|学生课表|课程表|课表|标题/i.test(line) && /20\\d{2}/.test(line)) addTermCandidate(list, line.slice(0, 220));
            }
            return list;
          }
          function labelledTermCandidates(text, strictOnly) {
            var list = [], m;
            var strict = /(当前选中学期|当前学期字段|当前学期|已选学期|选中学期|正在查询学期)\\s*[:：-]?\\s*([^。\\n\\r；;<>]{0,140})/g;
            while ((m = strict.exec(text))) addTermCandidate(list, m[1] + ' ' + m[2]);
            if (strictOnly) return list;
            var loose = /(学年学期|开课学期|课表学期|所在学期)\\s*[:：-]?\\s*([^。\\n\\r；;<>]{0,100})/g;
            while ((m = loose.exec(text))) addTermCandidate(list, m[1] + ' ' + m[2]);
            return list;
          }
          function allTermInfos(raw) {
            var text = norm(raw), out = [], seen = {};
            var patterns = [
              /20\\d{2}\\s*[-—–~至]\\s*20\\d{2}\\s*学年.{0,32}?(?:春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期)/g,
              /20\\d{2}\\s*[-—–~至]\\s*20\\d{2}.{0,32}?(?:春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期)/g,
              /20\\d{2}\\s*[-—–~至/]\\s*20\\d{2}\\s*[-_/]?\\s*(?:12|16|0?[123])(?:\\b|学期)/g,
              /\\b20\\d{2}20\\d{2}[123]\\b/g,
              /20\\d{2}\\s*[-—–~至]\\s*20\\d{2}\\s*学年/g,
              /20\\d{2}\\s*年\\s*(?:春季|秋季|夏季|春|秋|夏|第?\\s*[一二三123]\\s*学期|[上下]学期)/g
            ];
            for (var p = 0; p < patterns.length; p++) {
              var re = patterns[p], m;
              while ((m = re.exec(text))) {
                var info = parseTermCandidate(m[0], true);
                if (!info) continue;
                var key = info.label + '|' + info.kind;
                if (!seen[key]) {
                  seen[key] = 1;
                  out.push(info);
                }
              }
            }
            var specific = {};
            for (var i = 0; i < out.length; i++) {
              var prefix = (norm(out[i].label).match(/^(20\\d{2}-20\\d{2}学年)/) || [])[1];
              if (prefix && out[i].kind) specific[prefix] = 1;
            }
            return out.filter(function(info) {
              var prefix = (norm(info.label).match(/^(20\\d{2}-20\\d{2}学年)/) || [])[1];
              return info.kind || !specific[prefix];
            });
          }
          function clearTermCandidate(candidate) {
            var strictInfo = strictZfTermFields(candidate);
            if (strictInfo && strictInfo.kind) return strictInfo;
            var matches = allTermInfos(candidate);
            if (matches.length > 1) return null;
            var zfInfo = zfTermFields(candidate);
            if (zfInfo && zfInfo.kind) return zfInfo;
            return parseTermCandidate(candidate, true);
          }
          function termKey(info) {
            return norm(info && info.label) + '|' + norm(info && info.kind);
          }
          function addGuess(list, candidate, source, base, parser, penalty) {
            var raw = typeof candidate === 'string' ? candidate : '';
            var info = typeof candidate === 'string' ? (parser ? parser(candidate) : clearTermCandidate(candidate)) : candidate;
            if (!info || !info.kind) return;
            var key = termKey(info);
            if (!key || key === '|') return;
            var text = norm(raw || info.label);
            var selected = /当前|已选|选中|正在查询|selected|checked|aria-selected|aria-checked/i.test(text);
            var structured = /xnm|xndm|xn|xqm|xqdm|xq|学年学期/i.test(text);
            var title = /课表标题|我的课表|个人课表|学生课表|课程表|课表|标题/i.test(text);
            var explicit = /春季|秋季|夏季|春|秋|夏|上学期|下学期|第?\\s*[一二三123]\\s*学期|12|16|0?[123]/.test(text);
            var count = (text.match(/20\\d{2}\\s*[-—–~至/]\\s*20\\d{2}|\\b20\\d{2}20\\d{2}[123]\\b|20\\d{2}\\s*年/g) || []).length;
            var score = base + (selected ? 24 : 0) + (structured ? 18 : 0) + (title ? 10 : 0) + (explicit ? 8 : 0) - (penalty || 0) - (count > 1 ? Math.min(32, (count - 1) * 12) : 0);
            var same = null;
            for (var i = 0; i < list.length; i += 1) {
              if (list[i].key === key) { same = list[i]; break; }
            }
            var guess = { key: key, score: score, source: source, info: info };
            if (!same || guess.score > same.score) {
              if (same) list.splice(list.indexOf(same), 1);
              list.push(guess);
            }
          }
          function chooseGuess(list, count) {
            list = list.filter(function(guess) {
              return guess && guess.info && guess.info.kind && guess.score >= 46;
            }).sort(function(a, b) {
              return b.score - a.score;
            });
            if (!list.length) return null;
            var best = list[0], second = list[1];
            if (/selected-label|selected-dom|structured-field|course-title/.test(best.source) && best.score >= 90) return best.info;
            if (second && second.key !== best.key && best.score - second.score < 18) return null;
            if (count > 1 && best.score < 84) return null;
            return best.info;
          }
          function setStatus(text) {
            window.__yayaIosAcademicStatus = text;
            var node = document.querySelector('[data-yaya-ios-academic-status]');
            if (node) node.textContent = text;
          }
          function confirmTerm(data) {
            return post('confirmAcademicTerm', {
              kind: 'course',
              title: (document.title || '') + ' 共' + (data && data.pages || 1) + '页',
              url: location.href,
              text: data.text,
              html: data.html,
              termLabel: '',
              termStart: '',
              termDetected: false,
              pages: data && data.pages || 1
            });
          }
          function hasVisiblePasswordField() {
            var docs = allDocs();
            for (var d = 0; d < docs.length; d += 1) {
              var inputs = docs[d].querySelectorAll && docs[d].querySelectorAll('input[type=password]');
              for (var i = 0; inputs && i < inputs.length; i += 1) {
                if (visible(inputs[i])) return true;
              }
            }
            return false;
          }
          function makeLoginExitChip() {
            var old = document.getElementById('yaya-sync-panel');
            if (old) old.remove();
            var accent = portalColor('accent', '#2563eb');
            var ink = portalColor('ink', '#16233a');
            var panel = portalColor('panel', '#eff6ff');
            var chip = document.createElement('button');
            chip.id = 'yaya-sync-panel';
            chip.type = 'button';
            chip.textContent = '返回鸦鸦';
            chip.setAttribute('aria-label', '返回鸦鸦日程');
            chip.style.cssText = 'position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:2147483646;min-width:86px;height:38px;border:1px solid rgba(255,255,255,.72);border-radius:19px;padding:0 13px;font-size:13px;font-weight:900;color:' + ink + ';background:linear-gradient(145deg,rgba(255,255,255,.92),' + rgba(panel,.84) + ');box-shadow:0 10px 22px ' + rgba(accent,.16) + ',inset 0 1px 0 rgba(255,255,255,.72);-webkit-backdrop-filter:blur(14px) saturate(1.24);backdrop-filter:blur(14px) saturate(1.24);touch-action:manipulation;pointer-events:auto';
            chip.onclick = function(event) {
              event.preventDefault();
              event.stopPropagation();
              post('returnHome');
            };
            document.documentElement.appendChild(chip);
          }
          function makePanel() {
            var old = document.getElementById('yaya-sync-panel');
            if (old) old.remove();
            var box = document.createElement('div');
            box.id = 'yaya-sync-panel';
            box.setAttribute('aria-label', '鸦鸦日程导入工具');
            var accent = portalColor('accent', '#2563eb');
            var warm = portalColor('warm', '#14b8a6');
            var ink = portalColor('ink', '#16233a');
            var muted = portalColor('muted', '#526073');
            var panel = portalColor('panel', '#eff6ff');
            var card = portalColor('card', '#ffffff');
            var radius = Math.max(20, Math.min(36, portalNumber('radius', 22) + 4));
            var control = mixHex(panel, accent, 0.08);
            box.style.cssText = 'position:fixed;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);z-index:2147483646;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(48px,1fr) minmax(48px,1fr) auto auto;gap:10px;width:min(320px,calc(100vw - 20px));min-width:188px;min-height:164px;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);overflow:hidden;padding:11px 12px 8px;border:1px solid rgba(255,255,255,.72);border-radius:' + radius + 'px;background:linear-gradient(145deg,' + rgba(card,.94) + ',' + rgba(control,.82) + ');box-shadow:0 18px 46px ' + rgba(accent,.24) + ',inset 0 1px 0 rgba(255,255,255,.86);-webkit-backdrop-filter:blur(18px) saturate(1.35);backdrop-filter:blur(18px) saturate(1.35);font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;color:' + ink + ';user-select:none;-webkit-user-select:none;touch-action:manipulation;pointer-events:auto';
            function button(text, tone, fn) {
              var node = document.createElement('button');
              node.type = 'button';
              node.textContent = text;
              var skin = tone === 'home'
                ? 'linear-gradient(135deg,' + rgba(card,.92) + ',' + rgba(panel,.78) + ')'
                : tone === 'exam' ? 'linear-gradient(135deg,' + mixHex(accent, warm, .28) + ',' + mixHex(warm, '#7c3aed', .32) + ')' : 'linear-gradient(135deg,' + accent + ',' + warm + ')';
              var toneColor = tone === 'home' ? ink : '#fff';
              var toneBorder = tone === 'home' ? rgba(accent,.18) : 'rgba(255,255,255,.64)';
              node.style.cssText = 'height:100%;min-height:0;border:1px solid ' + toneBorder + ';border-radius:' + Math.max(16, radius - 7) + 'px;padding:0 14px;font-size:14px;font-weight:900;line-height:1.12;color:' + toneColor + ';background:' + skin + ';box-shadow:0 10px 22px ' + rgba(accent,.20) + ',inset 0 1px 0 rgba(255,255,255,.42);touch-action:manipulation;pointer-events:auto;white-space:normal';
              if (tone === 'home') node.style.gridColumn = '1/-1';
              node.onclick = function(event) { event.preventDefault(); event.stopPropagation(); fn(node); };
              box.appendChild(node);
              return node;
            }
            button('导入课表', 'course', function(node) {
              runAcademicImport('course', node);
            });
            button('导入考试', 'exam', function(node) {
              runAcademicImport('exam', node);
            });
            button('返回鸦鸦', 'home', function() { post('returnHome'); });
            window.__yayaRunAcademicImportForNative = function(kind) {
              return runAcademicImport(kind === 'exam' ? 'exam' : 'course');
            };
            try {
              var pendingImport = sessionStorage.getItem('__yayaPendingAcademicImport');
              if (pendingImport && !loginBlocked()) {
                sessionStorage.removeItem('__yayaPendingAcademicImport');
                setTimeout(function() { runAcademicImport(pendingImport); }, 650);
              }
            } catch (error) {}
            var status = document.createElement('div');
            status.setAttribute('data-yaya-ios-academic-status', 'true');
            status.textContent = window.__yayaIosAcademicStatus || '登录后可导入课表或考试';
            status.style.cssText = 'grid-column:1 / -1;font-size:12px;font-weight:800;color:' + rgba(muted,.86) + ';text-align:center;padding:2px 4px 0';
            box.appendChild(status);
            var grip = document.createElement('div');
            grip.dataset.resize = 'true';
            grip.textContent = '◢';
            grip.style.cssText = 'grid-column:1/-1;justify-self:end;width:30px;height:24px;display:grid;place-items:center;color:' + rgba(accent,.62) + ';font-size:18px;font-weight:900;line-height:1;cursor:nwse-resize;touch-action:none;pointer-events:auto';
            box.appendChild(grip);
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
            function resize(width, height) {
              var margin = 10;
              var nextWidth = Math.min(Math.max(width, 188), Math.max(188, window.innerWidth - margin * 2));
              var nextHeight = Math.min(Math.max(height, 164), Math.max(164, window.innerHeight - margin * 2));
              box.style.width = Math.round(nextWidth) + 'px';
              box.style.height = Math.round(nextHeight) + 'px';
              var r = box.getBoundingClientRect();
              place(r.left, r.top);
            }
            var drag = null;
            var dragTimer = 0;
            function clearDrag() {
              if (!drag) return;
              try { box.releasePointerCapture(drag.id); } catch (error) {}
              drag = null;
              if (dragTimer) {
                clearTimeout(dragTimer);
                dragTimer = 0;
              }
            }
            function armDragTimeout() {
              if (dragTimer) clearTimeout(dragTimer);
              dragTimer = setTimeout(clearDrag, 12000);
            }
            box.addEventListener('pointerdown', function(event) {
              if (event.target && event.target.closest && event.target.closest('button,input,select,textarea,a')) return;
              var r = box.getBoundingClientRect();
              var isResize = event.target && event.target.closest && event.target.closest('[data-resize]');
              drag = { id: event.pointerId, mode: isResize ? 'resize' : 'drag', x: event.clientX, y: event.clientY, left: r.left, top: r.top, width: r.width, height: r.height };
              try { box.setPointerCapture(event.pointerId); } catch (error) {}
              armDragTimeout();
              event.preventDefault();
              event.stopPropagation();
            }, true);
            window.addEventListener('pointermove', function(event) {
              if (!drag) return;
              if (event.pointerId != null && drag.id != null && event.pointerId !== drag.id) return;
              if (drag.mode === 'resize') {
                resize(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y);
              } else {
                place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
              }
              armDragTimeout();
              event.preventDefault();
              event.stopPropagation();
            }, true);
            function end(event) {
              clearDrag();
            }
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            window.addEventListener('blur', clearDrag, true);
            window.addEventListener('pagehide', clearDrag, true);
            document.addEventListener('visibilitychange', function() {
              if (document.hidden) clearDrag();
            }, true);
            box.addEventListener('lostpointercapture', clearDrag, true);
            window.addEventListener('resize', function() {
              var r = box.getBoundingClientRect();
              place(r.left, r.top);
            }, true);
            document.documentElement.appendChild(box);
          }
          function renderImportPanelWhenReady() {
            if (hasVisiblePasswordField()) {
              makeLoginExitChip();
              return;
            }
            makePanel();
          }
          function watchLoginTransition() {
            if (document.__yayaImportPanelLoginObserver) return;
            try {
              document.__yayaImportPanelLoginObserver = new MutationObserver(function() {
                clearTimeout(document.__yayaImportPanelLoginTimer);
                document.__yayaImportPanelLoginTimer = setTimeout(renderImportPanelWhenReady, 260);
              });
              document.__yayaImportPanelLoginObserver.observe(document.documentElement || document, { subtree: true, childList: true });
            } catch (error) {}
          }
          renderImportPanelWhenReady();
          watchLoginTransition();
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
            let granted: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                granted = true
            case .notDetermined, .denied:
                granted = false
            @unknown default:
                granted = false
            }
            DispatchQueue.main.async {
                completion(granted)
            }
        }
    }

    private func collectReminderNotificationIdsToClear(
        storedIds: [String],
        completion: @escaping ([String]) -> Void
    ) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pendingRequests in
            let pendingIds = pendingRequests
                .map(\.identifier)
                .filter { $0.hasPrefix("reminder-") }
            center.getDeliveredNotifications { deliveredNotifications in
                let deliveredIds = deliveredNotifications
                    .map { $0.request.identifier }
                    .filter { $0.hasPrefix("reminder-") }
                let ids = Array(Set(storedIds + pendingIds + deliveredIds))
                DispatchQueue.main.async {
                    completion(ids)
                }
            }
        }
    }

    private func requestIOSNotificationPermission(openSettingsWhenDenied: Bool) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            guard let self else { return }
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                DispatchQueue.main.async { [weak self] in
                    self?.refreshStoredReminderStateAfterPermission()
                }
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, _ in
                    if granted {
                        DispatchQueue.main.async {
                            self?.refreshStoredReminderStateAfterPermission()
                        }
                    } else {
                        DispatchQueue.main.async {
                            self?.pushReminderPermissionStatus(force: true)
                        }
                    }
                }
            case .denied:
                if openSettingsWhenDenied {
                    self.openIOSNotificationSettings()
                } else {
                    self.pushReminderPermissionStatus(force: true)
                }
            @unknown default:
                self.pushReminderPermissionStatus(force: true)
            }
        }
    }

    private func openIOSNotificationSettings() {
        DispatchQueue.main.async { [weak self] in
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                self?.pushReminderPermissionStatus(force: true)
                return
            }
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:]) { [weak self] success in
                    guard !success else { return }
                    DispatchQueue.main.async {
                        self?.pushReminderPermissionStatus(force: true)
                    }
                }
            } else {
                self?.pushReminderPermissionStatus(force: true)
            }
        }
    }

    private func pushReminderPermissionStatus(force: Bool = false) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.pushReminderPermissionStatus(force: force)
            }
            return
        }
        let now = Date().timeIntervalSince1970
        if !force && now - lastReminderPermissionStatusAt < 2.0 {
            return
        }
        if !force && reminderPermissionStatusRequestInFlight {
            return
        }
        reminderPermissionStatusRequestInFlight = true
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
                    DispatchQueue.main.async {
                        self.reminderPermissionStatusRequestInFlight = false
                    }
                    return
                }
                DispatchQueue.main.async {
                    self.reminderPermissionStatusRequestInFlight = false
                    let now = Date().timeIntervalSince1970
                    if !force,
                       json == self.lastReminderPermissionStatusPayload,
                       now - self.lastReminderPermissionStatusAt < 2.0 {
                        return
                    }
                    self.lastReminderPermissionStatusPayload = json
                    self.lastReminderPermissionStatusAt = now
                    let script = """
                    window.__yayaReminderPermissionStatus = \(Self.javaScriptStringLiteral(json));
                    try { window.dispatchEvent(new Event('yaya-reminder-permission-updated')); } catch (error) {}
                    """
                    self.webView.evaluateJavaScript(script)
                }
            }
        }
    }

    private func refreshStoredReminderStateAfterPermission() {
        rescheduleStoredReminderNotifications()
        pushReminderPermissionStatus(force: true)
    }

    @objc private func handleAppDidBecomeActive() {
        rescheduleStoredReminderNotifications()
        pushReminderPermissionStatus()
    }

    private func rescheduleStoredReminderNotifications() {
        let defaults = UserDefaults.standard
        let payload = defaults.string(forKey: reminderNotificationPayloadKey)
            ?? defaults.string(forKey: legacyDdlNotificationPayloadKey)
            ?? ""
        guard !payload.isEmpty else { return }
        let now = Date().timeIntervalSince1970
        if payload == lastReminderSchedulePayload,
           now - lastActiveReminderRefreshAt < 15 * 60 {
            pushReminderPermissionStatus()
            return
        }
        scheduleReminderNotifications(payload, persistPayload: false)
    }

    private func scheduleReminderNotifications(_ rawPayload: String, persistPayload: Bool = true) {
        reminderScheduleGeneration += 1
        let generation = reminderScheduleGeneration
        let center = UNUserNotificationCenter.current()
        let defaults = UserDefaults.standard
        let safePayload = rawPayload.isEmpty ? "[]" : rawPayload
        let nowTick = Date().timeIntervalSince1970
        if persistPayload {
            defaults.set(safePayload, forKey: reminderNotificationPayloadKey)
            defaults.removeObject(forKey: legacyDdlNotificationPayloadKey)
        }
        if safePayload == lastReminderSchedulePayload && nowTick - lastReminderScheduleAt < 2.5 {
            pushReminderPermissionStatus()
            return
        }
        lastReminderSchedulePayload = safePayload
        lastReminderScheduleAt = nowTick
        lastActiveReminderRefreshAt = nowTick
        let storedOldIds = Array(Set(
            (defaults.stringArray(forKey: reminderNotificationIdsKey) ?? [])
                + (defaults.stringArray(forKey: legacyDdlNotificationIdsKey) ?? [])
        ))

        func clearPendingQueue(idsToClear: [String] = storedOldIds) {
            guard generation == reminderScheduleGeneration else { return }
            if !idsToClear.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: idsToClear)
                center.removeDeliveredNotifications(withIdentifiers: idsToClear)
            }
            defaults.set([], forKey: reminderNotificationIdsKey)
            defaults.set(0, forKey: reminderScheduledCountKey)
            defaults.set(Date().timeIntervalSince1970, forKey: reminderLastSyncAtKey)
            defaults.removeObject(forKey: legacyDdlNotificationIdsKey)
            pushReminderPermissionStatus()
        }

        guard let data = safePayload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let items = object as? [[String: Any]] else {
            clearPendingQueue()
            return
        }

        var plans: [ReminderNotificationPlan] = []
        let now = Date()
        for item in items {
            let id = stringValue(item["id"])
            let date = stringValue(item["date"])
            let time = stringValue(item["time"]).isEmpty ? "23:59" : stringValue(item["time"])
            let kind = stringValue(item["kind"])
            let rawAlarmKey = stringValue(item["alarmKey"])
            let alarmKey = rawAlarmKey.isEmpty ? "\(kind)|\(id)|\(date)|\(time)" : rawAlarmKey
            let safeAlarmKey = reminderIdentifierKey(from: alarmKey)
            let topicFallback = kind == "schedule" ? "日程" : "DDL"
            let topic = stringValue(item["topic"]).isEmpty ? topicFallback : stringValue(item["topic"])
            let titlePrefix = kind == "schedule" ? "日程提醒：" : "DDL提醒："
            let defaultTimeLabel = kind == "schedule" ? "开始" : "截止"
            let timeLabel = stringValue(item["timeLabel"]).isEmpty ? defaultTimeLabel : stringValue(item["timeLabel"])
            let detail = stringValue(item["content"])
            guard !id.isEmpty,
                  let deadline = Self.parseReminderDate(date: date, time: time),
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

        var seenPlanIdentifiers = Set<String>()
        let nextPlans = Array(plans
            .sorted { $0.fireDate < $1.fireDate }
            .filter { seenPlanIdentifiers.insert($0.identifier).inserted }
            .prefix(64))
        guard !nextPlans.isEmpty else {
            clearPendingQueue()
            return
        }

        hasNotificationAuthorization { [weak self] granted in
            guard let self else { return }
            guard generation == self.reminderScheduleGeneration else { return }
            self.collectReminderNotificationIdsToClear(storedIds: storedOldIds) { idsToClear in
                guard generation == self.reminderScheduleGeneration else { return }
                guard granted else {
                    if !idsToClear.isEmpty {
                        center.removePendingNotificationRequests(withIdentifiers: idsToClear)
                        center.removeDeliveredNotifications(withIdentifiers: idsToClear)
                    }
                    defaults.set([], forKey: self.reminderNotificationIdsKey)
                    defaults.set(0, forKey: self.reminderScheduledCountKey)
                    defaults.set(Date().timeIntervalSince1970, forKey: self.reminderLastSyncAtKey)
                    defaults.removeObject(forKey: self.legacyDdlNotificationIdsKey)
                    self.pushReminderPermissionStatus(force: true)
                    return
                }
                if !idsToClear.isEmpty {
                    center.removePendingNotificationRequests(withIdentifiers: idsToClear)
                    center.removeDeliveredNotifications(withIdentifiers: idsToClear)
                }
                let group = DispatchGroup()
                let collector = ReminderNotificationIdCollector()
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
                    let request = UNNotificationRequest(identifier: plan.identifier, content: content, trigger: trigger)
                    group.enter()
                    center.add(request) { error in
                        defer { group.leave() }
                        if error == nil {
                            collector.append(plan.identifier)
                        }
                    }
                }
                group.notify(queue: .main) {
                    guard generation == self.reminderScheduleGeneration else { return }
                    let scheduledSet = Set(collector.values())
                    let scheduledIds = nextPlans.map(\.identifier).filter { scheduledSet.contains($0) }
                    defaults.set(scheduledIds, forKey: self.reminderNotificationIdsKey)
                    defaults.set(scheduledIds.count, forKey: self.reminderScheduledCountKey)
                    defaults.set(Date().timeIntervalSince1970, forKey: self.reminderLastSyncAtKey)
                    defaults.removeObject(forKey: self.legacyDdlNotificationIdsKey)
                    self.pushReminderPermissionStatus(force: true)
                }
            }
        }
    }

    private func saveWidgetPayload(_ raw: Any) {
        let values = widgetValues(from: raw)
        let progress = min(max(numberValue(values[safe: 6]), 0), 100)
        let cleanPayloadCore: [String: Any] = [
            "ddlTitle": stringValue(values[safe: 0], fallback: "暂无 DDL"),
            "ddlTime": stringValue(values[safe: 1]),
            "scheduleTitle": stringValue(values[safe: 2], fallback: "暂无课程或日程"),
            "scheduleTime": stringValue(values[safe: 3]),
            "schedulePlace": stringValue(values[safe: 4]),
            "scheduleLabel": stringValue(values[safe: 5], fallback: "最近日程"),
            "scheduleProgress": progress,
            "scheduleActive": boolValue(values[safe: 7]),
            "theme": widgetThemePayload(values[safe: 8])
        ]
        let signature = payloadSignature(cleanPayloadCore)
        let appGroupDefaults = UserDefaults(suiteName: appGroupIdentifier)
        let defaults = appGroupDefaults ?? .standard
        if !signature.isEmpty,
           signature == defaults.string(forKey: widgetPayloadSignatureKey),
           defaults.data(forKey: widgetPayloadKey) != nil {
            return
        }
        var cleanPayload = cleanPayloadCore
        cleanPayload["updatedAt"] = Date().timeIntervalSince1970

        guard JSONSerialization.isValidJSONObject(cleanPayload),
              let data = try? JSONSerialization.data(withJSONObject: cleanPayload) else {
            return
        }
        persistWidgetPayload(data, signature: signature, to: defaults)
        if appGroupDefaults != nil {
            persistWidgetPayload(data, signature: signature, to: .standard)
        }
        widgetPayloadGeneration += 1
        let generation = widgetPayloadGeneration
        synchronizeWidgetDefaultsAndReload(defaults, generation: generation)
    }

    private func persistWidgetPayload(_ data: Data, signature: String, to defaults: UserDefaults) {
        defaults.set(data, forKey: widgetPayloadKey)
        defaults.set(signature, forKey: widgetPayloadSignatureKey)
    }

    private func synchronizeWidgetDefaultsAndReload(_ defaults: UserDefaults, generation: Int) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            defaults.synchronize()
            DispatchQueue.main.async {
                guard let self, generation == self.widgetPayloadGeneration else { return }
                self.scheduleWidgetTimelineReload()
            }
        }
    }

    private func scheduleWidgetTimelineReload() {
        widgetReloadWorkItem?.cancel()
        let kind = widgetKind
        let work = DispatchWorkItem { [weak self] in
            self?.widgetReloadWorkItem = nil
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
        widgetReloadWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    private func payloadSignature(_ payload: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else {
            return ""
        }
        return text
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

    private func reminderIdentifierKey(from value: String) -> String {
        let normalized = value
            .replacingOccurrences(of: "[^A-Za-z0-9_-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        let compact = normalized.isEmpty ? "item" : normalized
        return String(compact.prefix(96))
    }

    private func stringValue(_ value: Any?, fallback: String = "") -> String {
        if value == nil || value is NSNull { return fallback }
        if let value = value as? String { return value.isEmpty ? fallback : value }
        if let value { return String(describing: value) }
        return fallback
    }

    private func numberValue(_ value: Any?) -> Double {
        if value == nil || value is NSNull { return 0 }
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
        if value == nil || value is NSNull { return false }
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String {
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalized == "true" || normalized == "1"
        }
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

    private static func iosInteractionGuardScript() -> WKUserScript {
        let source = """
        (function() {
          function isLocalAppDocument(doc) {
            try {
              var location = doc.location || window.location;
              return location.protocol === 'file:' && /index\\.html$/i.test(location.pathname || '');
            } catch (error) {
              return false;
            }
          }
          function ensureViewport(doc) {
            try {
              if (!isLocalAppDocument(doc)) return;
              var head = doc.head || doc.documentElement;
              if (!head) return;
              var meta = doc.querySelector('meta[name="viewport"]');
              if (!meta) {
                meta = doc.createElement('meta');
                meta.name = 'viewport';
                head.appendChild(meta);
              }
              meta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
            } catch (error) {}
          }
          function installStyle(doc) {
            try {
              doc.documentElement.dataset.yayaIosWebview = 'true';
              if (doc.getElementById('__yayaIosInteractionGuard')) return;
              var style = doc.createElement('style');
              style.id = '__yayaIosInteractionGuard';
              var localApp = isLocalAppDocument(doc);
              var rules = [
                'input:not([type=range]),textarea,select{font-size:16px !important;}',
                '*{-webkit-tap-highlight-color:transparent;}'
              ];
              if (localApp) {
                rules.unshift('html,body{-webkit-text-size-adjust:100% !important;}');
                rules.push('button,a,[role=button],input,textarea,select,label{touch-action:manipulation;}');
                rules.push('html,body{overscroll-behavior-y:contain;}');
              }
              style.textContent = rules.join('\\n');
              (doc.head || doc.documentElement).appendChild(style);
            } catch (error) {}
          }
          function installGestureGuard(doc) {
            try {
              if (!isLocalAppDocument(doc)) return;
              if (doc.__yayaIosGestureGuard) return;
              doc.__yayaIosGestureGuard = true;
              doc.addEventListener('gesturestart', function(event) { event.preventDefault(); }, { passive: false });
              doc.addEventListener('gesturechange', function(event) { event.preventDefault(); }, { passive: false });
              doc.addEventListener('gestureend', function(event) { event.preventDefault(); }, { passive: false });
            } catch (error) {}
          }
          function install(doc) {
            if (!doc) return;
            ensureViewport(doc);
            installStyle(doc);
            installGestureGuard(doc);
          }
          install(document);
          setTimeout(function() { install(document); }, 120);
          setTimeout(function() { install(document); }, 720);
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
    }

    private static func academicFrameCaptureScript() -> WKUserScript {
        let source = """
        (function() {
          try {
            if (window.__yayaAcademicFrameCaptureReady) return;
            window.__yayaAcademicFrameCaptureReady = true;
            function norm(value) {
              return String(value || '').replace(/\\s+/g, ' ').trim();
            }
            function trustedHost() {
              var host = String(location.hostname || '').toLowerCase();
              return /(^|\\.)bnu\\.edu\\.cn$/.test(host);
            }
            function score(kind, value) {
              var raw = String(value || '');
              var text = norm(raw);
              if (!text) return 0;
              var courseHits = text.match(/课表|课程名称|\\[课程号\\]课程名|上课时间、地点|课程|上课|任课|教师|地点|学分|节次|周次|星期|教学班|周[一二三四五六日天]|第\\s*\\d+\\s*节|\\[\\d{1,2}(?:-\\d{1,2})?\\]/g) || [];
              var examHits = text.match(/考试|考场|考试时间|考试地点|考试轮次|考核方式|监考|座位|考试日期|科目|闭卷|开卷|机考|tableId|DataTable|keywords/g) || [];
              var result = (kind === 'exam' ? examHits : courseHits).length * 8;
              if (/20\\d{2}|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}/.test(text)) result += 10;
              if (/星期|周[一二三四五六日天]/.test(text)) result += 10;
              if (/<table|<tbody|<tr|<td|role=.?(table|grid)/i.test(raw)) result += 22;
              if (text.length > 500) result += 6;
              if (/登录|密码|验证码|统一身份认证/.test(text) && result < 54) result -= 28;
              return result;
            }
            function postSnapshot() {
              if (!trustedHost() || !document.body) return;
              var html = '';
              try {
                html = document.body.innerHTML || document.documentElement.outerHTML || '';
              } catch (error) {}
              var text = '';
              try {
                text = document.body.innerText || document.documentElement.innerText || '';
              } catch (error) {}
              var combined = text + ' ' + html.slice(0, 70000);
              var courseScore = score('course', combined);
              var examScore = score('exam', combined);
              if (Math.max(courseScore, examScore) < 42) return;
              var signature = location.href + '|' + document.title + '|' + courseScore + '|' + examScore + '|' + norm(text).slice(0, 120);
              if (signature === window.__yayaAcademicFrameSnapshotSignature) return;
              window.__yayaAcademicFrameSnapshotSignature = signature;
              window.webkit.messageHandlers.yayaBridge.postMessage({
                type: 'academicFrameSnapshot',
                url: String(location.href || ''),
                title: String(document.title || ''),
                text: String(text || '').slice(0, 120000),
                html: String(html || '').slice(0, 260000),
                courseScore: courseScore,
                examScore: examScore
              });
            }
            postSnapshot();
            setTimeout(postSnapshot, 700);
            setTimeout(postSnapshot, 1800);
          } catch (error) {}
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
    }

    private static func yayaNativeBridgeScript() -> WKUserScript {
        let fallback = #"{"native":true,"platform":"ios","notifications":"unknown","sound":"unknown","exactAlarms":"not-required","backgroundRun":"ios-managed","scheduledCount":0,"lastSyncAt":0,"canNotify":false,"canSound":false,"canExact":true,"canBackground":true,"needsAction":true}"#
        let source = """
        (function() {
          if (window.YayaNative && window.YayaNative.__iosBridgeReady) return;
          window.__yayaPendingImport = window.__yayaPendingImport || "";
          window.__yayaPendingFileImport = window.__yayaPendingFileImport || null;
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
            configurePortalUi: function(payload) {
              var value = typeof payload === "string" ? payload : JSON.stringify(payload || {});
              return post("configurePortalUi", { payload: value });
            },
            openAcademicPortal: function() {
              return post("openAcademicPortal");
            },
            openFileImport: function() {
              return post("openFileImport");
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
        index >= startIndex && index < endIndex ? self[index] : nil
    }
}

private extension UITextField {
    func setLeftPaddingPoints(_ amount: CGFloat) {
        let padding = UIView(frame: CGRect(x: 0, y: 0, width: amount, height: 1))
        leftView = padding
        leftViewMode = .always
    }
}
