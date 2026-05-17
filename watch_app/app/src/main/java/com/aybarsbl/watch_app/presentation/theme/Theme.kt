package com.aybarsbl.watch_app.presentation.theme

import androidx.compose.runtime.Composable
import androidx.wear.compose.material3.MaterialTheme

// Renkler [Color.kt]'de tanımlı; Composable'larda doğrudan kullanılıyor. Wear
// Compose Material3 ColorScheme tam override etmek için her sürümle değişen
// parametre listesi gerektirdiğinden tema sade tutuluyor.
@Composable
fun Watch_appTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(content = content)
}
