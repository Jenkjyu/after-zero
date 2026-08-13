import Capacitor
import UIKit
import WebKit

private enum AfterZeroTabGlyph {
    case debts
    case pay
    case report
    case data
}

private final class AfterZeroTabIconControl: UIControl {
    let tabID: String
    private let glyph: AfterZeroTabGlyph
    private var activeTint = UIColor(red: 0.094, green: 0.271, blue: 0.231, alpha: 1)
    private var inactiveTint = UIColor(red: 0.396, green: 0.424, blue: 0.494, alpha: 1)

    init(tabID: String, glyph: AfterZeroTabGlyph) {
        self.tabID = tabID
        self.glyph = glyph
        super.init(frame: .zero)
        isOpaque = false
        accessibilityLabel = Self.accessibilityLabel(for: glyph)
        accessibilityTraits = .button
    }

    required init?(coder: NSCoder) {
        nil
    }

    override var isSelected: Bool {
        didSet {
            accessibilityTraits = isSelected ? [.button, .selected] : .button
            setNeedsDisplay()
        }
    }

    func setPalette(active: UIColor, inactive: UIColor) {
        activeTint = active
        inactiveTint = inactive
        setNeedsDisplay()
    }

    func playSelectionFeedback() {
        transform = .identity
        UIView.animateKeyframes(withDuration: 0.28, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
            UIView.addKeyframe(withRelativeStartTime: 0, relativeDuration: 0.35) {
                self.transform = CGAffineTransform(scaleX: 0.84, y: 0.84)
            }
            UIView.addKeyframe(withRelativeStartTime: 0.35, relativeDuration: 0.3) {
                self.transform = CGAffineTransform(scaleX: 1.08, y: 1.08)
            }
            UIView.addKeyframe(withRelativeStartTime: 0.65, relativeDuration: 0.35) {
                self.transform = .identity
            }
        }
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }

        let drawingSize = min(rect.width, rect.height, 24)
        context.saveGState()
        context.translateBy(x: (rect.width - drawingSize) / 2, y: (rect.height - drawingSize) / 2)
        context.scaleBy(x: drawingSize / 24, y: drawingSize / 24)
        context.setStrokeColor((isSelected ? activeTint : inactiveTint).cgColor)
        context.setFillColor((isSelected ? activeTint : inactiveTint).cgColor)
        context.setLineWidth(1.8)
        context.setLineCap(.round)
        context.setLineJoin(.round)

        switch glyph {
        case .debts:
            drawDebtIcon(in: context)
        case .pay:
            drawPayIcon(in: context)
        case .report:
            drawReportIcon(in: context)
        case .data:
            drawDataIcon(in: context)
        }

