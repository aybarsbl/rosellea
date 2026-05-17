package com.aybarsbl.watch_app.system

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

// Wear OS 6 / One UI Watch'ta foreground service tipi=health bile olsa
// "Sleeping apps" listesindeki uygulamayı sistem uyutabiliyor; bu da
// WifiLock'u serbest bırakıp Wi-Fi bağlantısını kesiyor. Muafiyet diyalogu
// kullanıcının onayını alıp uygulamayı whitelist'e ekliyor.
object BatteryOptimization {
    private const val TAG = "BatteryOpt"

    fun isIgnoringOptimizations(context: Context): Boolean {
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(context.packageName)
        } catch (e: Throwable) {
            Log.w(TAG, "isIgnoringBatteryOptimizations failed", e)
            false
        }
    }

    fun requestExemption(context: Context) {
        // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS doğrudan sistem
        // diyaloğunu açar; package URI olmadan Settings ekranına düşer.
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Throwable) {
            Log.w(TAG, "requestExemption intent failed, falling back to settings", e)
            try {
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(fallback)
            } catch (e2: Throwable) {
                Log.e(TAG, "fallback settings intent failed", e2)
            }
        }
    }
}
