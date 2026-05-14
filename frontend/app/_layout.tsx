import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { subscribe } from "../lib/emergency";
import { hydrateMonitoringContext } from "../lib/emergencyStore";

SplashScreen.preventAutoHideAsync();

async function requestNotificationPermission() {
  if (Platform.OS !== "android") return;
  if (Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(
      "android.permission.POST_NOTIFICATIONS" as any,
    );
  } catch {
    // ignore
  }
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const armedRouted = useRef(false);

  useEffect(() => {
    // Cold-start sırasında AsyncStorage'tan acil durum context'ini (host,
    // contacts, sms şablonu) restore et — service bildirim ile uygulamayı
    // uyandırdığında modal context'siz açılmasın.
    hydrateMonitoringContext().finally(() => {
      SplashScreen.hideAsync().finally(() => setReady(true));
    });
    requestNotificationPermission();
  }, []);

  // Global emergency listener: armed event geldiğinde hangi route'ta olursak
  // olalım emergency modalını öne çıkar. armedRouted guard'ı double-push
  // önler — fired/cancelled geldiğinde reset.
  useEffect(() => {
    const unsub = subscribe((e) => {
      if (e.type === "emergency.armed") {
        if (!armedRouted.current) {
          armedRouted.current = true;
          router.push("/emergency" as any);
        }
      } else if (
        e.type === "emergency.cancelled" ||
        e.type === "emergency.idle" ||
        e.type === "emergency.sent"
      ) {
        armedRouted.current = false;
      }
    });
    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="robot" />
      <Stack.Screen name="add" />
      <Stack.Screen
        name="emergency"
        options={{
          presentation: "fullScreenModal",
          animation: "fade",
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
});