        context.restoreGState()
    }

    private func drawDebtIcon(in context: CGContext) {
        let card = CGRect(x: 2.5, y: 5.5, width: 19, height: 13)
        if isSelected {
            context.addPath(UIBezierPath(roundedRect: card, cornerRadius: 2.5).cgPath)
            context.fillPath()
            clear(rect: CGRect(x: 2.5, y: 8.5, width: 19, height: 2), in: context)
        } else {
            context.addPath(UIBezierPath(roundedRect: card, cornerRadius: 2.5).cgPath)
            context.strokePath()
            context.move(to: CGPoint(x: 2.8, y: 9.5))
            context.addLine(to: CGPoint(x: 21.2, y: 9.5))
            context.strokePath()
        }
    }

    private func drawPayIcon(in context: CGContext) {
        let calendar = CGRect(x: 3, y: 5.5, width: 18, height: 15)
        if isSelected {
            context.addPath(UIBezierPath(roundedRect: calendar, cornerRadius: 2.5).cgPath)
            context.fillPath()
            context.saveGState()
            context.setBlendMode(.clear)
            context.setLineWidth(1.8)
            context.move(to: CGPoint(x: 8, y: 3.5))
            context.addLine(to: CGPoint(x: 8, y: 7.5))
            context.move(to: CGPoint(x: 16, y: 3.5))
            context.addLine(to: CGPoint(x: 16, y: 7.5))
            context.strokePath()
            context.restoreGState()
        } else {
            context.addPath(UIBezierPath(roundedRect: calendar, cornerRadius: 2.5).cgPath)
            context.strokePath()
            context.move(to: CGPoint(x: 3.3, y: 9.5))
            context.addLine(to: CGPoint(x: 20.7, y: 9.5))
            context.move(to: CGPoint(x: 8, y: 3.5))
            context.addLine(to: CGPoint(x: 8, y: 7.5))
            context.move(to: CGPoint(x: 16, y: 3.5))
            context.addLine(to: CGPoint(x: 16, y: 7.5))
            context.strokePath()
        }
    }

    private func drawReportIcon(in context: CGContext) {
        if isSelected {
            context.addPath(UIBezierPath(roundedRect: CGRect(x: 2.8, y: 11, width: 4.2, height: 8), cornerRadius: 1.4).cgPath)
            context.addPath(UIBezierPath(roundedRect: CGRect(x: 9.9, y: 5, width: 4.2, height: 14), cornerRadius: 1.4).cgPath)
            context.addPath(UIBezierPath(roundedRect: CGRect(x: 17, y: 8.5, width: 4.2, height: 10.5), cornerRadius: 1.4).cgPath)
            context.fillPath()
        } else {
            context.move(to: CGPoint(x: 4, y: 19))
            context.addLine(to: CGPoint(x: 4, y: 11))
            context.move(to: CGPoint(x: 12, y: 19))
            context.addLine(to: CGPoint(x: 12, y: 5))
            context.move(to: CGPoint(x: 20, y: 19))
            context.addLine(to: CGPoint(x: 20, y: 12))
            context.strokePath()
        }
    }

    private func drawDataIcon(in context: CGContext) {
        if isSelected {
            context.addEllipse(in: CGRect(x: 8, y: 4, width: 8, height: 8))
            context.fillPath()
            let body = UIBezierPath()
            body.move(to: CGPoint(x: 12, y: 14))
            body.addCurve(to: CGPoint(x: 4, y: 18), controlPoint1: CGPoint(x: 9.33, y: 14), controlPoint2: CGPoint(x: 4, y: 15.34))
            body.addLine(to: CGPoint(x: 4, y: 20))
            body.addLine(to: CGPoint(x: 20, y: 20))
            body.addLine(to: CGPoint(x: 20, y: 18))
            body.addCurve(to: CGPoint(x: 12, y: 14), controlPoint1: CGPoint(x: 20, y: 15.34), controlPoint2: CGPoint(x: 14.67, y: 14))
            body.close()
            context.addPath(body.cgPath)
            context.fillPath()
        } else {
            context.strokeEllipse(in: CGRect(x: 8.7, y: 4.7, width: 6.6, height: 6.6))
            let body = UIBezierPath()
            body.move(to: CGPoint(x: 4.5, y: 20))
            body.addCurve(to: CGPoint(x: 12, y: 13.5), controlPoint1: CGPoint(x: 4.5, y: 16.4), controlPoint2: CGPoint(x: 7.8, y: 13.5))
            body.addCurve(to: CGPoint(x: 19.5, y: 20), controlPoint1: CGPoint(x: 16.2, y: 13.5), controlPoint2: CGPoint(x: 19.5, y: 16.4))
            context.addPath(body.cgPath)
            context.strokePath()
        }
    }

    private func clear(rect: CGRect, in context: CGContext) {
        context.saveGState()
        context.setBlendMode(.clear)
        context.fill(rect)
        context.restoreGState()
    }

    private static func accessibilityLabel(for glyph: AfterZeroTabGlyph) -> String {
        switch glyph {
        case .debts: return "债务"
        case .pay: return "还款日"
        case .report: return "报告"
        case .data: return "我的"
        }
    }
}

