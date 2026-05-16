package com.aybarsbl.watch_app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
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
import com.aybarsbl.watch_app.data.PiDevice
import com.aybarsbl.watch_app.health.HeartRateSource
import com.aybarsbl.watch_app.network.RosellaApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Saatte arkaplanda sürekli çalışan foreground service. type=health Android 14+
// üzerinde Health Services'a arkaplan erişim hakkı veriyor; bu sayede ekran
// kapalıyken bile MeasureClient akışı kesilmiyor ve OkHttp POST'ları gidiyor.
class HrForegroundService : LifecycleService() {
    companion object {
        private const val TAG = "HrForegroundService"
        private const val CHANNEL_ID = "rosellea_hr"
        private const val NOTIF_ID = 4711
        const val EXTRA_NAME = "pi_name"
        const val EXTRA_HOST = "pi_host"
        const val EXTRA_PORT = "pi_port"
        private const val POST_INTERVAL_MS = 5_000L
    }

    private var hrJob: Job? = null
    private var postJob: Job? = null

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        startForeground(
            NOTIF_ID,
            buildNotification("Nabız izleniyor"),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
        )
        AppState.running.value = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        intent?.let {
            val name = it.getStringExtra(EXTRA_NAME)
            val host = it.getStringExtra(EXTRA_HOST)
            val port = it.getIntExtra(EXTRA_PORT, 8000)
            if (!host.isNullOrBlank() && !name.isNullOrBlank()) {
                AppState.selectedPi.value = PiDevice(name = name, host = host, port = port)
            }
        }

        if (hrJob == null) startHrCollection()
        if (postJob == null) startPosting()
        return START_STICKY
    }

    private fun startHrCollection() {
        hrJob = lifecycleScope.launch {
            HeartRateSource(this@HrForegroundService).flow().collect { sample ->
                AppState.hrBpm.value = sample.bpm
                AppState.accuracy.value = sample.accuracy
                AppState.onWrist.value = sample.available &&
                    !sample.accuracy.contains("NO_CONTACT", ignoreCase = true)
            }
        }
    }

    private fun startPosting() {
        postJob = lifecycleScope.launch {
            while (isActive) {
                delay(POST_INTERVAL_MS)
                val pi = AppState.selectedPi.value ?: continue
                val ok = runCatching {
                    RosellaApi.postHeartRate(
                        pi = pi,
                        heartRate = AppState.hrBpm.value,
                        onWrist = AppState.onWrist.value,
                        accuracy = AppState.accuracy.value,
                    )
                }.getOrElse {
                    Log.w(TAG, "post failed", it)
                    false
                }
                AppState.lastPostAt.value = System.currentTimeMillis()
                AppState.lastPostOk.value = ok
            }
        }
    }

    override fun onDestroy() {
        hrJob?.cancel(); hrJob = null
        postJob?.cancel(); postJob = null
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
