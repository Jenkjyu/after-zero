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
