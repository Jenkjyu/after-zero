package io.github.jenkjyu.after_zero

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileInputStream

class MainActivity : FlutterActivity() {
    private companion object {
        const val FILE_SAVE_CHANNEL = "after_zero/file_save"
    }

    private data class PendingSave(
        val sourcePath: String,
        val result: MethodChannel.Result,
    )

    private var pendingSave: PendingSave? = null

    private val createDocument = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { activityResult ->
        val pending = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        val source = File(pending.sourcePath)
        try {
            val destination: Uri? = activityResult.data?.data
            if (activityResult.resultCode != Activity.RESULT_OK || destination == null) {
                pending.result.success(mapOf("cancelled" to true))
                return@registerForActivityResult
            }
            if (!source.exists()) {
                pending.result.error("MISSING_TEMP_FILE", "临时导出文件已丢失，请重试", null)
                return@registerForActivityResult
            }
            FileInputStream(source).use { input ->
                contentResolver.openOutputStream(destination)?.use { output ->
                    input.copyTo(output, 64 * 1024)
                } ?: throw IllegalStateException("无法写入所选位置")
            }
            pending.result.success(mapOf("cancelled" to false, "uri" to destination.toString()))
        } catch (error: Exception) {
            pending.result.error("SAVE_FAILED", "保存失败：${error.message}", null)
        } finally {
            source.delete()
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, FILE_SAVE_CHANNEL)
            .setMethodCallHandler { call, result -> handleSaveCall(call, result) }
    }

    private fun handleSaveCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "save") {
            result.notImplemented()
            return
        }
        if (pendingSave != null) {
            result.error("SAVE_IN_PROGRESS", "已有文件正在等待保存", null)
            return
        }
        val sourcePath = call.argument<String>("sourcePath")
        val filename = call.argument<String>("filename")
        val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
        if (sourcePath.isNullOrBlank() || filename.isNullOrBlank()) {
            result.error("INVALID_ARGUMENT", "缺少导出文件或文件名", null)
            return
        }
        val source = File(sourcePath)
        if (!source.exists()) {
            result.error("MISSING_TEMP_FILE", "临时导出文件已丢失，请重试", null)
            return
        }
        pendingSave = PendingSave(sourcePath, result)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeType)
            .putExtra(Intent.EXTRA_TITLE, filename)
        createDocument.launch(intent)
    }
}

class MainActivity : FlutterActivity()
