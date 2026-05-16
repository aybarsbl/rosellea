package com.aybarsbl.watch_app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.Text
import com.aybarsbl.watch_app.data.PiDevice
import com.aybarsbl.watch_app.network.NsdDiscovery
import kotlinx.coroutines.flow.flowOf

@Composable
fun DiscoveryScreen(onPick: (PiDevice) -> Unit) {
    val context = LocalContext.current
    val discovery = remember(context) { NsdDiscovery(context.applicationContext) }
    val devices by remember(discovery) { discovery.discover() }.collectAsState(initial = emptyList())

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        item {
            ListHeader { Text(text = "Rosellea cihazları") }
        }
        if (devices.isEmpty()) {
            item {
                Text(
                    text = "Aranıyor...",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        } else {
            items(devices, key = { it.host }) { pi ->
                Button(
                    onClick = { onPick(pi) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Text(text = pi.name)
                }
            }
        }
    }
}

// Preview için kullanılmıyor; flowOf placeholder.
@Suppress("unused")
private fun emptyDevices() = flowOf(emptyList<PiDevice>())
