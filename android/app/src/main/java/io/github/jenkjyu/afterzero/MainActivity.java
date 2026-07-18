package io.github.jenkjyu.afterzero;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(WeChatLoginPlugin.class);
        super.onCreate(savedInstanceState);

        // 长按债务卡片进入拖拽排序编辑模式时，WebView内部对"长按"手势的识别会触发系统级
        // 触感反馈(View.performHapticFeedback)——这是安卓WebView内容层自己的手势识别逻辑，
        // 跟网页CSS/JS层面做的user-select:none、阻止contextmenu事件是两回事：那几个只影响
        // "识别到长按之后要不要弹选中/菜单"，不影响"识别到长按这件事本身要不要震一下"。
        // 这里直接关掉WebView这个View的触感反馈能力，从源头上摁住震动。
        bridge.getWebView().setHapticFeedbackEnabled(false);

        // targetSdkVersion 36：安卓的手势/预测性返回走的是 OnBackPressedDispatcher，
        // 不再可靠地触发老式 Activity.onBackPressed() 覆写，所以用新API接管返回键。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null) { finish(); return; }
                bridge.getWebView().evaluateJavascript(
                    "(function(){return !!(window.__handleBackButton && window.__handleBackButton());})()",
                    value -> { if (!"true".equals(value)) finish(); }
                );
            }
        });
    }
}
