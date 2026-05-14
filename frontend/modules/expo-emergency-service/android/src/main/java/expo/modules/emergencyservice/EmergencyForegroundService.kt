package expo.modules.emergencyservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class EmergencyForegroundService : Service() {
    companion object {
        const val CHANNEL_MONITOR = "rosellea_monitor"
        const val CHANNEL_ALERT = "rosellea_alert"
        const val NOTIF_ID_MONITOR = 1101
        const val NOTIF_ID_ALERT = 1102
        const val EXTRA_HOST = "host"
        const val EXTRA_PORT = "port"
        const val EXTRA_ROBOT_NAME = "robot_name"

        @Volatile var INSTANCE: EmergencyForegroundService? = null
    }

    private var host: String = ""
    private var port: Int = 8000
    private var robotName: String = ""
    private var client: OkHttpClient? = null
    private var eventSource: EventSource? = null
    private var stopped = false
    private var reconnectAttempts = 0
    private val reconnectHandler = android.os.Handler(android.os.Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        INSTANCE = this
        createChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        host = intent?.getStringExtra(EXTRA_HOST) ?: host
        port = intent?.getIntExtra(EXTRA_PORT, port) ?: port
        robotName = intent?.getStringExtra(EXTRA_ROBOT_NAME) ?: robotName

        startMonitorForeground()

        // Servis tekrar tetiklenirse mevcut bağlantıyı düşürüp yenisini kur.
        eventSource?.cancel()
        eventSource = null
        stopped = false
        reconnectAttempts = 0
        connect()

        return START_STICKY
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val monitor = NotificationChannel(
            CHANNEL_MONITOR,
            "Rosellea güvenlik izleyici",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Robot ile sürekli bağlantı bildirimini gösterir."
            setShowBadge(false)
        }
        val alert = NotificationChannel(
            CHANNEL_ALERT,
            "Rosellea acil durum",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Yangın/duman algılandığında bildirim."
            enableLights(true)
            enableVibration(true)
        }
        nm.createNotificationChannel(monitor)
        nm.createNotificationChannel(alert)
    }

    private fun monitorNotification(text: String): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        }
        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pi = if (launch != null) {
            PendingIntent.getActivity(this, 0, launch, piFlags)
        } else null

        return NotificationCompat.Builder(this, CHANNEL_MONITOR)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle(
                if (robotName.isNotBlank()) "Rosellea güvenlik izleyici — $robotName"
                else "Rosellea güvenlik izleyici"
            )
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pi)
            .build()
    }

    private fun startMonitorForeground() {
        val notification = monitorNotification("Robotu dinleniyor...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this,
                NOTIF_ID_MONITOR,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIF_ID_MONITOR, notification)
        }
    }

    private fun updateMonitor(text: String) {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm?.notify(NOTIF_ID_MONITOR, monitorNotification(text))
        } catch (_: Exception) {}
    }

    private fun fireAlertNotification(title: String, body: String) {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pi = if (launch != null) {
            PendingIntent.getActivity(this, 1, launch, piFlags)
        } else null

        // Activity'i de zorla öne çıkar
        if (launch != null) {
            try { startActivity(launch) } catch (_: Exception) {}
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
        if (pi != null) {
            builder.setContentIntent(pi)
            builder.setFullScreenIntent(pi, true)
        }

        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm?.notify(NOTIF_ID_ALERT, builder.build())
        } catch (_: Exception) {}
    }

    private fun buildClient(): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            // SSE: read sonsuz, server heartbeat'i 15 saniyede bir gönderiyor.
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

    private fun connect() {
        if (stopped) return
        val c = client ?: buildClient().also { client = it }
        val request = Request.Builder()
            .url("http://$host:$port/events")
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .build()

        val factory = EventSources.createFactory(c)
        eventSource = factory.newEventSource(request, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) {
                reconnectAttempts = 0
                updateMonitor("Bağlı — $host")
                emit("{\"type\":\"connection.open\"}")
            }

            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String,
            ) {
                emit(data)
                // armed durumunda yüksek öncelikli notification
                try {
                    val json = JSONObject(data)
                    when (json.optString("type")) {
                        "emergency.armed" -> {
                            fireAlertNotification(
                                "ACİL DURUM",
                                "Rosellea duman algıladı. Lütfen kontrol edin veya iptal edin.",
                            )
                        }
                        "emergency.fired" -> {
                            updateMonitor("Acil durum tetiklendi — SMS gönderiliyor")
                        }
                        "emergency.cancelled" -> {
                            updateMonitor("Bağlı — $host")
                        }
                        "emergency.sent" -> {
                            updateMonitor("Bağlı — $host")
                        }
                    }
                } catch (_: Exception) {}
            }

            override fun onClosed(eventSource: EventSource) {
                if (!stopped) {
                    scheduleReconnect()
                }
            }

            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: Response?,
            ) {
                emit("{\"type\":\"connection.lost\"}")
                updateMonitor("Yeniden bağlanıyor...")
                if (!stopped) scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        reconnectAttempts += 1
        val delayMs = when {
            reconnectAttempts <= 1 -> 1000L
            reconnectAttempts == 2 -> 2000L
            reconnectAttempts == 3 -> 4000L
            reconnectAttempts == 4 -> 8000L
            else -> 30000L
        }
        reconnectHandler.removeCallbacksAndMessages(null)
        reconnectHandler.postDelayed({
            if (!stopped) connect()
        }, delayMs)
    }

    private fun emit(rawJson: String) {
        try {
            ExpoEmergencyServiceModule.sendEvent(rawJson)
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        stopped = true
        reconnectHandler.removeCallbacksAndMessages(null)
        try { eventSource?.cancel() } catch (_: Exception) {}
        eventSource = null
        INSTANCE = null
        super.onDestroy()
    }
}
