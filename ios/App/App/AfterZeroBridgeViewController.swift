import Capacitor

final class AfterZeroBridgeViewController: CAPBridgeViewController {
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
    }
}
