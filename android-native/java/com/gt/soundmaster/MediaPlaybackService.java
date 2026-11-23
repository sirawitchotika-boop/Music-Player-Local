package com.gt.soundmaster;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

public class MediaPlaybackService extends Service {
    public static final String CHANNEL_ID = "gt_soundmaster_playback";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_UPDATE_PLAYBACK = "com.gt.soundmaster.UPDATE_PLAYBACK";
    public static final String ACTION_CLEAR_PLAYBACK = "com.gt.soundmaster.CLEAR_PLAYBACK";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "is_playing";
    public static final String EXTRA_POS_SEC = "pos_sec";
    public static final String EXTRA_DUR_SEC = "dur_sec";

    // A route-loss pause must survive a temporarily unavailable WebView.
    public static final String ROUTE_PAUSE_PREFS = "gt_soundmaster_media";
    public static final String ROUTE_PAUSE_SEQ = "route_pause_seq";
    public static final String ROUTE_PAUSE_ACK_SEQ = "route_pause_ack_seq";
    public static final String ROUTE_PAUSE_CONFIRM_SEQ = "route_pause_confirm_seq";

    private MediaSession mediaSession;
    private NotificationManager notificationManager;
    private PowerManager.WakeLock wakeLock;
    private boolean isForeground = false;
    private String lastTitle = "GT Track";
    private String lastArtist = "GT SoundMaster";
    private double lastDurSec = 0.0;

