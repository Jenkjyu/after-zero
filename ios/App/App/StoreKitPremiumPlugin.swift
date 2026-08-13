import Capacitor
import Foundation
import Security
import StoreKit

@objc(StoreKitPremiumPlugin)
public final class StoreKitPremiumPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPremiumPlugin"
    public let jsName = "StoreKitPremium"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveAccessCache", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAccessCache", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAccessCache", returnType: CAPPluginReturnPromise),
    ]

    private let accessService = "io.github.jenkjyu.afterzero.entitlement"

    public override func load() {
        Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    self.notifyListeners("transactionUpdated", data: self.transactionPayload(transaction))
                }
            }
        }
    }

    @objc public func product(_ call: CAPPluginCall) {
        Task {
            do {
                let productId = try requiredProductId(call)
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("该购买项目暂不可用", "STOREKIT_PRODUCT_UNAVAILABLE")
                    return
                }
                call.resolve([
                    "productId": product.id,
                    "displayPrice": product.displayPrice,
                    "price": NSDecimalNumber(decimal: product.price).stringValue,
                    "currencyCode": product.priceFormatStyle.currencyCode,
                ])
            } catch {
                reject(call, error)
            }
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                let productId = try requiredProductId(call)
                guard let tokenString = call.getString("appAccountToken"),
                      let token = UUID(uuidString: tokenString) else {
                    call.reject("账户购买标识无效", "STOREKIT_ACCOUNT_TOKEN_INVALID")
                    return
                }
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("该购买项目暂不可用", "STOREKIT_PRODUCT_UNAVAILABLE")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Apple 未能验证本次购买", "STOREKIT_TRANSACTION_UNVERIFIED")
                        return
                    }
                    // 只有服务端确认账户权益后，Web 层才会调用 finish()；网络失败时保留未完成
                    // 交易，之后可由 Transaction.updates 或恢复购买重新上报，不会丢失。
                    call.resolve(transactionPayload(transaction))
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("无法识别的购买结果", "STOREKIT_PURCHASE_UNKNOWN")
                }
            } catch {
                reject(call, error)
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        Task {
            do {
                let productId = try requiredProductId(call)
                try await AppStore.sync()
                for await verification in Transaction.currentEntitlements {
                    guard case .verified(let transaction) = verification, transaction.productID == productId else { continue }
                    call.resolve(transactionPayload(transaction))
                    return
                }
                call.resolve(["status": "notFound"])
            } catch {
                reject(call, error)
            }
        }
    }

    @objc public func finish(_ call: CAPPluginCall) {
        Task {
            guard let rawId = call.getString("transactionId"), let transactionId = UInt64(rawId) else {
                call.reject("交易标识无效", "STOREKIT_TRANSACTION_ID_INVALID")
                return
            }
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification, transaction.id == transactionId else { continue }
                await transaction.finish()
                call.resolve()
                return
            }
            // 已完成或来自恢复购买的交易都不需要再次 finish；保持幂等。
            call.resolve()
        }
    }

    @objc public func saveAccessCache(_ call: CAPPluginCall) {
        guard let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("权益缓存参数无效", "ACCESS_CACHE_INVALID")
            return
        }
        do {
            // `options` 同时包含 userId；缓存中仅保留服务端已经确认过的权益字段。
            var payload = call.options
            payload.removeValue(forKey: "userId")
            let data = try JSONSerialization.data(withJSONObject: payload)
            try writeKeychain(data, account: userId)
            call.resolve()
        } catch {
            reject(call, error)
        }
    }

    @objc public func getAccessCache(_ call: CAPPluginCall) {
        guard let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("权益缓存参数无效", "ACCESS_CACHE_INVALID")
            return
        }
        do {
            guard let data = try readKeychain(account: userId) else {
                call.resolve(["access": nil])
                return
            }
            let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            call.resolve(["access": value ?? NSNull()])
        } catch {
            reject(call, error)
        }
    }

    @objc public func clearAccessCache(_ call: CAPPluginCall) {
        guard let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("权益缓存参数无效", "ACCESS_CACHE_INVALID")
            return
        }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: accessService,
                                    kSecAttrAccount as String: userId]
        SecItemDelete(query as CFDictionary)
        call.resolve()
    }

    private func requiredProductId(_ call: CAPPluginCall) throws -> String {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            throw StoreKitPremiumError.invalidProductId
        }
        return productId
    }

    private func transactionPayload(_ transaction: Transaction) -> [String: Any] {
        ["status": "success",
         "transactionId": String(transaction.id),
         "originalTransactionId": String(transaction.originalID),
         "productId": transaction.productID,
         "jws": transaction.jwsRepresentation]
    }

    private func writeKeychain(_ data: Data, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: accessService,
                                    kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw StoreKitPremiumError.keychain(status) }
    }

    private func readKeychain(account: String) throws -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: accessService,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var output: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &output)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = output as? Data else { throw StoreKitPremiumError.keychain(status) }
        return data
    }

    private func reject(_ call: CAPPluginCall, _ error: Error) {
        call.reject(error.localizedDescription, "STOREKIT_FAILED", error)
    }
}

private enum StoreKitPremiumError: LocalizedError {
    case invalidProductId
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidProductId: return "购买项目无效"
        case .keychain: return "无法保存本机权益缓存"
        }
    }
}
