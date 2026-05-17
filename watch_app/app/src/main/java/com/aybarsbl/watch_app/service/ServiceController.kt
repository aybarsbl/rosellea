package com.aybarsbl.watch_app.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

object ServiceController {
    fun start(context: Context) {
        val intent = Intent(context, HrForegroundService::class.java)
        ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
        val intent = Intent(context, HrForegroundService::class.java)
        context.stopService(intent)
    }
}
