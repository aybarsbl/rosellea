package com.aybarsbl.watch_app.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.data.PiDevice

object ServiceController {
    fun start(context: Context, pi: PiDevice) {
        AppState.selectedPi.value = pi
        val intent = Intent(context, HrForegroundService::class.java).apply {
            putExtra(HrForegroundService.EXTRA_NAME, pi.name)
            putExtra(HrForegroundService.EXTRA_HOST, pi.host)
            putExtra(HrForegroundService.EXTRA_PORT, pi.port)
        }
        ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
        val intent = Intent(context, HrForegroundService::class.java)
        context.stopService(intent)
    }
}
