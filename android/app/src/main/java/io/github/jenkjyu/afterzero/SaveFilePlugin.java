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

        // 用系统"另存为"选择器(Storage Access Framework)代替原来静默写入MediaStore.Downloads。
        // 老写法虽然写入本身会成功，但很多国产文件管理器的"下载"分类视图只按已知mime类型
        // (图片/视频/文档等)过滤显示，备份用的application/json这种冷门类型会被过滤掉——
        // 文件其实存在(在"所有文件→Download"文件夹里能找到)，但用户在分类视图里看不到，
        // 会误以为保存失败。让用户自己选保存位置，文件存哪就一定看得见，还顺带能存到
        // Google Drive这类云盘。ACTION_CREATE_DOCUMENT从API 19就有，早于这个项目
        // minSdk=24，不再需要像旧版那样限制"安卓10+才支持"。
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
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
        try {
            byte[] bytes = Base64.decode(call.getString("data"), Base64.DEFAULT);
            OutputStream out = getContext().getContentResolver().openOutputStream(uri);
            if (out == null) {
                call.reject("无法写入文件");
                return;
            }
            out.write(bytes);
            out.close();

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存失败：" + e.getMessage(), e);
        }
    }
}
