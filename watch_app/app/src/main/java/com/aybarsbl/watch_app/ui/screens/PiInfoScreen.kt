package com.aybarsbl.watch_app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Text
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.service.ServiceController

private const val TAG = "PiInfoScreen"

@Composable
fun PiInfoScreen(onStart: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val pi by AppState.selectedPi.collectAsState()
    var status by remember { mutableStateOf("") }

    // API 35+ üzerinde BODY_SENSORS deprecate edildi ve runtime dialog üretmiyor.
    // Yeni granular izin: android.permission.health.READ_HEART_RATE.
    // Manifest.permission sabiti henüz mevcut değil, string olarak veriyoruz.
    // POST_NOTIFICATIONS olmadan foreground notification görünmez ama servis çalışır.
    val readHeartRate = "android.permission.health.READ_HEART_RATE"
    val permissions = buildList {
        add(readHeartRate)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    fun tryStartService() {
        val p = pi
        if (p == null) {
            status = "Cihaz seçilmedi"
            return
        }
        try {
            ServiceController.start(context, p)
            status = "Başlatılıyor..."
            onStart()
        } catch (e: Throwable) {
            Log.e(TAG, "service start failed", e)
            status = "Hata: ${e.message ?: e.javaClass.simpleName}"
        }
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val hrGranted = result[readHeartRate] == true ||
            ContextCompat.checkSelfPermission(context, readHeartRate) ==
            PackageManager.PERMISSION_GRANTED
        if (hrGranted) {
            tryStartService()
        } else {
            status = "Nabız izni reddedildi. Ayarlar → Uygulamalar → watch_app → İzinler'den ver."
            Log.w(TAG, "READ_HEART_RATE denied; result=$result")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        Text(text = pi?.name ?: "Cihaz seçili değil")
        Text(text = pi?.let { "${it.host}:${it.port}" } ?: "")
        if (status.isNotBlank()) {
            Text(text = status)
        }
        Button(
            onClick = {
                val missing = permissions.any {
                    ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
                }
                if (missing) {
                    status = "İzin isteniyor..."
                    launcher.launch(permissions)
                } else {
                    tryStartService()
                }
            },
            enabled = pi != null,
        ) {
            Text(text = "Başlat")
        }
        Button(onClick = onBack) {
            Text(text = "Geri")
        }
    }
}
