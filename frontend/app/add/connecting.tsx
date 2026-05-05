import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { provisioner } from "../../lib/ble";
import { getSession, setIp } from "../../lib/session";

type Phase = "sending" | "waiting" | "done" | "failed";

export default function Connecting() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("sending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const session = getSession();
      if (!session.device) {
        setError("Cihaz bilgisi yok. Baştan başlayın.");
        setPhase("failed");
        return;
      }
      try {
        setPhase("sending");
        await provisioner.sendWifi(session.ssid, session.password);
        if (cancelled) return;
        setPhase("waiting");
        const result = await provisioner.awaitIp();
        if (cancelled) return;
        setIp(result.ip);
        await provisioner.disconnect();
        if (cancelled) return;
        setPhase("done");
        router.replace("/add/configure");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Bağlanılamadı.");
        setPhase("failed");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const message =
    phase === "sending"
      ? "Wi-Fi bilgileri robota gönderiliyor..."
      : phase === "waiting"
        ? "Robot Wi-Fi'a bağlanıyor..."
        : phase === "done"
          ? "Bağlandı."
          : "Bağlantı başarısız.";

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.body}>
        {phase !== "failed" && (
          <ActivityIndicator size="large" color="#22c55e" />
        )}
        <Text style={styles.text}>{message}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {phase === "failed" && (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.replace("/add")}
          >
            <Text style={styles.buttonText}>Tekrar Dene</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: {
    flex: 1,
    padding: 24,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "#cbd5e1", fontSize: 16, textAlign: "center" },
  error: { color: "#ef4444", fontSize: 14, textAlign: "center" },
  button: {
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonPressed: { backgroundColor: "#16a34a", transform: [{ scale: 0.98 }] },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
