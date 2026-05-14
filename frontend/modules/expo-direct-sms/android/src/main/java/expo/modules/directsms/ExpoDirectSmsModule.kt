package expo.modules.directsms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionDeniedException :
    CodedException("E_SMS_PERMISSION_DENIED", "SMS gönderme izni reddedildi.", null)

class SmsSendFailedException(detail: String) :
    CodedException("E_SMS_SEND_FAILED", "SMS gönderimi başarısız: $detail", null)

// Sistem permission dialog'unu açar ama JS tarafına sonucu doğrudan
// döndüremiyor (Expo Modules onRequestPermissionsResult hook'una sahip değil).
// JS tarafı dialog'tan sonra hasSmsPermission() ile polling yapar — basit ve
// güvenilir.
class ExpoDirectSmsModule : Module() {
    companion object {
        const val PERMISSION_REQUEST_CODE = 20471
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoDirectSms")

        AsyncFunction("hasSmsPermission") { ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) ==
                PackageManager.PERMISSION_GRANTED
        }

        AsyncFunction("requestSmsPermission") { promise: Promise ->
            val activity = appContext.currentActivity
            val ctx = appContext.reactContext
            if (activity == null || ctx == null) {
                promise.reject(CodedException("E_NO_ACTIVITY", "Aktivite yok", null))
                return@AsyncFunction
            }
            val granted = ContextCompat.checkSelfPermission(
                ctx,
                Manifest.permission.SEND_SMS,
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                promise.resolve(true)
                return@AsyncFunction
            }
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.SEND_SMS),
                PERMISSION_REQUEST_CODE,
            )
            // Dialog asenkron açıldı — JS tarafı hasSmsPermission() ile sonucu
            // polling ile öğrenecek.
            promise.resolve(false)
        }

        AsyncFunction("sendDirectSms") { phone: String, message: String, promise: Promise ->
            val ctx = appContext.reactContext
            if (ctx == null) {
                promise.reject(CodedException("E_NO_CONTEXT", "Context yok", null))
                return@AsyncFunction
            }
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                promise.reject(SmsPermissionDeniedException())
                return@AsyncFunction
            }
            try {
                val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    ctx.getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
                val parts = sms.divideMessage(message)
                if (parts.size > 1) {
                    sms.sendMultipartTextMessage(phone, null, parts, null, null)
                } else {
                    sms.sendTextMessage(phone, null, message, null, null)
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject(SmsSendFailedException(e.message ?: "unknown"))
            }
        }
    }
}
