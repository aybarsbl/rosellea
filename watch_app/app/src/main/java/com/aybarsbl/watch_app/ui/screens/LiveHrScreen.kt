package com.aybarsbl.watch_app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.service.ServiceController

@Composable
fun LiveHrScreen(onStop: () -> Unit) {
    val context = LocalContext.current
    val bpm by AppState.hrBpm.collectAsState()
    val onWrist by AppState.onWrist.collectAsState()
    val pi by AppState.selectedPi.collectAsState()
    val lastOk by AppState.lastPostOk.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        Text(text = pi?.name ?: "")
        Text(
            text = if (bpm > 0) "$bpm" else "--",
            style = MaterialTheme.typography.displayLarge.copy(
                fontWeight = FontWeight.Black,
                fontSize = 64.sp,
            ),
        )
        Text(text = "bpm")
        Text(text = if (onWrist) "Bilekte" else "Bilekte değil")
        Text(text = if (lastOk) "Bağlantı: ok" else "Bağlantı: hata")
        Button(onClick = {
            ServiceController.stop(context)
            onStop()
        }) {
            Text(text = "Durdur")
        }
    }
}
