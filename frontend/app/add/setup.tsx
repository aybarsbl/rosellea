import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FieldKey, RobotSettingsForm } from "../../components/RobotSettingsForm";
import { WifiPicker } from "../../components/WifiPicker";
import { provisioner } from "../../lib/ble";
import { getEnv, postSetupComplete } from "../../lib/api";
import { getSession, setIp } from "../../lib/session";
import { addRobot } from "../../lib/storage";

const ALL_FIELDS: FieldKey[] = [
  "name",
  "age",
  "hobbies",
  "health_notes",
  "contacts",
  "assistantModel",
  "elabsModel",
  "elabsOutput",
  "elabsVoice",
];

export default function Setup() {
  const router = useRouter();
  const session = getSession();
  const [robotIp, setRobotIp] = useState<string | null>(null);
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const connectAndLoad = async (ssid: string, password: string) => {
    if (!session.device) {
      throw new Error("Cihaz bilgisi yok. Baştan başlayın.");
    }
    await provisioner.sendWifi(ssid, password);
    const result = await provisioner.awaitIp();
    setIp(result.ip);
    setRobotIp(result.ip);
    // Robot HTTP'yi BLE notify ile aynı anda açıyor; uvicorn bind'i bazen
    // gecikiyor — kısa retry ile dayanıklı yükleme.
    const attempts = 6;
    for (let i = 0; i < attempts; i++) {
      try {
        const e = await getEnv(result.ip);
        setEnv(e);
        return;
      } catch (err) {
        if (i === attempts - 1) {
          setLoadError(
            "Robota bağlanıldı ama ayarlar yüklenemedi. Aynı Wi-Fi'de olduğundan emin ol.",
          );
          setEnv({});
          throw err;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };

  const handleSaved = async () => {
    if (!session.device || !robotIp) {
      setLoadError("Oturum bilgisi eksik. Baştan başlayın.");
      return;
    }
    try {
      await postSetupComplete(robotIp);
    } catch (e: any) {
      setLoadError(e?.message ?? "Robot kurulumu tamamlanamadı.");
      return;
    }
    await addRobot({
      id: session.device.id,
      name: session.device.name,
      host: robotIp,
    });
    try {
      await provisioner.disconnect();
    } catch {
      // ignore
    }
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>
          Robot{session.device ? ` (${session.device.name})` : ""} kurulum için
          hazır. Önce Wi-Fi'a bağla, sonra ayarları kaydet.
        </Text>

        <WifiPicker
          scan={() => provisioner.scanWifi()}
          connect={connectAndLoad}
          connectLabel="Wi-Fi'ya Bağlan ve Devam Et"
          busyLabel="Bağlanılıyor, IP bekleniyor..."
        />

        {robotIp && (
          <View style={styles.connected}>
            <Text style={styles.connectedText}>
              Bağlandı: <Text style={styles.ip}>{robotIp}</Text>
            </Text>
          </View>
        )}

        {loadError && <Text style={styles.error}>{loadError}</Text>}

        {robotIp &&
          (env === null ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#22c55e" />
              <Text style={styles.label}>Ayarlar yükleniyor...</Text>
            </View>
          ) : (
            <RobotSettingsForm
              host={robotIp}
              fields={ALL_FIELDS}
              initial={env}
              saveLabel="Kaydet"
              onSaved={handleSaved}
            />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { padding: 16, gap: 16 },
  label: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  error: { color: "#ef4444", fontSize: 13 },
  center: { paddingVertical: 24, alignItems: "center", gap: 12 },
  connected: {
    backgroundColor: "#14532d",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  connectedText: { color: "#bbf7d0", fontSize: 14 },
  ip: { fontWeight: "700", color: "#ffffff" },
});