    private final BroadcastReceiver mediaReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (action != null) {
                if (android.media.AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(action)) {
                    markPendingRoutePause();
                    pauseNativeState();
                    MainActivity.sendJsCommandToWebview(
                        "if (typeof window.gtHandleNativeRoutePause === 'function') { " +
                        "window.gtHandleNativeRoutePause(); } else { " +
                        "window.__gtPendingNativeRoutePause = true; }");
                    return;
                }
                final String cmd;
                if (action.endsWith(".PREV")) cmd = "window.mediaControlAction('prev');";
                else if (action.endsWith(".PLAYPAUSE")) cmd = "window.mediaControlAction('playpause');";
                else if (action.endsWith(".NEXT")) cmd = "window.mediaControlAction('next');";
                else cmd = null;

                if (cmd != null) {
                    MainActivity.sendJsCommandToWebview(cmd);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        setupMediaSession();
        registerMediaReceiver();

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GTSoundMaster::PlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_UPDATE_PLAYBACK.equals(action)) {
                String title = intent.getStringExtra(EXTRA_TITLE);
                if (title == null) title = "GT Track";
                String artist = intent.getStringExtra(EXTRA_ARTIST);
                if (artist == null) artist = "GT SoundMaster";
                boolean isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
                if (hasPendingRoutePause()) {
                    android.content.SharedPreferences prefs =
                        getSharedPreferences(ROUTE_PAUSE_PREFS, MODE_PRIVATE);
                    int pending = prefs.getInt(ROUTE_PAUSE_SEQ, 0);
                    int confirmed = prefs.getInt(ROUTE_PAUSE_CONFIRM_SEQ, 0);
                    if (!isPlaying && confirmed >= pending) {
                        // Only a confirmed paused WebView snapshot clears the latch.
                        prefs.edit().putInt(ROUTE_PAUSE_ACK_SEQ, pending).commit();
                    } else if (isPlaying) {
                        // Ignore any in-flight pre-disconnect Play snapshot.
                        isPlaying = false;
                    }
                }
                double posSec = intent.getDoubleExtra(EXTRA_POS_SEC, 0.0);
                double durSec = intent.getDoubleExtra(EXTRA_DUR_SEC, 0.0);
                handlePlaybackUpdate(title, artist, isPlaying, posSec, durSec);
            } else if (ACTION_CLEAR_PLAYBACK.equals(action)) {
                handleClear();
            }
        }
        return START_NOT_STICKY;
    }

    private void handlePlaybackUpdate(String title, String artist, boolean isPlaying, double posSec, double durSec) {
        if (notificationManager == null || mediaSession == null) return;
        lastTitle = title;
        lastArtist = artist;
        lastDurSec = durSec;

        long posMs = (long) (Math.max(0, posSec) * 1000);
        long durMs = (long) (Math.max(0, durSec) * 1000);
        if (durMs <= 0) durMs = 1;
        if (posMs > durMs) posMs = durMs;

        long playbackActions = PlaybackState.ACTION_PLAY
            | PlaybackState.ACTION_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS
            | PlaybackState.ACTION_SEEK_TO;

        PlaybackState state = new PlaybackState.Builder()
            .setActions(playbackActions)
            .setState(
                isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                posMs,
                isPlaying ? 1.0f : 0.0f,
                SystemClock.elapsedRealtime()
            )
            .build();
        mediaSession.setPlaybackState(state);

        MediaMetadata metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durMs)
            .build();
        mediaSession.setMetadata(metadata);

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setAction(Intent.ACTION_MAIN);
        openAppIntent.addCategory(Intent.CATEGORY_LAUNCHER);

        int appFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) appFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentPendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, appFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Icon iconPrev = Icon.createWithResource(this, android.R.drawable.ic_media_previous);
        Icon iconPlay = Icon.createWithResource(this, isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        Icon iconNext = Icon.createWithResource(this, android.R.drawable.ic_media_next);

        Notification.Action prevAction = new Notification.Action.Builder(
            iconPrev, "Previous",
            getBroadcastPendingIntent("com.gt.soundmaster.PREV", 1)
        ).build();

        Notification.Action playPauseAction = new Notification.Action.Builder(
            iconPlay, isPlaying ? "Pause" : "Play",
            getBroadcastPendingIntent("com.gt.soundmaster.PLAYPAUSE", 2)
        ).build();

        Notification.Action nextAction = new Notification.Action.Builder(
            iconNext, "Next",
            getBroadcastPendingIntent("com.gt.soundmaster.NEXT", 3)
        ).build();

        int smallIconId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (smallIconId != 0) {
            builder.setSmallIcon(smallIconId);
        } else {
            builder.setSmallIcon(android.R.drawable.ic_media_play);
        }

        builder.setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentPendingIntent)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        try {
            int largeIconId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
            if (largeIconId != 0) {
                Bitmap largeIcon = BitmapFactory.decodeResource(getResources(), largeIconId);
                if (largeIcon != null) {
                    builder.setLargeIcon(largeIcon);
                }
            }
        } catch (Exception ignored) {}

        Notification notification = builder.build();

        if (isPlaying) {
            if (wakeLock != null && !wakeLock.isHeld()) {
                try { wakeLock.acquire(12 * 60 * 60 * 1000L); } catch (Exception ignored) {}
            }
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            isForeground = true;
        } else {
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch (Exception ignored) {}
            }
            if (isForeground) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_DETACH);
                } else {
                    stopForeground(false);
                }
                isForeground = false;
            }
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void handleClear() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        isForeground = false;
        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
        stopSelf();
    }

    private PendingIntent getBroadcastPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(this, requestCode, intent, flags);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "GT SoundMaster Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Music playback foreground service");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void setupMediaSession() {
        mediaSession = new MediaSession(this, "GT_SoundMaster_Session");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                MainActivity.sendJsCommandToWebview("window.mediaControlAction('play');");
            }
            @Override
            public void onPause() {
                MainActivity.sendJsCommandToWebview("window.mediaControlAction('pause');");
            }
            @Override
            public void onSkipToNext() {
                MainActivity.sendJsCommandToWebview("window.mediaControlAction('next');");
            }
            @Override
            public void onSkipToPrevious() {
                MainActivity.sendJsCommandToWebview("window.mediaControlAction('prev');");
            }
            @Override
            public void onSeekTo(long pos) {
                double sec = Math.max(0, pos / 1000.0);
                MainActivity.sendJsCommandToWebview("window.mediaControlAction('seekto', " + sec + ");");
            }
        });
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);
    }

    private boolean hasPendingRoutePause() {
        android.content.SharedPreferences prefs = getSharedPreferences(ROUTE_PAUSE_PREFS, MODE_PRIVATE);
        return prefs.getInt(ROUTE_PAUSE_SEQ, 0) > prefs.getInt(ROUTE_PAUSE_ACK_SEQ, 0);
    }

    private void markPendingRoutePause() {
        android.content.SharedPreferences prefs = getSharedPreferences(ROUTE_PAUSE_PREFS, MODE_PRIVATE);
        int next = prefs.getInt(ROUTE_PAUSE_SEQ, 0) + 1;
        // Commit before reporting the pause to the WebView.
        prefs.edit().putInt(ROUTE_PAUSE_SEQ, next).commit();
    }

    private void pauseNativeState() {
        if (mediaSession == null) return;
        long posMs = 0;
        PlaybackState cur = mediaSession.getController().getPlaybackState();
        if (cur != null) {
            posMs = cur.getPosition();
            if (cur.getState() == PlaybackState.STATE_PLAYING) {
                posMs += (long) ((SystemClock.elapsedRealtime() - cur.getLastPositionUpdateTime()) * cur.getPlaybackSpeed());
            }
        }
        handlePlaybackUpdate(lastTitle, lastArtist, false, posMs / 1000.0, lastDurSec);
    }

    private void registerMediaReceiver() {
        IntentFilter filter = new IntentFilter();
        filter.addAction("com.gt.soundmaster.PREV");
        filter.addAction("com.gt.soundmaster.PLAYPAUSE");
        filter.addAction("com.gt.soundmaster.NEXT");
        filter.addAction(android.media.AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(mediaReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaReceiver, filter);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(mediaReceiver); } catch (Exception ignored) {}
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
