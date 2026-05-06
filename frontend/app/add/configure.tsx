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
import { getSession, resetSession } from "../../lib/session";
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

export default function Configure() {
  const router = useRouter();
  const session = getSession();
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!session.ip) {
        if (!cancelled) setError("Oturum bilgisi eksik. Baştan başlayın.");
        return;
      }
      try {
        const e = await getEnv(session.ip);
        if (!cancelled) setEnv(e);
      } catch {
        if (!cancelled) setEnv({});
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session.ip]);

  const handleSaved = async () => {
    if (!session.device || !session.ip) {
      setError("Oturum bilgisi eksik. Baştan başlayın.");
      return;
    }
    try {
      await postSetupComplete(session.ip);
    } catch (e: any) {
      setError(e?.message ?? "Robot kurulumu tamamlanamadı.");
      return;
    }
    await addRobot({
      id: session.device.id,
      name: session.device.name,
      host: session.ip,
    });
    resetSession();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>
          Robot {session.ip ? `${session.ip} adresinde` : "ağda"} hazır.
          Aşağıdaki bilgileri kaydedince çalışmaya başlayacak.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {env === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#22c55e" />
          </View>
        ) : (
          session.ip && (
            <RobotSettingsForm
              host={session.ip}
              fields={ALL_FIELDS}
              initial={env}
              saveLabel="Kaydet"
              onSaved={handleSaved}
            />
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { padding: 16, gap: 16 },
  label: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  error: { color: "#ef4444", fontSize: 13 },
  center: { paddingVertical: 40, alignItems: "center" },
});
