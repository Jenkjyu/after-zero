import Capacitor
import Foundation
import Security

#if targetEnvironment(simulator)
// The official WeChat static library ships device-only slices. Keep the plugin
// registered on Simulator so the Web runtime has a stable bridge, but make its
// unsupported status explicit instead of linking a device binary into a sim build.
@objc(WeChatLoginPlugin)
public final class WeChatLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeChatLoginPlugin"
    public let jsName = "WeChatLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isInstalled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
    ]

    static func registerApp() {}
    static func handleOpenURL(_ url: URL) -> Bool { false }
    static func handleUniversalLink(_ userActivity: NSUserActivity) -> Bool { false }

    @objc public func isInstalled(_ call: CAPPluginCall) {
        call.resolve(["installed": false])
    }

    @objc public func login(_ call: CAPPluginCall) {
        call.reject("微信登录仅支持真机", "WECHAT_SIMULATOR_UNSUPPORTED")
    }
}
#else
private final class WeChatCallbackRouter: NSObject, WXApiDelegate {
    static let shared = WeChatCallbackRouter()

    private weak var plugin: WeChatLoginPlugin?
    private var bufferedResult: [String: Any]?

    func attach(_ plugin: WeChatLoginPlugin) {
        self.plugin = plugin
        if let bufferedResult {
            self.bufferedResult = nil
            plugin.deliverAuthResult(bufferedResult)
        }
    }

    func onReq(_ req: BaseReq) {
        // After Zero only initiates OAuth login and does not accept inbound WeChat requests.
    }

    func onResp(_ resp: BaseResp) {
        guard let auth = resp as? SendAuthResp else { return }
        let result: [String: Any] = [
            "code": auth.code ?? "",
            "state": auth.state ?? "",
            "errCode": auth.errCode,
            "errMsg": auth.errStr,
        ]
        if let plugin {
            plugin.deliverAuthResult(result)
        } else {
            // A Universal Link can cold-launch the app before Capacitor registers the plugin.
            bufferedResult = result
        }
    }
}

@objc(WeChatLoginPlugin)
public final class WeChatLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeChatLoginPlugin"
    public let jsName = "WeChatLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isInstalled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
    ]

    // The App ID is public client configuration. The AppSecret remains only in CloudBase.
    static let appID = "wx768c8167296b530e"
    static let universalLink = "https://afterzero.tech/wechat/"
    private static let pendingStateKey = "after-zero.wechat.pending-state"
    private static let pendingModeKey = "after-zero.wechat.pending-mode"

    private var pendingState = UserDefaults.standard.string(forKey: WeChatLoginPlugin.pendingStateKey)
    private var pendingMode = UserDefaults.standard.string(forKey: WeChatLoginPlugin.pendingModeKey) ?? "login"

    public override func load() {
        super.load()
        WeChatCallbackRouter.shared.attach(self)
    }

    static func registerApp() {
        _ = WXApi.registerApp(appID, universalLink: universalLink)
    }

    static func handleOpenURL(_ url: URL) -> Bool {
        WXApi.handleOpen(url, delegate: WeChatCallbackRouter.shared)
    }

    static func handleUniversalLink(_ userActivity: NSUserActivity) -> Bool {
        WXApi.handleOpenUniversalLink(userActivity, delegate: WeChatCallbackRouter.shared)
    }

    @objc public func isInstalled(_ call: CAPPluginCall) {
        call.resolve(["installed": WXApi.isWXAppInstalled()])
    }

    @objc public func login(_ call: CAPPluginCall) {
        // 账户绑定由前端内存中的 Promise 防止重复发起。若上一次微信未回调，
        // 这里清除的只是没有对应前端流程的持久化残留状态。
        if call.getBool("resetPending") == true {
            clearPending()
        }

        guard pendingState == nil else {
            call.reject("微信授权正在进行中", "WECHAT_LOGIN_IN_PROGRESS")
            return
        }
        guard WXApi.isWXAppInstalled() else {
            call.reject("未安装微信", "WECHAT_NOT_INSTALLED")
            return
        }
        guard let state = Self.randomState() else {
            call.reject("无法生成安全授权参数", "WECHAT_LOGIN_RANDOM_FAILED")
            return
        }

        let request = SendAuthReq()
        request.scope = "snsapi_userinfo"
        request.state = state
        savePending(state: state, mode: call.getString("mode") ?? "login")
        WXApi.send(request) { [weak self] sent in
            DispatchQueue.main.async {
                guard let self else { return }
                if sent {
                    call.resolve(["sent": true])
                } else {
                    self.clearPending()
                    call.reject("拉起微信授权失败", "WECHAT_LOGIN_LAUNCH_FAILED")
                }
            }
        }
    }

    fileprivate func deliverAuthResult(_ result: [String: Any]) {
        let returnedState = result["state"] as? String ?? ""
        let stateOk = pendingState != nil && pendingState == returnedState
        var payload = result
        payload["stateOk"] = stateOk
        payload["mode"] = pendingMode
        clearPending()
        notifyListeners("wechatAuthResult", data: payload)
    }

    private func savePending(state: String, mode: String) {
        pendingState = state
        pendingMode = mode
        UserDefaults.standard.set(state, forKey: Self.pendingStateKey)
        UserDefaults.standard.set(mode, forKey: Self.pendingModeKey)
    }

    private func clearPending() {
        pendingState = nil
        pendingMode = "login"
        UserDefaults.standard.removeObject(forKey: Self.pendingStateKey)
        UserDefaults.standard.removeObject(forKey: Self.pendingModeKey)
    }

    private static func randomState() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return nil
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
#endif
