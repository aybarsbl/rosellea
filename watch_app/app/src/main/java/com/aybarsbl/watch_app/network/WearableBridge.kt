package com.aybarsbl.watch_app.network

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// Saat -> Telefon Bluetooth bridge. Wearable MessageClient kullanır; eşli
// telefon "rosellea_phone" capability'sini advertise ettiği için CapabilityClient
// ile node'u buluyoruz. Wi-Fi gerekmez — saat ekranı kapansa da Bluetooth
// üzerinden çalışmaya devam eder.
object WearableBridge {
    private const val TAG = "WearableBridge"
    private const val CAPABILITY = "rosellea_phone"
    private const val PATH_BPM = "/rosellea/bpm"
    private const val NODE_TTL_MS = 30_000L

    @Volatile private var cachedNodeId: String? = null
    @Volatile private var cachedAt: Long = 0L

    suspend fun sendBpm(
        ctx: Context,
        hr: Int,
        onWrist: Boolean,
        accuracy: String,
    ): Boolean = withContext(Dispatchers.IO) {
        val nodeId = resolveNodeId(ctx) ?: return@withContext false
        val payload = JSONObject().apply {
            put("heart_rate", hr)
            put("on_wrist", onWrist)
            put("accuracy", accuracy)
            put("timestamp", System.currentTimeMillis() / 1000.0)
            put("device_id", Build.MODEL ?: "watch")
        }.toString().toByteArray(Charsets.UTF_8)

        try {
            Tasks.await(
                Wearable.getMessageClient(ctx).sendMessage(nodeId, PATH_BPM, payload),
                5, TimeUnit.SECONDS,
            )
            true
        } catch (e: Throwable) {
            Log.w(TAG, "sendMessage failed: ${e.message}")
            // Node bağlı değil olabilir; cache'i sıfırla ki sonraki çağrı yeniden bulsun.
            cachedNodeId = null
            cachedAt = 0L
            false
        }
    }

    private fun resolveNodeId(ctx: Context): String? {
        val now = System.currentTimeMillis()
        val cached = cachedNodeId
        if (cached != null && (now - cachedAt) < NODE_TTL_MS) return cached
        return try {
            val info = Tasks.await(
                Wearable.getCapabilityClient(ctx)
                    .getCapability(CAPABILITY, CapabilityClient.FILTER_REACHABLE),
                5, TimeUnit.SECONDS,
            )
            val node = info.nodes.firstOrNull { it.isNearby }
                ?: info.nodes.firstOrNull()
            if (node == null) {
                Log.w(TAG, "no node advertises capability $CAPABILITY")
                null
            } else {
                cachedNodeId = node.id
                cachedAt = now
                node.id
            }
        } catch (e: Throwable) {
            Log.w(TAG, "capability lookup failed: ${e.message}")
            null
        }
    }
}
