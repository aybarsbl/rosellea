package com.aybarsbl.watch_app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Text
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.service.ServiceController

@Composable
fun PiInfoScreen(onStart: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val pi by AppState.selectedPi.collectAsState()

    val permissions = buildList {
        add(Manifest.permission.BODY_SENSORS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val allGranted = result.values.all { it }
        if (allGranted) {
            pi?.let { p ->
                ServiceController.start(context, p)
                onStart()
            }
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
        Button(
            onClick = {
                val missing = permissions.any {
                    ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
                }
                if (missing) {
                    launcher.launch(permissions)
                } else {
                    pi?.let { p ->
                        ServiceController.start(context, p)
                        onStart()
                    }
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
