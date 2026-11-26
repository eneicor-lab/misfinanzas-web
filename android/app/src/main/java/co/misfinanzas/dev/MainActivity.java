package co.misfinanzas.dev;

import android.app.Activity;
import android.os.Bundle;
import android.content.pm.ApplicationInfo;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.os.Build;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler;

/** DEV-only offline UI; never point this activity at the production Supabase project. */
public final class MainActivity extends Activity {
    private WebView webView;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        webView = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30 && webView != null) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                FrameLayout.LayoutParams layout = (FrameLayout.LayoutParams) webView.getLayoutParams();
                layout.setMargins(safe.left, safe.top, safe.right, safe.bottom);
                webView.setLayoutParams(layout);
            }
            return insets;
        });
        root.requestApplyInsets();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                if (debug && "https://appassets.androidplatform.net/assets/index.html".equals(url)) {
                    probePrivateApp(0);
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"appassets.androidplatform.net".equals(request.getUrl().getHost());
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView,"MF_NATIVE",Collections.singleton("https://appassets.androidplatform.net"),(view,message,origin,isMainFrame,reply)->{
                if(!isMainFrame||!"https".equals(origin.getScheme())||!"appassets.androidplatform.net".equals(origin.getHost()))return;
                try {
                    org.json.JSONObject data=new org.json.JSONObject(message.getData());
                    if("enable".equals(data.optString("type"))) {
                        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},17);
                    } else if("replace".equals(data.optString("type")))ReminderReceiver.replace(this,data.getJSONArray("rows").toString());
                } catch(Exception ignored){/* Reject untrusted or malformed bridge messages. */}
            });
        }
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0 && getIntent().getBooleanExtra("mf_qa_notification",false)) {
            try { ReminderReceiver.replace(this,"[{\"id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"at\":"+(System.currentTimeMillis()+2000)+"}]"); }
            catch(org.json.JSONException ignored){throw new IllegalStateException("Synthetic reminder QA rejected");}
        }
    }
    /** Synthetic local-only probe requires an explicit debug intent; never runs in release. */
    private void probePrivateApp(int attempt) {
        boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!debug || !getIntent().getBooleanExtra("mf_qa_unlock", false) || webView == null) return;
        webView.evaluateJavascript(
            "(function(){try{if(!window.MF_VAULT_READY)return false;var f=document.getElementById('vaultForm');if(!MF_VAULT.unlocked&&!f.dataset.qaSubmitted){f.dataset.qaSubmitted='true';document.getElementById('vaultPassword').value='Synthetic+Vault!123';document.getElementById('vaultConfirmation').value='Synthetic+Vault!123';f.requestSubmit();return false;}if(!window.MF_APP_READY)return false;MF_VAULT.storage.setItem('mf_qa_privacy_probe','SYNTHETIC_PRIVATE_PROBE');var raw=localStorage.getItem('mf_private_vault_v1'),a=document.getElementById('mfPrivateApp').contentWindow;return Boolean(window.isSecureContext&&navigator.locks&&raw&&!raw.includes('SYNTHETIC_PRIVATE_PROBE')&&localStorage.getItem('mf_qa_privacy_probe')===null&&a.MF_APP_ENGINE.check(a.MF_APP_STORE.read().state))}catch(e){return false}})()",
            result -> { if ("true".equals(result)) Log.i("MisFinanzasQA", "web_ready=true encrypted_storage=true");
                else if (attempt < 25 && webView != null) webView.postDelayed(() -> probePrivateApp(attempt + 1), 500);
                else Log.i("MisFinanzasQA", "web_ready=false"); });
    }
    @Override protected void onPause() {
        if (webView != null) webView.evaluateJavascript("if(window.MF_PRIVATE_LOCK)MF_PRIVATE_LOCK()", null);
        super.onPause();
    }
    /** Preserve the same in-app navigation behavior as the web version. */
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
