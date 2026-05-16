package com.aybarsbl.watch_app.data

import kotlinx.coroutines.flow.MutableStateFlow

// Servis ile UI arasında singleton state. Hilt overkill — bu küçük kapsamda
// `object` + StateFlow yeterli. HrForegroundService bunlara yazar, Compose
// ekranları collectAsStateWithLifecycle ile dinler.
object AppState {
    val selectedPi = MutableStateFlow<PiDevice?>(null)
    val hrBpm = MutableStateFlow(0)
    val onWrist = MutableStateFlow(false)
    val accuracy = MutableStateFlow("UNKNOWN")
    val running = MutableStateFlow(false)
    val lastPostAt = MutableStateFlow(0L)
    val lastPostOk = MutableStateFlow(true)
}
