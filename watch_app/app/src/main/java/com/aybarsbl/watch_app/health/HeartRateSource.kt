package com.aybarsbl.watch_app.health

import android.content.Context
import android.util.Log
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.SampleDataPoint
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

data class HrSample(
    val bpm: Int,
    val accuracy: String,
    val available: Boolean,
)

// Health Services MeasureClient ile saniyede ~1 nabız örneği akıtır.
// Wrist-off tespiti tek sinyalimiz `SampleDataPoint.accuracy` — NO_CONTACT ise
// saat bilekte değil. PassiveMonitoringClient seyrek (~150s) örnek verdiği için
// 5sn POST cadence'imize uymuyor; MeasureClient + foreground service kombosu
// Wear OS 6 standart yolu.
class HeartRateSource(private val context: Context) {
    companion object {
        private const val TAG = "HeartRateSource"
    }

    fun flow(): Flow<HrSample> = callbackFlow {
        val client = HealthServices.getClient(context).measureClient

        val callback = object : MeasureCallback {
            override fun onAvailabilityChanged(
                dataType: DeltaDataType<*, *>,
                availability: Availability,
            ) {
                Log.d(TAG, "availability: $availability")
                if (availability is DataTypeAvailability && availability != DataTypeAvailability.AVAILABLE) {
                    trySend(HrSample(bpm = 0, accuracy = "UNAVAILABLE", available = false))
                }
            }

            override fun onDataReceived(data: DataPointContainer) {
                val samples = data.getData(DataType.HEART_RATE_BPM)
                for (sample in samples) {
                    val point = sample as? SampleDataPoint<Double> ?: continue
                    val bpm = point.value.toInt()
                    val accuracyName = point.accuracy?.toString() ?: "UNKNOWN"
                    trySend(HrSample(bpm = bpm, accuracy = accuracyName, available = true))
                }
            }
        }

        client.registerMeasureCallback(DataType.HEART_RATE_BPM, callback)

        awaitClose {
            // unregisterMeasureCallbackAsync ListenableFuture döner; bekleme,
            // hata yutma — sadece tetiklemek yeterli.
            runCatching {
                client.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, callback)
                Unit
            }
        }
    }
}
