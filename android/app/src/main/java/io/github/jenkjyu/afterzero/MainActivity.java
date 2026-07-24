package io.github.jenkjyu.afterzero;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(WeChatLoginPlugin.class);

        // targetSdkVersion 36(安卓15+)本身已经强制edge-to-edge、manifest没法退出，但那只保证
        // WebView这块Surface会画到系统状态栏/导航栏后面——状态栏本身是不是透明、页面内容知不知道
        // 要给状态栏让出空间，是另外两件事，必须App自己做。这里负责前者：状态栏/导航栏背景设成
        // 透明，让WebView自己的CSS背景透上去，不再是系统默认的实色块；后者(内容自己避开状态栏)
        // 靠www/index.html里的viewport-fit=cover meta标签 + CSS env(safe-area-inset-top)。
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        // 状态栏图标深浅跟着系统当前的日间/夜间模式走，不追App内CSS那套"系统偏好+手动覆盖
        // 两条路都要覆盖"的完整主题逻辑——原生层没有简单办法读到localStorage里的手动覆盖状态，
        // 这里只覆盖最常见的默认情况(用户没手动切换过主题)，两者不一致时只影响状态栏图标这一处。
        boolean isDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(!isDark);
        insetsController.setAppearanceLightNavigationBars(!isDark);

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