final class AfterZeroBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate, WKScriptMessageHandler {
    private let interactiveBackFinishThreshold: CGFloat = 0.35
    private let interactiveBackFlickVelocity: CGFloat = 850
    private let nativeTabMessageName = "afterZeroNativeTab"
    private var nativeTabBar: UIVisualEffectView?
    private var nativeTabButtons: [String: AfterZeroTabIconControl] = [:]
    private var pendingNativeTabID: String?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppleLoginPlugin())
        bridge?.registerPluginInstance(WeChatLoginPlugin())
        bridge?.registerPluginInstance(SaveFilePlugin())
        bridge?.registerPluginInstance(StoreKitPremiumPlugin())

        // App 内的层级返回由各 screen/sheet 的显式返回按钮与 Web 返回链负责；不让 WKWebView
        // 的边缘前进/后退手势绕过这条链。键盘则允许以原生交互式下滑收起，避免挡住表单底部。
        bridge?.webView?.allowsBackForwardNavigationGestures = false
        bridge?.webView?.scrollView.keyboardDismissMode = .interactive

        // WebView 的网页历史侧滑会绕过 App 的 screen/sheet 返回链；这里仅接收左边缘的
        // 原生手势，再把跟手进度交给 Web 的最上层 subpage。底部 sheet 不参与，避免和既有
        // 横向卡片手势或表单交互冲突。
        if let webView = bridge?.webView {
            let edgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleInteractiveBack(_:)))
            edgePan.edges = .left
            edgePan.maximumNumberOfTouches = 1
            edgePan.cancelsTouchesInView = false
            edgePan.delegate = self
            webView.addGestureRecognizer(edgePan)

            installNativeTabBarIfSupported(in: webView)
        }
    }

    deinit {
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: nativeTabMessageName)
    }

    private func installNativeTabBarIfSupported(in webView: WKWebView) {
        guard #available(iOS 26.0, *) else { return }

        let contentController = webView.configuration.userContentController
        contentController.removeScriptMessageHandler(forName: nativeTabMessageName)
        contentController.add(self, name: nativeTabMessageName)
        contentController.addUserScript(WKUserScript(source: nativeTabBridgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = true
        let tabBar = UIVisualEffectView(effect: effect)
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.layer.cornerRadius = 28
        tabBar.clipsToBounds = true
        tabBar.alpha = 0
        tabBar.isHidden = true
        view.addSubview(tabBar)

        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            tabBar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            tabBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -7),
            tabBar.heightAnchor.constraint(equalToConstant: 56)
        ])

        let stack = UIStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.alignment = .fill
        tabBar.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: tabBar.contentView.leadingAnchor, constant: 5),
            stack.trailingAnchor.constraint(equalTo: tabBar.contentView.trailingAnchor, constant: -5),
            stack.topAnchor.constraint(equalTo: tabBar.contentView.topAnchor, constant: 5),
            stack.bottomAnchor.constraint(equalTo: tabBar.contentView.bottomAnchor, constant: -5)
        ])

        let tabs: [(String, AfterZeroTabGlyph)] = [
            ("debts", .debts),
            ("pay", .pay),
            ("report", .report),
            ("data", .data)
        ]
        for (tabID, glyph) in tabs {
            let button = AfterZeroTabIconControl(tabID: tabID, glyph: glyph)
            button.addTarget(self, action: #selector(didTapNativeTab(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
            nativeTabButtons[tabID] = button
        }

        nativeTabBar = tabBar
        injectNativeTabBridge(into: webView)
    }

    @objc private func didTapNativeTab(_ sender: AfterZeroTabIconControl) {
        pendingNativeTabID = sender.tabID
        let tabID = javaScriptStringLiteral(sender.tabID)
        bridge?.webView?.evaluateJavaScript("document.querySelector('.tabbar button[data-view=' + \(tabID) + ']')?.click()")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == nativeTabMessageName, let payload = message.body as? [String: Any] else { return }
        DispatchQueue.main.async { [weak self] in
            self?.handleNativeTabMessage(payload)
        }
    }

    private func handleNativeTabMessage(_ payload: [String: Any]) {
        switch payload["type"] as? String {
        case "tab":
            guard let tabID = payload["id"] as? String else { return }
            nativeTabButtons.forEach { id, button in
                button.isSelected = id == tabID
            }
            if pendingNativeTabID == tabID {
                nativeTabButtons[tabID]?.playSelectionFeedback()
            }
            pendingNativeTabID = nil
        case "visibility":
            setNativeTabBarVisible(!(payload["hidden"] as? Bool ?? true))
        case "palette":
            let active = color(from: payload["accent"] as? String, fallback: UIColor(red: 0.094, green: 0.271, blue: 0.231, alpha: 1))
            let inactive = color(from: payload["muted"] as? String, fallback: UIColor(red: 0.396, green: 0.424, blue: 0.494, alpha: 1))
            nativeTabButtons.values.forEach { $0.setPalette(active: active, inactive: inactive) }
        default:
            break
        }
    }

    private func setNativeTabBarVisible(_ visible: Bool) {
        guard let nativeTabBar else { return }
        if visible {
            guard nativeTabBar.isHidden else { return }
            nativeTabBar.isHidden = false
            nativeTabBar.alpha = 0
            UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) {
                nativeTabBar.alpha = 1
            }
        } else {
            guard !nativeTabBar.isHidden else { return }
            UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState, .curveEaseIn], animations: {
                nativeTabBar.alpha = 0
            }, completion: { _ in
                nativeTabBar.isHidden = true
            })
        }
    }

    private func injectNativeTabBridge(into webView: WKWebView) {
        webView.evaluateJavaScript(nativeTabBridgeScript)
    }

    private func javaScriptStringLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let encoded = String(data: data, encoding: .utf8) else {
            return "''"
        }
        return String(encoded.dropFirst().dropLast())
    }

    private func color(from hex: String?, fallback: UIColor) -> UIColor {
        guard let hex else { return fallback }
        let value = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        guard value.count == 6, let number = UInt32(value, radix: 16) else { return fallback }
        return UIColor(
            red: CGFloat((number >> 16) & 0xff) / 255,
            green: CGFloat((number >> 8) & 0xff) / 255,
            blue: CGFloat(number & 0xff) / 255,
            alpha: 1
        )
    }

    private let nativeTabBridgeScript = """
    (() => {
      const handler = window.webkit?.messageHandlers?.afterZeroNativeTab;
      if (!handler || window.__afterZeroNativeTabBridgeInstalled) return;
      window.__afterZeroNativeTabBridgeInstalled = true;
      document.documentElement.classList.add('native-liquid-tabbar');

      const send = (payload) => handler.postMessage(payload);
      const sync = () => {
        const selected = document.querySelector('.tabbar button[aria-selected="true"]');
        if (selected) send({ type: 'tab', id: selected.getAttribute('data-view') });
        const rootStyle = getComputedStyle(document.documentElement);
        send({ type: 'palette', accent: rootStyle.getPropertyValue('--accent').trim(), muted: rootStyle.getPropertyValue('--text-muted').trim() });
        send({ type: 'visibility', hidden: Boolean(document.querySelector('#loginGate.open, .subpage.open, .sheet.open, #modalScrim.open')) });
      };

      window.addEventListener('az:tab-changed', sync);
      new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
      new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      sync();
    })();
    """

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let pan = gestureRecognizer as? UIScreenEdgePanGestureRecognizer,
              let webView = bridge?.webView else { return false }
        let velocity = pan.velocity(in: webView)
        return velocity.x > 0 && velocity.x > abs(velocity.y)
    }

    @objc private func handleInteractiveBack(_ recognizer: UIScreenEdgePanGestureRecognizer) {
        guard let webView = bridge?.webView else { return }
        let progress = min(1, max(0, recognizer.translation(in: webView).x / max(webView.bounds.width, 1)))

        switch recognizer.state {
        case .began:
            evaluateInteractiveBack("begin()")
        case .changed:
            evaluateInteractiveBack("update(\(progress))")
        case .ended:
            let velocity = recognizer.velocity(in: webView).x
            let shouldCommit = progress >= interactiveBackFinishThreshold || velocity >= interactiveBackFlickVelocity
            evaluateInteractiveBack("finish(\(shouldCommit ? "true" : "false"))")
        case .cancelled, .failed:
            evaluateInteractiveBack("finish(false)")
        default:
            break
        }
    }

    private func evaluateInteractiveBack(_ command: String) {
        bridge?.webView?.evaluateJavaScript("window.__azInteractiveBack && window.__azInteractiveBack.\(command)")
    }

}
