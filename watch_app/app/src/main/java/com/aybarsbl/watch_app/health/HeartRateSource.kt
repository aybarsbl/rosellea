package com.aybarsbl.watch_app.health

import android.content.Context
import android.util.Log
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseState
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
    val state: String,
)

// Wear OS'ta ekran kapalıyken sürekli HR alabilmenin tek desteklenen yolu
// ExerciseClient üzerinden bir egzersiz oturumu açmaktır. MeasureClient yalnız
// "active engagement" senaryoları için tasarlanmış; foreground service
// type=health bile olsa Health Services screen-off'ta MeasureClient akışını
// duraklatıyor. ExerciseClient ise always-on bir oturum sözleşmesi.
//
// One UI Watch + Samsung Health bazen ExerciseClient session'ını da
// duraklatıyor (USER_PAUSED) veya başka bir app devraldığında bizimkini
// sonlandırıyor (AUTO_ENDED/AUTO_END_SUPERSEDED). Bu yüzden state'i izleyip
// PAUSED'ta resume, ENDED/TERMINATED'ta restart yapıyoruz.
class HeartRateSource(private val context: Context) {
    companion object {
        private const val TAG = "HeartRateSource"
    }

    fun flow(): Flow<HrSample> = callbackFlow {
        val client = HealthServices.getClient(context).exerciseClient
        val ioExecutor = Dispatchers.IO.asExecutor()

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
                    trySend(
                        HrSample(
                            bpm = 0,
                            accuracy = "UNAVAILABLE",
                            available = false,
                            state = "AVAILABILITY_${availability}",
                        ),
                    )
                }
            }

            override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                val state = update.exerciseStateInfo.state
                val endReason = update.exerciseStateInfo.endReason
                val stateName = state.toString()
                Log.d(TAG, "exercise state=$stateName endReason=$endReason")

                // Pause olursa resume et. AutoPause'u config'te kapattık ama
                // sistem yine de USER_PAUSED tetikleyebiliyor.
                if (state == ExerciseState.USER_PAUSED || state == ExerciseState.AUTO_PAUSED) {
                    Log.w(TAG, "exercise paused; calling resumeExerciseAsync()")
                    runCatching { client.resumeExerciseAsync() }
                        .onFailure { Log.e(TAG, "resume failed", it) }
                }

                // Bittiyse yeniden başlat. ENDED/TERMINATED'ta session öldü.
                if (state == ExerciseState.ENDED ||
                    state == ExerciseState.AUTO_ENDED ||
                    state == ExerciseState.TERMINATED
                ) {
                    Log.w(TAG, "exercise ended (reason=$endReason); restarting")
                    restartExercise(client, this, ioExecutor)
                }

                val samples = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                for (sample in samples) {
                    val bpm = sample.value.toInt()
                    val accuracyName = sample.accuracy?.toString() ?: "UNKNOWN"
                    trySend(
                        HrSample(
                            bpm = bpm,
                            accuracy = accuracyName,
                            available = true,
                            state = stateName,
                        ),
                    )
                }
            }

            override fun onLapSummaryReceived(summary: ExerciseLapSummary) {}
        }

        client.setUpdateCallback(callback)
        startExercise(client, callback, ioExecutor)

        awaitClose {
            runCatching { client.endExerciseAsync() }
            runCatching { client.clearUpdateCallbackAsync(callback) }
            Log.d(TAG, "exercise ended on flow close")
        }
    }

    private fun startExercise(
        client: ExerciseClient,
        callback: ExerciseUpdateCallback,
        executor: java.util.concurrent.Executor,
    ) {
        val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
            .setDataTypes(setOf(DataType.HEART_RATE_BPM))
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build()

        val future = client.startExerciseAsync(config)
        future.addListener({
            runCatching { future.get() }.onFailure { e ->
                Log.w(TAG, "startExercise failed: ${e.message}; cleanup + retry")
                runCatching {
                    client.endExerciseAsync().get()
                    client.startExerciseAsync(config).get()
                    Log.d(TAG, "exercise restarted after cleanup")
                }.onFailure { e2 ->
                    Log.e(TAG, "exercise restart failed", e2)
                }
            }
        }, executor)
    }

    private fun restartExercise(
        client: ExerciseClient,
        callback: ExerciseUpdateCallback,
        executor: java.util.concurrent.Executor,
    ) {
        // Aynı thread'de Synchronous restart yapma; SDK callback thread'inde
        // get() blokerleri deadlock'a yol açabilir. Executor üzerinde işleyelim.
        executor.execute {
            runCatching {
                client.endExerciseAsync().get()
            }
            startExercise(client, callback, executor)
        }
    }
}
