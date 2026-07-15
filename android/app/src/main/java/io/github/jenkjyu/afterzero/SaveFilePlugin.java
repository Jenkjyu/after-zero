package io.github.jenkjyu.afterzero;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("此安卓版本暂不支持直接保存到下载目录");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri item = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) {
                call.reject("无法创建文件");
                return;
            }

            OutputStream out = getContext().getContentResolver().openOutputStream(item);
            if (out == null) {
                call.reject("无法写入文件");
                return;
            }
            out.write(bytes);
            out.close();

            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(item, done, null, null);

            JSObject ret = new JSObject();
            ret.put("uri", item.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存失败：" + e.getMessage(), e);
        }
    }
}
