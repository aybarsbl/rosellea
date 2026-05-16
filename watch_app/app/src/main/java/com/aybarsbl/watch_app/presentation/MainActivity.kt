package com.aybarsbl.watch_app.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.aybarsbl.watch_app.presentation.theme.Watch_appTheme
import com.aybarsbl.watch_app.ui.nav.WatchNav

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            Watch_appTheme {
                AppScaffold {
                    val navController = rememberSwipeDismissableNavController()
                    WatchNav(navController = navController)
                }
            }
        }
    }
}
