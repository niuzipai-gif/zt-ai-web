package com.ztai.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String START_URL = "https://niuzipai-gif.github.io/zt-ai-web/?zt-shell=android";
    private static final long LOAD_TIMEOUT_MS = 20_000L;
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final int RECORD_AUDIO_REQUEST = 4102;
    private static final String TRUSTED_WEB_ORIGIN = "https://niuzipai-gif.github.io";

    private WebView webView;
    private ProgressBar progressBar;
    private TextView errorView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;
    private AndroidVoiceBridge voiceBridge;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable loadTimeout = () -> showLoadError();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(createContentView());
        configureWebView();
        beginLoading();
        webView.loadUrl(START_URL);
    }

    private View createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 247, 246));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 247, 246));
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this);
        progressBar.setIndeterminate(true);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(64, 64);
        progressParams.gravity = android.view.Gravity.CENTER;
        root.addView(progressBar, progressParams);

        errorView = new TextView(this);
        errorView.setText("ZT.AI 暂时无法连接网络\n请检查网络后点击重试");
        errorView.setTextColor(Color.rgb(72, 82, 86));
        errorView.setTextSize(16);
        errorView.setGravity(android.view.Gravity.CENTER);
        errorView.setPadding(48, 24, 48, 24);
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        errorView.setOnClickListener(v -> {
            beginLoading();
            webView.reload();
        });
        return root;
    }

    private void beginLoading() {
        errorView.setVisibility(View.GONE);
        progressBar.setVisibility(View.VISIBLE);
        mainHandler.removeCallbacks(loadTimeout);
        mainHandler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }

    private void finishLoading() {
        mainHandler.removeCallbacks(loadTimeout);
        progressBar.setVisibility(View.GONE);
    }

    private void showLoadError() {
        progressBar.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        voiceBridge = new AndroidVoiceBridge();
        webView.addJavascriptInterface(voiceBridge, "ztaiAndroidVoice");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                beginLoading();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                finishLoading();
                errorView.setVisibility(View.GONE);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals("niuzipai-gif.github.io") || host.endsWith(".github.io"))) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showLoadError();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    finishLoading();
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!isTrustedAudioRequest(request)) {
                    request.deny();
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    if (pendingPermissionRequest != null) {
                        pendingPermissionRequest.deny();
                    }
                    pendingPermissionRequest = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
                    return;
                }
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException exception) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            openExternal(Uri.parse(url));
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // The WebView stays usable when no external handler is installed.
        }
    }

    private boolean isTrustedAudioRequest(PermissionRequest request) {
        if (request == null || request.getOrigin() == null
                || !TRUSTED_WEB_ORIGIN.equals(request.getOrigin().toString())) {
            return false;
        }
        String[] resources = request.getResources();
        return resources != null && resources.length == 1
                && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0]);
    }

    private final class AndroidVoiceBridge {
        private SpeechRecognizer recognizer;

        @JavascriptInterface
        public void start(String language) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    dispatchError("请先允许麦克风权限，再开始语音对话");
                    return;
                }
                if (!SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                    dispatchError("当前设备没有可用的系统语音识别服务");
                    return;
                }
                destroyRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float rmsdB) { }
                    @Override public void onBufferReceived(byte[] buffer) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onError(int error) { dispatchError(errorMessage(error)); }
                    @Override public void onResults(Bundle results) {
                        dispatchResult(firstMatch(results), true);
                    }
                    @Override public void onPartialResults(Bundle results) {
                        dispatchResult(firstMatch(results), false);
                    }
                    @Override public void onEvent(int eventType, Bundle params) { }
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "zh-CN" : language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                recognizer.startListening(intent);
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(this::destroyRecognizer);
        }

        void dispose() {
            runOnUiThread(this::destroyRecognizer);
        }

        private void destroyRecognizer() {
            if (recognizer == null) return;
            try { recognizer.stopListening(); } catch (RuntimeException ignored) { }
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }

        private String firstMatch(Bundle results) {
            if (results == null) return "";
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            return matches == null || matches.isEmpty() ? "" : String.valueOf(matches.get(0));
        }

        private void dispatchResult(String text, boolean isFinal) {
            if (webView == null || text == null || text.trim().isEmpty()) return;
            String script = "window.__ztaiAndroidVoiceOnResult && window.__ztaiAndroidVoiceOnResult("
                    + JSONObject.quote(text) + "," + isFinal + ")";
            webView.evaluateJavascript(script, null);
        }

        private void dispatchError(String message) {
            if (webView == null) return;
            String script = "window.__ztaiAndroidVoiceOnError && window.__ztaiAndroidVoiceOnError("
                    + JSONObject.quote(message == null ? "语音识别暂时不可用" : message) + ")";
            webView.evaluateJavascript(script, null);
        }

        private String errorMessage(int error) {
            switch (error) {
                case SpeechRecognizer.ERROR_AUDIO: return "麦克风音频输入失败";
                case SpeechRecognizer.ERROR_CLIENT: return "语音识别客户端暂时不可用";
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "语音识别没有麦克风权限";
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "语音识别网络超时，请检查网络后重试";
                case SpeechRecognizer.ERROR_NO_MATCH: return "没有听清你的话，请再说一次";
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "语音识别正在处理上一句话，请稍后再试";
                case SpeechRecognizer.ERROR_SERVER: return "系统语音识别服务暂时不可用";
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "没有听到声音，请再说一次";
                default: return "语音识别暂时不可用，请再试一次";
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != RECORD_AUDIO_REQUEST || pendingPermissionRequest == null) {
            return;
        }
        PermissionRequest request = pendingPermissionRequest;
        pendingPermissionRequest = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacks(loadTimeout);
        if (voiceBridge != null) {
            voiceBridge.dispose();
            voiceBridge = null;
        }
        if (pendingPermissionRequest != null) {
            pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
