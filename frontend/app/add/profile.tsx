import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FieldKey, RobotSettingsForm } from "../../components/RobotSettingsForm";
import { getEnv, postSetupComplete } from "../../lib/api";
import { provisioner } from "../../lib/ble";
import { getSession } from "../../lib/session";
import { addRobot } from "../../lib/storage";

const ALL_FIELDS: FieldKey[] = [
  "name",
  "age",
  "friendship",
  "hobbies",
  "health_notes",
  "contacts",
  "assistantModel",
  "elabsModel",
  "elabsOutput",
  "elabsVoice",
  "speakerVolume",
  "micGain",
];

export default function Profile() {
  const router = useRouter();
  const session = getSession();
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!session.device || !session.ip) {
        setError("Oturum bilgisi eksik. Baştan başlayın.");
        return;
      }
      // Robot HTTP'yi BLE notify ile aynı anda açıyor; uvicorn bind'i bazen
      // gecikiyor — kısa retry ile dayanıklı yükleme.
      const attempts = 6;
      for (let i = 0; i < attempts; i++) {
        try {
          const e = await getEnv(session.ip);
          if (!cancelled) setEnv(e);
          return;
        } catch (err) {
          if (i === attempts - 1) {
            if (!cancelled) {
              setError(
                "Robota bağlanıldı ama ayarlar yüklenemedi. Aynı Wi-Fi'de olduğundan emin ol.",
              );
              setEnv({});
            }
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session.device, session.ip]);

  const handleBeforeRestart = async () => {
    if (!session.ip) {
      throw new Error("Oturum bilgisi eksik. Baştan başlayın.");
    }
    // Restart öncesinde setup flag'ini env.json'a yaz; respawn sonrası main.py
    // bunu okuyup kurulum bekleme bloğunu geçer.
    await postSetupComplete(session.ip);
  };

  const handleSaved = async () => {
    if (!session.device || !session.ip) {
      setError("Oturum bilgisi eksik. Baştan başlayın.");
      return;
    }
    await addRobot({
      id: session.device.id,
      name: session.device.name,
      host: session.ip,
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
        <View>
          <Text style={styles.title}>Robot Profili</Text>
          <Text style={styles.label}>
            Wi-Fi bağlantısı kuruldu. Robotun profil ve ses ayarlarını gir, sonra
            kaydet.
          </Text>
          {session.ip && (
            <Text style={styles.ip}>IP: {session.ip}</Text>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {env === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.label}>Ayarlar yükleniyor...</Text>
          </View>
        ) : (
          <RobotSettingsForm
            host={session.ip ?? ""}
            fields={ALL_FIELDS}
            initial={env}
            saveLabel="Kaydet ve Bitir"
            onSaved={handleSaved}
            onBeforeRestart={handleBeforeRestart}
            restartAfterSave
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { padding: 16, gap: 16 },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 6 },
  label: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  ip: { color: "#bbf7d0", fontSize: 13, marginTop: 8, fontWeight: "600" },
  error: { color: "#ef4444", fontSize: 13 },
  center: { paddingVertical: 24, alignItems: "center", gap: 12 },
});
