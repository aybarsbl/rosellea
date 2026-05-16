package com.aybarsbl.watch_app.ui.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.aybarsbl.watch_app.data.AppState
import com.aybarsbl.watch_app.ui.screens.DiscoveryScreen
import com.aybarsbl.watch_app.ui.screens.LiveHrScreen
import com.aybarsbl.watch_app.ui.screens.PiInfoScreen

object Routes {
    const val DISCOVER = "discover"
    const val PI_INFO = "pi_info"
    const val LIVE_HR = "live_hr"
}

@Composable
fun WatchNav(navController: NavController = rememberSwipeDismissableNavController()) {
    SwipeDismissableNavHost(
        navController = navController as androidx.navigation.NavHostController,
        startDestination = Routes.DISCOVER,
    ) {
        composable(Routes.DISCOVER) {
            DiscoveryScreen(onPick = { pi ->
                AppState.selectedPi.value = pi
                navController.navigate(Routes.PI_INFO)
            })
        }
        composable(Routes.PI_INFO) {
            PiInfoScreen(
                onStart = { navController.navigate(Routes.LIVE_HR) },
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.LIVE_HR) {
            LiveHrScreen(onStop = {
                navController.popBackStack(Routes.DISCOVER, inclusive = false)
            })
        }
    }
}
