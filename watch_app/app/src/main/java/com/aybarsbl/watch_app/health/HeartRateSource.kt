package com.aybarsbl.watch_app.health

import android.content.Context
import android.util.Log
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

data class HrSample(
    val bpm: Int,
    val accuracy: String,
    val available: Boolean,
)

// Wear OS'ta ekran kapalıyken sürekli HR alabilmenin tek desteklenen yolu
// ExerciseClient üzerinden bir egzersiz oturumu açmaktır. MeasureClient yalnız
// "active engagement" (kullanıcı app'i izliyor) senaryoları için tasarlanmış;
// foreground service type=health bile olsa Health Services screen-off'ta
// MeasureClient akışını duraklatıyor — gözlemlenen "ekran kararınca veri
// duruyor" davranışı tam olarak bu. ExerciseClient ise always-on bir oturum
// sözleşmesi olduğundan sensör akışı kesintisiz gelir. WORKOUT generic tipini
// seçiyoruz; sadece HEART_RATE_BPM data type'ı istiyoruz, GPS ve auto-pause
// kapalı.
class HeartRateSource(private val context: Context) {
    companion object {
        private const val TAG = "HeartRateSource"
    }

    fun flow(): Flow<HrSample> = callbackFlow {
        val client = HealthServices.getClient(context).exerciseClient

        val callback = object : ExerciseUpdateCallback {
            override fun onRegistered() {
                Log.d(TAG, "exercise callback registered")
            }

            override fun onRegistrationFailed(throwable: Throwable) {
                Log.e(TAG, "exercise callback registration failed", throwable)
            }

            override fun onAvailabilityChanged(
                dataType: DataType<*, *>,
                availability: Availability,
            ) {
                Log.d(TAG, "availability ${dataType.name}: $availability")
                if (availability is DataTypeAvailability &&
                    availability != DataTypeAvailability.AVAILABLE &&
                    availability != DataTypeAvailability.ACQUIRING
                ) {
                    trySend(HrSample(bpm = 0, accuracy = "UNAVAILABLE", available = false))
                }
            }

            override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                val samples = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                for (sample in samples) {
                    val bpm = sample.value.toInt()
                    val accuracyName = sample.accuracy?.toString() ?: "UNKNOWN"
                    trySend(HrSample(bpm = bpm, accuracy = accuracyName, available = true))
                }
            }

            override fun onLapSummaryReceived(summary: ExerciseLapSummary) {}
        }

        // setUpdateCallback startExerciseAsync'ten ÖNCE çağrılmalı, yoksa
        // başlangıç güncellemeleri kaybolur.
        client.setUpdateCallback(callback)

        val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
            .setDataTypes(setOf(DataType.HEART_RATE_BPM))
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build()

        val ioExecutor = Dispatchers.IO.asExecutor()
        val startFuture = client.startExerciseAsync(config)
        startFuture.addListener({
            runCatching { startFuture.get() }.onFailure { e ->
                // Cihazda başka bir egzersiz aktifse "already active" alabiliriz;
                // mevcut oturumu kapatıp yeniden deneriz.
                Log.w(TAG, "startExercise failed: ${e.message}; cleanup + retry")
                runCatching {
                    client.endExerciseAsync().get()
                    client.startExerciseAsync(config).get()
                    Log.d(TAG, "exercise restarted after cleanup")
                }.onFailure { e2 ->
                    Log.e(TAG, "exercise restart failed", e2)
                }
            }
        }, ioExecutor)

        awaitClose {
            runCatching { client.endExerciseAsync() }
            runCatching { client.clearUpdateCallbackAsync(callback) }
            Log.d(TAG, "exercise ended on flow close")
        }
    }
}
