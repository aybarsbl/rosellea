package com.aybarsbl.watch_app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.presentation.theme.RoselleaAccent
import com.aybarsbl.watch_app.presentation.theme.RoselleaBgDeep
import com.aybarsbl.watch_app.presentation.theme.RoselleaDanger
import com.aybarsbl.watch_app.presentation.theme.RoselleaHeart
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.focus.FocusRequester
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import com.aybarsbl.watch_app.presentation.theme.RoselleaTextPrimary
import com.aybarsbl.watch_app.presentation.theme.RoselleaTextSecondary
import com.aybarsbl.watch_app.service.ServiceController

private const val TAG = "MeasureScreen"
private const val READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"

@Composable
fun MeasureScreen() {
    val context = LocalContext.current
    val bpm by AppState.hrBpm.collectAsState()
    val running by AppState.running.collectAsState()
    val lastHrAt by AppState.lastHrUpdateAt.collectAsState()
    var statusMsg by remember { mutableStateOf("") }
    val now = remember { mutableStateOf(System.currentTimeMillis()) }
    androidx.compose.runtime.LaunchedEffect(running) {
        while (running) {
            now.value = System.currentTimeMillis()
            kotlinx.coroutines.delay(1_000)
        }
    }
    val isStale = lastHrAt == 0L || (now.value - lastHrAt) > 10_000L

    val permissions = remember {
        buildList {
            add(READ_HEART_RATE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }.toTypedArray()
    }

    fun startService() {
        try {
            ServiceController.start(context)
            statusMsg = ""
        } catch (e: Throwable) {
            Log.e(TAG, "start failed", e)
            statusMsg = "Hata: ${e.message ?: e.javaClass.simpleName}"
        }
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val granted = result[READ_HEART_RATE] == true ||
            ContextCompat.checkSelfPermission(context, READ_HEART_RATE) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) {
            startService()
        } else {
            statusMsg = "Nabız izni reddedildi"
            Log.w(TAG, "READ_HEART_RATE denied")
        }
    }

    // Kalp pulse animasyonu (running iken hafifçe büyüyüp küçülür).
    val infinite = rememberInfiniteTransition(label = "heart")
    val pulse by infinite.animateFloat(
        initialValue = if (running) 0.92f else 1f,
        targetValue = if (running) 1.08f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 600),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "heartPulse",
    )

    val scrollState = rememberScrollState()
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    ScreenScaffold(
        scrollState = scrollState,
        modifier = Modifier
            .fillMaxSize()
            .background(RoselleaBgDeep),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 28.dp, end = 28.dp, top = 40.dp, bottom = 24.dp)
                .rotaryScrollable(
                    behavior = RotaryScrollableDefaults.behavior(
                        scrollableState = scrollState,
                    ),
                    focusRequester = focusRequester,
                )
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "Rosellea",
                color = RoselleaTextPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
            )

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = "♥",
                    color = RoselleaHeart,
                    fontSize = 28.sp,
                    modifier = Modifier.scale(pulse),
                )
                Text(
                    text = if (running && bpm > 0 && !isStale) "$bpm" else "--",
                    color = RoselleaTextPrimary,
                    fontSize = 44.sp,
                    fontWeight = FontWeight.Black,
                )
                if (statusMsg.isNotBlank()) {
                    Text(
                        text = statusMsg,
                        color = RoselleaTextSecondary,
                        fontSize = 10.sp,
                    )
                }
            }

            Button(
                onClick = {
                    if (running) {
                        ServiceController.stop(context)
                    } else {
                        val missing = permissions.any {
                            ContextCompat.checkSelfPermission(context, it) !=
                                PackageManager.PERMISSION_GRANTED
                        }
                        if (missing) {
                            launcher.launch(permissions)
                        } else {
                            startService()
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (running) RoselleaDanger else RoselleaAccent,
                    contentColor = RoselleaTextPrimary,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = if (running) "Durdur" else "Başlat",
                    fontWeight = FontWeight.SemiBold,
                )
            }

            // Yuvarlak ekran alt kenarında butonun kesilmemesi için ek boşluk.
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}
