package io.github.jenkjyu.afterzero.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import com.tencent.mm.opensdk.constants.ConstantsAPI;
import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import io.github.jenkjyu.afterzero.WeChatLoginPlugin;

// 微信SDK硬编码要求回调Activity必须叫这个名字、在这个包路径下，不可重命名/移动。
public class WXEntryActivity extends Activity implements IWXAPIEventHandler {

    private IWXAPI api;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        api = WXAPIFactory.createWXAPI(this, WeChatLoginPlugin.APP_ID, false);
        api.handleIntent(getIntent(), this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        api.handleIntent(intent, this);
    }

    @Override
    public void onReq(BaseReq req) {
        // 这个app不需要处理微信主动发来的请求，只关心授权登录的响应。
    }

    @Override
    public void onResp(BaseResp resp) {
        WeChatLoginPlugin plugin = WeChatLoginPlugin.getInstance();
        if (resp.getType() == ConstantsAPI.COMMAND_SENDAUTH && resp instanceof SendAuth.Resp) {
            SendAuth.Resp authResp = (SendAuth.Resp) resp;
            if (plugin != null) {
                plugin.relayAuthResult(authResp.code, authResp.state, authResp.errCode, authResp.errStr);
            }
        }
        finish();
    }
}
