package io.github.jenkjyu.afterzero;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import java.util.UUID;

@CapacitorPlugin(name = "WeChatLogin")
public class WeChatLoginPlugin extends Plugin {

    // TODO: 微信开放平台"移动应用"审核通过后，把这里换成真实AppID（AppID本身不是秘密，可以留在客户端；
    // AppSecret绝不能出现在这个文件或任何客户端代码里，只存在云函数的环境变量中）。
    // public：WXEntryActivity（不同包）注册IWXAPI时也需要用同一个AppID。
    public static final String APP_ID = "TODO_WECHAT_APPID";

    // WXEntryActivity跟这个插件不是同一个Activity实例，靠这个静态引用把回调结果转发回来。
    private static WeChatLoginPlugin instance;

    private IWXAPI api;
    private String pendingState;

    public static WeChatLoginPlugin getInstance() {
        return instance;
    }

    @Override
    public void load() {
        instance = this;
        api = WXAPIFactory.createWXAPI(getContext(), APP_ID, true);
        api.registerApp(APP_ID);
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", api.isWXAppInstalled());
        call.resolve(ret);
    }

    @PluginMethod
    public void login(PluginCall call) {
        if (!api.isWXAppInstalled()) {
            call.reject("未安装微信");
            return;
        }

        pendingState = UUID.randomUUID().toString();

        SendAuth.Req req = new SendAuth.Req();
        req.scope = "snsapi_userinfo";
        req.state = pendingState;
        boolean sent = api.sendReq(req);

        if (!sent) {
            call.reject("拉起微信授权失败");
            return;
        }

        // 真正的授权结果是异步的，会通过 wechatAuthResult 事件回传（见 relayAuthResult），
        // 这里只确认"已经把用户丢去微信那边了"。
        JSObject ret = new JSObject();
        ret.put("sent", true);
        call.resolve(ret);
    }

    // 由 WXEntryActivity 在收到微信回调后调用。
    public void relayAuthResult(String code, String state, int errCode, String errMsg) {
        JSObject data = new JSObject();
        boolean stateOk = pendingState != null && pendingState.equals(state);
        data.put("code", code);
        data.put("errCode", errCode);
        data.put("errMsg", errMsg == null ? "" : errMsg);
        data.put("stateOk", stateOk);
        pendingState = null;
        notifyListeners("wechatAuthResult", data);
    }
}
