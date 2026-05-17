package com.aybarsbl.watch_app.network

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// Saat -> Telefon Bluetooth bridge. Saat ve telefon AYNI applicationId
// ("com.aybarsbl.frontend") taşıdığı için Wear OS Data Layer framework
// mesajları otomatik route ediyor: NodeClient.getConnectedNodes() telefon
// node'unu döndürür, sendMessage çağrısı eşli telefondaki frontend app'inin
// WatchBridgeListenerService'ine teslim edilir.
object WearableBridge {
    private const val TAG = "WearableBridge"
    private const val PATH_BPM = "/rosellea/bpm"
    private const val NODE_TTL_MS = 30_000L

    @Volatile private var cachedNodes: List<String> = emptyList()
    @Volatile private var cachedAt: Long = 0L

    suspend fun sendBpm(
        ctx: Context,
        hr: Int,
        onWrist: Boolean,
        accuracy: String,
    ): Boolean = withContext(Dispatchers.IO) {
        val nodes = resolveNodes(ctx)
        if (nodes.isEmpty()) {
            Log.w(TAG, "no connected nodes; phone not paired?")
            return@withContext false
        }
        val payload = JSONObject().apply {
            put("heart_rate", hr)
            put("on_wrist", onWrist)
            put("accuracy", accuracy)
            put("timestamp", System.currentTimeMillis() / 1000.0)
            put("device_id", Build.MODEL ?: "watch")
        }.toString().toByteArray(Charsets.UTF_8)

        var anyOk = false
        val client = Wearable.getMessageClient(ctx)
        for (nodeId in nodes) {
            try {
                Tasks.await(
                    client.sendMessage(nodeId, PATH_BPM, payload),
                    5, TimeUnit.SECONDS,
                )
                Log.d(TAG, "sent to node=$nodeId hr=$hr")
                anyOk = true
            } catch (e: Throwable) {
                Log.w(TAG, "sendMessage node=$nodeId failed: ${e.message}")
            }
        }
        if (!anyOk) {
            cachedNodes = emptyList()
            cachedAt = 0L
        }
        anyOk
    }

    private fun resolveNodes(ctx: Context): List<String> {
        val now = System.currentTimeMillis()
        val cached = cachedNodes
        if (cached.isNotEmpty() && (now - cachedAt) < NODE_TTL_MS) return cached
        return try {
            val nodes: List<Node> = Tasks.await(
                Wearable.getNodeClient(ctx).connectedNodes,
                5, TimeUnit.SECONDS,
            )
            val ids = nodes.map { it.id }
            Log.d(TAG, "connected nodes: ${nodes.joinToString { "${it.displayName}(${it.id}, nearby=${it.isNearby})" }}")
            cachedNodes = ids
            cachedAt = now
            ids
        } catch (e: Throwable) {
            Log.w(TAG, "node lookup failed: ${e.message}")
            emptyList()
        }
    }
}
