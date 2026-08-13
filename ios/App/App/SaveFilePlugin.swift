import Capacitor
import Foundation
import UIKit

/// iOS counterpart of Android's handwritten SaveFile plugin.
///
/// The Web contract deliberately stays `save({ data, filename, mimeType })`: the
/// page already owns Blob creation, while native code owns the system file UI.
/// Base64 is decoded in small blocks into a unique temporary file before either
/// UIKit controller is shown, so the document/share controller only ever holds a
/// file URL rather than a full export in memory.
@objc(SaveFilePlugin)
public final class SaveFilePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "SaveFilePlugin"
    public let jsName = "SaveFile"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    private enum PendingOperation {
        case save
        case share
    }

    private var pendingCall: CAPPluginCall?
    private var temporaryURL: URL?
    private var pendingOperation: PendingOperation?

    @objc public func save(_ call: CAPPluginCall) {
        prepareTemporaryFile(for: call) { [weak self] url in
            guard let self else { return }
            guard let viewController = self.bridge?.viewController else {
                self.finish(with: "无法打开系统文件选择器", code: "SAVE_FILE_NO_VIEW_CONTROLLER")
                return
            }
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            picker.delegate = self
            self.pendingOperation = .save
            viewController.present(picker, animated: true)
        }
    }

    @objc public func share(_ call: CAPPluginCall) {
        prepareTemporaryFile(for: call) { [weak self] url in
            guard let self else { return }
            guard let viewController = self.bridge?.viewController else {
                self.finish(with: "无法打开系统分享面板", code: "SAVE_FILE_NO_VIEW_CONTROLLER")
                return
            }
            self.pendingOperation = .share
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = activity.popoverPresentationController {
                popover.sourceView = viewController.view
                popover.sourceRect = viewController.view.bounds
            }
            activity.completionWithItemsHandler = { [weak self] _, completed, _, error in
                guard let self else { return }
                if let error {
                    self.finish(with: "分享失败：\(error.localizedDescription)", code: "SAVE_FILE_SHARE_FAILED")
                } else if completed {
                    self.finish(result: [:])
                } else {
                    self.finish(with: "已取消", code: "SAVE_FILE_CANCELLED")
                }
            }
            viewController.present(activity, animated: true)
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(with: "已取消", code: "SAVE_FILE_CANCELLED")
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let result = urls.first.map { ["uri": $0.absoluteString] } ?? [:]
        finish(result: result)
    }

    private func prepareTemporaryFile(for call: CAPPluginCall, ready: @escaping (URL) -> Void) {
        guard pendingCall == nil else {
            call.reject("文件操作正在进行中", "SAVE_FILE_IN_PROGRESS")
            return
        }
        guard let base64 = call.getString("data"), !base64.isEmpty,
              let filename = call.getString("filename"), !filename.isEmpty else {
            call.reject("缺少文件数据或文件名", "SAVE_FILE_MISSING_ARGUMENT")
            return
        }

        // A native controller may outlive the JavaScript task that called it. Keep
        // only a temporary URL as its payload; base64 is decoded before presentation.
        pendingCall = call
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let url = try Self.writeBase64(base64, filename: filename)
                DispatchQueue.main.async {
                    guard let self else {
                        try? FileManager.default.removeItem(at: url)
                        return
                    }
                    self.temporaryURL = url
                    ready(url)
                }
            } catch {
                DispatchQueue.main.async {
                    self?.finish(with: "准备文件失败：\(error.localizedDescription)", code: "SAVE_FILE_PREPARE_FAILED")
                }
            }
        }
    }

    private static func writeBase64(_ base64: String, filename: String) throws -> URL {
        let safeName = (filename as NSString).lastPathComponent
        guard !safeName.isEmpty, safeName != "." else {
            throw SaveFileError.invalidFilename
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("after-zero-export-\(UUID().uuidString)-\(safeName)")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let handle = try FileHandle(forWritingTo: url)

        do {
            // The string comes from a Blob data URL and therefore uses ASCII base64.
            // 32 KiB is divisible by four, so every non-final block remains decodable.
            let text = base64 as NSString
            let blockSize = 32 * 1024
            var offset = 0
            while offset < text.length {
                let length = min(blockSize, text.length - offset)
                let block = text.substring(with: NSRange(location: offset, length: length))
                guard let bytes = Data(base64Encoded: block) else {
                    throw SaveFileError.invalidData
                }
                try handle.write(contentsOf: bytes)
                offset += length
            }
            try handle.close()
            return url
        } catch {
            try? handle.close()
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }

    private func finish(result: [String: Any]) {
        let call = pendingCall
        cleanupTemporaryFile()
        call?.resolve(result)
    }

    private func finish(with message: String, code: String) {
        let call = pendingCall
        cleanupTemporaryFile()
        call?.reject(message, code)
    }

    private func cleanupTemporaryFile() {
        if let temporaryURL {
            try? FileManager.default.removeItem(at: temporaryURL)
        }
        temporaryURL = nil
        pendingCall = nil
        pendingOperation = nil
    }

    private enum SaveFileError: LocalizedError {
        case invalidFilename
        case invalidData

        var errorDescription: String? {
            switch self {
            case .invalidFilename: return "文件名无效"
            case .invalidData: return "文件数据无效"
            }
        }
    }
}
