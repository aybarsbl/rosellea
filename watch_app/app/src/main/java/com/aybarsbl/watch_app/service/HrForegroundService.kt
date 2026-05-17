package com.aybarsbl.watch_app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.aybarsbl.watch_app.R
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.health.HeartRateSource
import com.aybarsbl.watch_app.network.WearableBridge
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Saatte arkaplanda sürekli çalışan foreground service. type=health Android 14+
// üzerinde Health Services'a arkaplan erişim hakkı veriyor; sensor akışı ekran
// kapalıyken bile kesilmiyor. BPM artık doğrudan HTTP ile gönderilmiyor —
// WearableBridge üzerinden eşli telefona iletilir, telefon Pi'ye forward eder.
class HrForegroundService : LifecycleService() {
    companion object {
        private const val TAG = "HrForegroundService"
        private const val CHANNEL_ID = "rosellea_hr"
        private const val NOTIF_ID = 4711
        private const val SEND_INTERVAL_MS = 5_000L
    }

    private var hrJob: Job? = null
    private var sendJob: Job? = null

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        try {
            startForeground(
                NOTIF_ID,
                buildNotification("Nabız izleniyor"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
            )
            Log.d(TAG, "foreground service started (type=health)")
        } catch (e: Throwable) {
            Log.e(TAG, "startForeground failed", e)
        }
        AppState.running.value = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (hrJob == null) startHrCollection()
        if (sendJob == null) startSending()
        return START_STICKY
    }

    private fun startHrCollection() {
        hrJob = lifecycleScope.launch {
            try {
                HeartRateSource(this@HrForegroundService).flow().collect { sample ->
                    Log.v(TAG, "hr=${sample.bpm} acc=${sample.accuracy} avail=${sample.available}")
                    AppState.hrBpm.value = sample.bpm
                    AppState.accuracy.value = sample.accuracy
                    AppState.onWrist.value = sample.available &&
                        !sample.accuracy.contains("NO_CONTACT", ignoreCase = true)
                }
            } catch (e: Throwable) {
                Log.e(TAG, "HR collection error", e)
            }
        }
    }

    private fun startSending() {
        sendJob = lifecycleScope.launch {
            while (isActive) {
                delay(SEND_INTERVAL_MS)
                val ok = runCatching {
                    WearableBridge.sendBpm(
                        ctx = applicationContext,
                        hr = AppState.hrBpm.value,
                        onWrist = AppState.onWrist.value,
                        accuracy = AppState.accuracy.value,
                    )
                }.getOrElse {
                    Log.w(TAG, "bridge send failed", it)
                    false
                }
                AppState.lastSendAt.value = System.currentTimeMillis()
                AppState.lastSendOk.value = ok
                Log.d(TAG, "bridge hr=${AppState.hrBpm.value} on_wrist=${AppState.onWrist.value} ok=$ok")
            }
        }
    }

    override fun onDestroy() {
        hrJob?.cancel(); hrJob = null
        sendJob?.cancel(); sendJob = null
        AppState.running.value = false
        super.onDestroy()
    }

    private fun ensureChannel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Rosellea Nabız",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Saat nabız akışını arkaplanda yönetir"
                setShowBadge(false)
            }
            nm.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Rosellea")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
