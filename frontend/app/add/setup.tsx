import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WifiPicker } from "../../components/WifiPicker";
import { provisioner } from "../../lib/ble";
import { getSession, setIp } from "../../lib/session";

export default function Setup() {
  const router = useRouter();
  const session = getSession();
  const [error, setError] = useState<string | null>(null);

  const connectAndContinue = async (ssid: string, password: string) => {
    if (!session.device) {
      throw new Error("Cihaz bilgisi yok. Baştan başlayın.");
    }
    await provisioner.sendWifi(ssid, password);
    const result = await provisioner.awaitIp();
    setIp(result.ip);
    setError(null);
    router.replace("/add/profile");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.title}>Wi-Fi Bağlantısı</Text>
          <Text style={styles.label}>
            Robot{session.device ? ` (${session.device.name})` : ""} için bir
            Wi-Fi ağı seç. Bağlantı kurulduktan sonra profil ayarlarına geçeceksin.
          </Text>
        </View>

        <WifiPicker
          scan={() => provisioner.scanWifi()}
          connect={connectAndContinue}
          connectLabel="Wi-Fi'ya Bağlan ve Devam Et"
          busyLabel="Bağlanılıyor, IP bekleniyor..."
        />

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { padding: 16, gap: 16 },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 6 },
  label: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  error: { color: "#ef4444", fontSize: 13 },
});
