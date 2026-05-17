package com.aybarsbl.watch_app.data

import kotlinx.coroutines.flow.MutableStateFlow

// Servis ile UI arasında singleton state. Hilt overkill — bu küçük kapsamda
// `object` + StateFlow yeterli. HrForegroundService bunlara yazar, Compose
// ekranları collectAsStateWithLifecycle ile dinler.
object AppState {
    val hrBpm = MutableStateFlow(0)
    val onWrist = MutableStateFlow(false)
    val accuracy = MutableStateFlow("UNKNOWN")
    val running = MutableStateFlow(false)
    val lastSendAt = MutableStateFlow(0L)
    val lastSendOk = MutableStateFlow(true)
    // ExerciseClient'tan son geçerli HR sample alınma zamanı. Stale tespitinde
    // kullanılır: send loop ve UI bu değere bakıp eski örneği zombi göstermez.
    val lastHrUpdateAt = MutableStateFlow(0L)
    val exerciseState = MutableStateFlow("UNKNOWN")
}
