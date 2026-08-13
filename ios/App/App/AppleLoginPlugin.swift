import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation
import Security

@objc(AppleLoginPlugin)
public final class AppleLoginPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleLoginPlugin"
    public let jsName = "AppleLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?
    private var pendingNonce: String?
    private var pendingState: String?
    private var pendingMode: String?

    @objc public func login(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.pendingCall == nil else {
                call.reject("Apple 登录正在进行中", "APPLE_LOGIN_IN_PROGRESS")
                return
            }
            guard let rawNonce = Self.randomURLSafeString(byteCount: 32),
                  let state = Self.randomURLSafeString(byteCount: 32) else {
                call.reject("无法生成安全登录参数", "APPLE_LOGIN_RANDOM_FAILED")
                return
            }

            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = Self.sha256(rawNonce)
            request.state = state

            self.pendingCall = call
            self.pendingNonce = rawNonce
            self.pendingState = state
            self.pendingMode = call.getString("mode") ?? "login"

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall,
              let rawNonce = pendingNonce,
              let expectedState = pendingState else {
            clearPending()
            return
        }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Apple 未返回有效凭证", "APPLE_LOGIN_INVALID_CREDENTIAL")
            clearPending()
            return
        }
        guard credential.state == expectedState else {
            call.reject("Apple 登录状态校验失败", "APPLE_LOGIN_STATE_MISMATCH")
            clearPending()
            return
        }
        guard let identityTokenData = credential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8),
              !identityToken.isEmpty else {
            call.reject("Apple 未返回身份令牌", "APPLE_LOGIN_MISSING_TOKEN")
            clearPending()
            return
        }

        let fullName = credential.fullName
            .map { PersonNameComponentsFormatter().string(from: $0) } ?? ""

        call.resolve([
            "identityToken": identityToken,
            "rawNonce": rawNonce,
            "state": expectedState,
            "user": credential.user,
            "email": credential.email ?? "",
            "fullName": fullName,
            "mode": pendingMode ?? "login",
        ])
        clearPending()
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithError error: Error) {
        guard let call = pendingCall else {
            clearPending()
            return
        }
        if let authorizationError = error as? ASAuthorizationError,
           authorizationError.code == .canceled {
            call.reject("已取消", "APPLE_LOGIN_CANCELLED", error)
        } else {
            call.reject("Apple 登录失败：\(error.localizedDescription)", "APPLE_LOGIN_FAILED", error)
        }
        clearPending()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    private func clearPending() {
        pendingCall = nil
        pendingNonce = nil
        pendingState = nil
        pendingMode = nil
    }

    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func randomURLSafeString(byteCount: Int) -> String? {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes) == errSecSuccess else {
            return nil
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
