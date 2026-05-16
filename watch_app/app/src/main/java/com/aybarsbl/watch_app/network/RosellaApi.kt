package com.aybarsbl.watch_app.network

import android.os.Build
import com.aybarsbl.watch_app.data.PiDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object RosellaApi {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun postHeartRate(
        pi: PiDevice,
        heartRate: Int,
        onWrist: Boolean,
        accuracy: String,
    ): Boolean = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("heart_rate", heartRate)
            put("on_wrist", onWrist)
            put("accuracy", accuracy)
            put("timestamp", System.currentTimeMillis() / 1000.0)
            put("device_id", Build.MODEL ?: "watch")
        }.toString().toRequestBody(JSON)

        val request = Request.Builder()
            .url("http://${pi.host}:${pi.port}/vitals/heart_rate")
            .post(payload)
            .build()

        client.newCall(request).execute().use { resp ->
            resp.isSuccessful
        }
    }
}
