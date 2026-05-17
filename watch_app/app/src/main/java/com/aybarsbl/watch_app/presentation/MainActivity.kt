package com.aybarsbl.watch_app.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.wear.compose.material3.AppScaffold
import com.aybarsbl.watch_app.presentation.theme.Watch_appTheme
import com.aybarsbl.watch_app.system.BatteryOptimization
import com.aybarsbl.watch_app.ui.nav.WatchNav

class MainActivity : ComponentActivity() {
    private var batteryPromptShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            Watch_appTheme {
                AppScaffold {
                    WatchNav()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Uygulama her foreground'a geldiğinde tek seferlik muafiyet diyaloğu
        // tetikle: kullanıcı reddederse tekrar tekrar dayatma, ama prompt
        // henüz bu süreçte gösterilmediyse ve hâlâ muaf değilse iste.
        if (!batteryPromptShown && !BatteryOptimization.isIgnoringOptimizations(this)) {
            batteryPromptShown = true
            BatteryOptimization.requestExemption(this)
        }
    }
}
