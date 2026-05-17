package expo.modules.watchbridge

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

// Saatten gelen Wearable Data Layer mesajlarını dinler. Servis OS tarafından
// mesaj geldiğinde spawn edilir; app foreground'da olmasa bile çalışır.
class WatchBridgeListenerService : WearableListenerService() {

    companion object {
        private const val TAG = "WatchBridgeListener"
        private const val PATH_BPM = "/rosellea/bpm"
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(1500, TimeUnit.MILLISECONDS)
            .readTimeout(2000, TimeUnit.MILLISECONDS)
            .writeTimeout(2000, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != PATH_BPM) {
            super.onMessageReceived(event)
            return
        }

        val raw = try {
            String(event.data, Charsets.UTF_8)
        } catch (e: Throwable) {
            Log.w(TAG, "decode failed", e)
            return
        }

        ExpoWatchBridgeModule.sendBpmEvent(raw)

        val (hosts, port) = ExpoWatchBridgeModule.readTargets(applicationContext)
        if (hosts.isEmpty()) {
            Log.d(TAG, "no targets configured; bpm dropped")
            return
        }

        val body = raw.toRequestBody(jsonMedia)
        hosts.forEach { host ->
            try {
                val req = Request.Builder()
                    .url("http://$host:$port/vitals/heart_rate")
                    .post(body)
                    .build()
                client.newCall(req).execute().use { resp ->
                    Log.d(TAG, "forward host=$host ok=${resp.isSuccessful} code=${resp.code}")
                }
            } catch (e: Throwable) {
                Log.w(TAG, "forward host=$host failed: ${e.message}")
            }
        }
    }
}
