package expo.modules.watchbridge

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class ExpoWatchBridgeModule : Module() {
    companion object {
        const val TAG = "ExpoWatchBridge"
        const val CAPABILITY = "rosellea_phone"
        const val PREFS_NAME = "rosellea_bridge"
        const val KEY_TARGETS = "targets"
        const val KEY_PORT = "port"

        @Volatile private var instance: ExpoWatchBridgeModule? = null

        // WatchBridgeListenerService background thread'inden çağırır.
        // Modül kayıtlı değilse (app öldü ama servis canlı) no-op.
        fun sendBpmEvent(rawJson: String) {
            val mod = instance ?: return
            try {
                val obj = JSONObject(rawJson)
                val payload = mutableMapOf<String, Any?>()
                val it = obj.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    payload[k] = obj.opt(k)
                }
                mod.sendEvent("onBpm", payload)
            } catch (_: Exception) {
            }
        }

        fun readTargets(ctx: Context): Pair<List<String>, Int> {
            val sp = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val csv = sp.getString(KEY_TARGETS, "") ?: ""
            val port = sp.getInt(KEY_PORT, 8000)
            val hosts = csv.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            return hosts to port
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoWatchBridge")
        Events("onBpm")

        OnCreate {
            instance = this@ExpoWatchBridgeModule
            // Capability'i runtime'da advertise et. wearable_capabilities.xml de
            // var ama Expo prebuild/resource merging her zaman dahil etmeyebiliyor.
            // Bu çağrı UID'ye bağlı, bir kez advertise edildi mi system tutuyor.
            val ctx = appContext.reactContext
            if (ctx != null) {
                try {
                    Wearable.getCapabilityClient(ctx)
                        .addLocalCapability(CAPABILITY)
                        .addOnSuccessListener { Log.i(TAG, "advertised capability $CAPABILITY") }
                        .addOnFailureListener { Log.w(TAG, "advertise capability failed: ${it.message}") }
                } catch (e: Throwable) {
                    Log.w(TAG, "addLocalCapability threw: ${e.message}")
                }
            }
        }
        OnDestroy { if (instance === this@ExpoWatchBridgeModule) instance = null }

        AsyncFunction("setTargets") { hosts: List<String>, port: Int ->
            val ctx = appContext.reactContext ?: return@AsyncFunction
            val sp = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            sp.edit()
                .putString(KEY_TARGETS, hosts.joinToString(","))
                .putInt(KEY_PORT, port)
                .apply()
        }

        AsyncFunction("getTargets") {
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<String>()
            readTargets(ctx).first
        }
    }
}
