package expo.modules.emergencyservice

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class ExpoEmergencyServiceModule : Module() {
    companion object {
        @Volatile private var instance: ExpoEmergencyServiceModule? = null

        // Service worker thread'inden çağrılır. Modül kayıtlı değilse no-op.
        fun sendEvent(rawJson: String) {
            val mod = instance ?: return
            try {
                val obj = JSONObject(rawJson)
                val payload = mutableMapOf<String, Any?>()
                val it = obj.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    payload[k] = obj.opt(k)
                }
                mod.sendEvent("onEmergencyEvent", payload)
            } catch (_: Exception) {
                // sessizce yut — bozuk JSON'u UI'ya yansıtmanın anlamı yok
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoEmergencyService")
        Events("onEmergencyEvent")

        OnCreate { instance = this@ExpoEmergencyServiceModule }
        OnDestroy { if (instance === this@ExpoEmergencyServiceModule) instance = null }

        AsyncFunction("start") { host: String, port: Int, robotName: String ->
            val ctx = appContext.reactContext
            if (ctx != null) {
                val intent = Intent(ctx, EmergencyForegroundService::class.java).apply {
                    putExtra(EmergencyForegroundService.EXTRA_HOST, host)
                    putExtra(EmergencyForegroundService.EXTRA_PORT, port)
                    putExtra(EmergencyForegroundService.EXTRA_ROBOT_NAME, robotName)
                }
                ctx.startForegroundService(intent)
            }
        }

        AsyncFunction("stop") {
            val ctx = appContext.reactContext
            if (ctx != null) {
                val intent = Intent(ctx, EmergencyForegroundService::class.java)
                ctx.stopService(intent)
            }
        }

        AsyncFunction("isRunning") {
            EmergencyForegroundService.INSTANCE != null
        }
    }
}
