package com.gt.soundmaster;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static WeakReference<MainActivity> instanceRef;
    private String pendingTrackJson = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instanceRef = new WeakReference<>(this);

        setupWindowAppearance();
        checkAndRequestPermissions();

        WebView webView = getAppWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");
        }

        handleIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (instanceRef != null && instanceRef.get() == this) {
            instanceRef = null;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getPendingRoutePauseSequence() > 0) {
            // Recheck when WebView returns after route loss.
            sendJsCommand(
                "if (typeof window.gtHandleNativeRoutePause === 'function') { " +
                "window.gtHandleNativeRoutePause(); } else { " +
                "window.__gtPendingNativeRoutePause = true; }");
        }
    }

    private int getPendingRoutePauseSequence() {
        android.content.SharedPreferences prefs = getSharedPreferences(
            MediaPlaybackService.ROUTE_PAUSE_PREFS, MODE_PRIVATE);
        int sequence = prefs.getInt(MediaPlaybackService.ROUTE_PAUSE_SEQ, 0);
        int acknowledged = prefs.getInt(MediaPlaybackService.ROUTE_PAUSE_ACK_SEQ, 0);
        return sequence > acknowledged ? sequence : 0;
    }

    public static void sendJsCommandToWebview(String cmd) {
        if (instanceRef != null) {
            MainActivity activity = instanceRef.get();
            if (activity != null) {
                activity.sendJsCommand(cmd);
            }
        }
    }

    public void sendJsCommand(String cmd) {
        runOnUiThread(() -> {
            WebView webView = getAppWebView();
            if (webView != null) {
                webView.evaluateJavascript(cmd, null);
            }
        });
    }

    private void setupWindowAppearance() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF0D0D12);
            getWindow().setNavigationBarColor(0xFF0D0D12);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        // รอให้ DecorView แนบกับระบบเสร็จก่อน แล้วบังคับไอคอน Status Bar เป็นสีขาวสว่างบน ColorOS
        getWindow().getDecorView().post(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                int flags = getWindow().getDecorView().getSystemUiVisibility();
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                getWindow().getDecorView().setSystemUiVisibility(flags);
            }
        });
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            List<String> perms = new ArrayList<>();
            if (checkSelfPermission("android.permission.READ_MEDIA_AUDIO") != PackageManager.PERMISSION_GRANTED) {
                perms.add("android.permission.READ_MEDIA_AUDIO");
            }
            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                perms.add("android.permission.POST_NOTIFICATIONS");
            }
            if (!perms.isEmpty()) {
                requestPermissions(perms.toArray(new String[0]), 101);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.READ_EXTERNAL_STORAGE"}, 101);
            }
        }
    }

    private WebView getAppWebView() {
        Bridge bridge = getBridge();
        return bridge != null ? bridge.getWebView() : null;
    }

    private void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            return;
        }

        Uri uri = intent.getData();
        String fileName = "External Audio";

        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (nameIdx >= 0) {
                        fileName = cursor.getString(nameIdx);
                    }
                }
            } catch (Exception ignored) {}
        } else if (uri.getLastPathSegment() != null) {
            fileName = uri.getLastPathSegment();
        }

        try {
            File cacheDir = new File(getCacheDir(), "incoming_audio");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            File destFile = new File(cacheDir, "current_opened_track.audio");

            try (InputStream in = getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(destFile)) {
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) > 0) {
                    out.write(buf, 0, len);
                }
            }

            String localUrl = "https://localhost/_capacitor_file_" + destFile.getAbsolutePath();
            String cleanName = fileName.replace("\"", "").replace("'", "").replace("\\", "");
            String json = "{\"name\":\"" + cleanName + "\",\"url\":\"" + localUrl + "\"}";

            this.pendingTrackJson = json;
            sendJsCommand("if (typeof window.handleExternalTrack === 'function') { window.handleExternalTrack(" + json + "); }");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void updatePlayback(String title, String artist, boolean isPlaying, double positionSec, double durationSec) {
            Intent serviceIntent = new Intent(MainActivity.this, MediaPlaybackService.class);
            serviceIntent.setAction(MediaPlaybackService.ACTION_UPDATE_PLAYBACK);
            serviceIntent.putExtra(MediaPlaybackService.EXTRA_TITLE, title);
            serviceIntent.putExtra(MediaPlaybackService.EXTRA_ARTIST, artist);
            serviceIntent.putExtra(MediaPlaybackService.EXTRA_IS_PLAYING, isPlaying);
            serviceIntent.putExtra(MediaPlaybackService.EXTRA_POS_SEC, positionSec);
            serviceIntent.putExtra(MediaPlaybackService.EXTRA_DUR_SEC, durationSec);

            try {
                if (isPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void clearPlayback() {
            Intent serviceIntent = new Intent(MainActivity.this, MediaPlaybackService.class);
            serviceIntent.setAction(MediaPlaybackService.ACTION_CLEAR_PLAYBACK);
            startService(serviceIntent);
        }

        @JavascriptInterface
        public int getPendingRoutePauseSequence() {
            return MainActivity.this.getPendingRoutePauseSequence();
        }

        @JavascriptInterface
        public void acknowledgeRoutePause(int sequence) {
            android.content.SharedPreferences prefs = getSharedPreferences(
                MediaPlaybackService.ROUTE_PAUSE_PREFS, MODE_PRIVATE);
            int last = prefs.getInt(MediaPlaybackService.ROUTE_PAUSE_SEQ, 0);
            int acknowledged = prefs.getInt(MediaPlaybackService.ROUTE_PAUSE_ACK_SEQ, 0);
            if (sequence > acknowledged && sequence <= last) {
                // The service clears the latch only after it receives a paused snapshot.
                prefs.edit().putInt(MediaPlaybackService.ROUTE_PAUSE_CONFIRM_SEQ, sequence).commit();
            }
        }

        @JavascriptInterface
        public String getPendingTrack() {
            String data = pendingTrackJson;
            pendingTrackJson = null;
            return data;
        }
    }
}
