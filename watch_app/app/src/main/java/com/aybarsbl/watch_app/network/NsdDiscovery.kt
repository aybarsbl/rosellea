package com.aybarsbl.watch_app.network

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import com.aybarsbl.watch_app.data.PiDevice
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.net.Inet4Address
import java.net.InetAddress

// Rosellea Pi cihazlarını `_rosellea._tcp.local.` mDNS servis tipiyle bulur.
// Android NSD `.local.` ekini kendisi yönetiyor, biz `_rosellea._tcp.` veriyoruz.
//
// Wear OS firmware'ı multicast trafiğini varsayılan kapatıyor — discovery
// boyunca MulticastLock tutuyoruz, awaitClose'da bırakıyoruz.
class NsdDiscovery(private val context: Context) {
    companion object {
        private const val TAG = "NsdDiscovery"
        private const val SERVICE_TYPE = "_rosellea._tcp."
        private const val MULTICAST_LOCK_TAG = "rosellea-mdns"
    }

    fun discover(): Flow<List<PiDevice>> = callbackFlow {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val wifi = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val multicastLock = wifi.createMulticastLock(MULTICAST_LOCK_TAG).apply {
            setReferenceCounted(false)
            acquire()
        }

        // Bulunan servisler: key = serviceName (instance adı), value = PiDevice
        val devices = mutableMapOf<String, PiDevice>()

        fun publish() {
            trySend(devices.values.sortedBy { it.name }.toList())
        }

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {
                Log.d(TAG, "discovery started: $serviceType")
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                Log.d(TAG, "found: ${service.serviceName} (${service.serviceType})")
                // Her resolve için yeni listener — eskisini yeniden kullanırsak
                // NsdManager IllegalArgumentException atar.
                val resolveListener = object : NsdManager.ResolveListener {
                    override fun onResolveFailed(s: NsdServiceInfo, errorCode: Int) {
                        Log.w(TAG, "resolve failed for ${s.serviceName}: $errorCode")
                    }

                    override fun onServiceResolved(resolved: NsdServiceInfo) {
                        val host: InetAddress? = resolved.host ?: return
                        val ipv4 = if (host is Inet4Address) host.hostAddress else host.hostAddress
                        val ip = ipv4 ?: return
                        val name = resolved.attributes?.get("name")
                            ?.let { String(it) } ?: resolved.serviceName
                        val device = PiDevice(name = name, host = ip, port = resolved.port)
                        devices[resolved.serviceName] = device
                        publish()
                    }
                }
                @Suppress("DEPRECATION")
                nsd.resolveService(service, resolveListener)
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                Log.d(TAG, "lost: ${service.serviceName}")
                if (devices.remove(service.serviceName) != null) publish()
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "discovery stopped")
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "start discovery failed: $errorCode")
                close()
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "stop discovery failed: $errorCode")
            }
        }

        nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        // Boş liste hemen yayınla, UI "tarama" rozetini düşürebilsin.
        publish()

        awaitClose {
            runCatching { nsd.stopServiceDiscovery(listener) }
            runCatching { if (multicastLock.isHeld) multicastLock.release() }
        }
    }
}
