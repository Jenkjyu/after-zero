package io.github.jenkjyu.afterzero;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String base64 = call.getString("data");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (base64 == null || filename == null) {
            call.reject("缺少文件数据或文件名");
            return;
        }

        // ⚠️ 关键：不要把整段base64留在PluginCall里带过系统"另存为"选择器这道Activity边界。
        // 系统选择器是一个覆盖满屏的独立Activity，会把本App退到后台；Capacitor为了在进程可能被
        // 回收后还能把结果回调给这个call，会保存这个call（其data里就是那段base64）。当导出的
        // 文件较大（尤其是内嵌图表PNG的PDF、含多张sheet的xlsx）时，这段base64会让保存/恢复
        // call时的Binder事务超限抛TransactionTooLargeException，或在回调里"持有base64+再decode
        // 出一份等大的byte[]"双份占用内存OOM——两种都是框架层未捕获异常，直接闪退，且此时SAF
        // 已经先把目标文件创建成0字节，于是表现为"选完路径就闪退、导出的文件0B打不开"。
        // 修法：这里先把base64解码落到cache里的临时文件，把call里的大字段换成一个短小的临时
        // 文件路径，回调时再从临时文件流式拷贝到用户选的位置——带过Activity边界的只剩一个短路径。
        File tmp;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            tmp = File.createTempFile("afz_save_", ".bin", getContext().getCacheDir());
            FileOutputStream fos = new FileOutputStream(tmp);
            fos.write(bytes);
            fos.close();
        } catch (Exception e) {
            call.reject("准备文件失败：" + e.getMessage(), e);
            return;
        }
        // 把大字段从call里清掉，只留临时文件路径，避免它被带进Activity结果的保存/恢复过程。
        call.getData().remove("data");
        call.getData().put("tmpPath", tmp.getAbsolutePath());

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String tmpPath = call.getString("tmpPath");
        File tmp = tmpPath != null ? new File(tmpPath) : null;
        try {
            // 用户在系统选择器里点了"取消"是正常操作，不是错误——跟"保存失败"分开处理，
            // reject文案里明确写"已取消"，JS那边toast出来也不会显得像出了故障。
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                call.reject("已取消");
                return;
            }
            Uri uri = result.getData().getData();
            if (uri == null) {
                call.reject("已取消");
                return;
            }
            if (tmp == null || !tmp.exists()) {
                call.reject("临时文件丢失，请重试");
                return;
            }
            InputStream in = new FileInputStream(tmp);
            OutputStream out = getContext().getContentResolver().openOutputStream(uri);
            if (out == null) {
                in.close();
                call.reject("无法写入文件");
                return;
            }
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            out.flush();
            out.close();
            in.close();

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存失败：" + e.getMessage(), e);
        } finally {
            if (tmp != null) { try { tmp.delete(); } catch (Exception ignore) {} }
        }
    }
}
