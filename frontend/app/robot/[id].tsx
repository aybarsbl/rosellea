import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RobotSettingsForm, FieldKey } from "../../components/RobotSettingsForm";
import { WifiPicker } from "../../components/WifiPicker";
import {
  EmergencySnapshot,
  getByPath,
  getEmergency,
  getEnv,
  getHealth,
  getWifiScan,
  Health,
  postReset,
  postWifiConnect,
} from "../../lib/api";
import {
  getRobot,
  removeRobot,
  Robot,
  updateRobotHost,
} from "../../lib/storage";
import { startMonitoring, stopMonitoring } from "../../lib/emergency";
import { setMonitoringContext } from "../../lib/emergencyStore";
import { Contact } from "../../lib/envTypes";

const ALL_FIELDS: FieldKey[] = [
  "name",
  "age",
  "friendship",
  "hobbies",
  "health_notes",
  "contacts",
  "safetyEnabled",
  "smokeThreshold",
  "smsTemplate",
  "assistantModel",
  "elabsModel",
  "elabsOutput",
  "elabsVoice",
  "whisperSize",
  "speakerVolume",
  "micGain",
];

function asContacts(v: unknown): Contact[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      name: typeof x.name === "string" ? x.name : "",
      phone: typeof x.phone === "string" ? x.phone : "",
    }));
}

function asNumberLoose(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

function asStringLoose(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export default function RobotDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [robot, setRobot] = useState<Robot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [env, setEnv] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showWifi, setShowWifi] = useState(false);
  const [currentSsid, setCurrentSsid] = useState<string | null>(null);
  const [smokeSnapshot, setSmokeSnapshot] = useState<EmergencySnapshot | null>(null);
  const monitoringHostRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const r = await getRobot(id);
        if (!r) {
          if (!cancelled) setError("Robot bulunamadı.");
          return;
        }
        if (cancelled) return;
        setRobot(r);
        const [h, e] = await Promise.all([
          getHealth(r.host).catch(() => null),
          getEnv(r.host).catch(() => ({}) as Record<string, unknown>),
        ]);
        if (cancelled) return;
        setHealth(h);
        setEnv(e);

        // Emergency monitoring context'i güncelle. Modal background notification
        // ile açıldığında bu store'dan host/contacts okuyacak.
        const contacts = asContacts(getByPath(e, "user.contacts"));
        const threshold = asNumberLoose(
          getByPath(e, "safety.smoke.threshold"),
          18000,
        );
        const countdownS = asNumberLoose(
          getByPath(e, "safety.smoke.countdown_s"),
          10,
        );
        const smsTemplate = asStringLoose(
          getByPath(e, "safety.smoke.sms_template"),
          "ACIL DURUM: Rosellea ev içinde duman algıladı. Lütfen kontrol edin.",
        );
        const smsTemplateHeartRate = asStringLoose(
          getByPath(e, "safety.heart_rate.sms_template"),
          "ACIL DURUM: Rosellea kalp ritmi anomalisi tespit etti. Lütfen kontrol edin.",
        );
        const safetyEnabled = getByPath(e, "safety.smoke.enabled");
        setMonitoringContext({
          host: r.host,
          robotName: r.name,
          contacts,
          smsTemplate,
          smsTemplateHeartRate,
          countdownS,
          threshold,
        });

        // Foreground service'i sadece güvenlik açıksa başlat.
        const shouldMonitor =
          typeof safetyEnabled === "boolean" ? safetyEnabled : true;
        if (shouldMonitor) {
          monitoringHostRef.current = r.host;
          await startMonitoring(r.host, r.name).catch((err) => {
            console.warn("[robot] startMonitoring hatası:", err);
          });
        } else if (monitoringHostRef.current) {
          await stopMonitoring().catch(() => undefined);
          monitoringHostRef.current = null;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Canlı duman bandı — robot detayı açıkken her 3 saniyede bir raw değeri çek.
  useEffect(() => {
    if (!robot) return;
    let cancelled = false;
    let timer: any;
    const tick = async () => {
      try {
        const snap = await getEmergency(robot.host);
        if (!cancelled) setSmokeSnapshot(snap);
      } catch {
        if (!cancelled) setSmokeSnapshot(null);
      }
      if (!cancelled) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [robot]);

  const handleSaved = async () => {
    setReloadKey((k) => k + 1);
  };

  const handleWifiScan = async () => {
    if (!robot) return [];
    const res = await getWifiScan(robot.host);
    setCurrentSsid(res.current);
    return res.networks;
  };

  const handleWifiConnect = async (ssid: string, password: string) => {
    if (!robot) throw new Error("Robot bulunamadı.");
    const res = await postWifiConnect(robot.host, ssid, password);
    if (res.ip && res.ip !== robot.host) {
      await updateRobotHost(robot.id, res.ip);
      setRobot({ ...robot, host: res.ip });
    }
    setShowWifi(false);
    setReloadKey((k) => k + 1);
  };

  const confirmRemove = () => {
    if (!robot) return;
    const performRemove = async () => {
      // Backend fabrika ayarlarına dönsün ve süreç kendini yeniden başlatsın.
      // Robot offline olabilir → hata fırsatı yakala ama yerel silmeyi engelleme.
      try {
        await postReset(robot.host);
      } catch (e: any) {
        setError(
          e?.message ??
            "Robota bağlanılamadı, sıfırlama yapılamadı. Yine de listeden kaldırılıyor.",
        );
      }
      await removeRobot(robot.id);
      router.replace("/");
    };
    const message = `"${robot.name}" silinecek. Robot fabrika ayarlarına dönecek ve yeniden başlatılacak. Devam edilsin mi?`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(message)) {
        performRemove();
      }
      return;
    }
    Alert.alert("Robotu Sil", message, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: performRemove },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      </SafeAreaView>
    );
  }

  if (!robot) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "Robot bulunamadı."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{robot.name}</Text>
          <Text style={styles.cardMeta}>{robot.host}</Text>
          <Text
            style={[
              styles.statusBadge,
              health ? styles.statusOk : styles.statusOff,
            ]}
          >
            {health ? "Bağlı" : "Bağlanılamadı"}
          </Text>
        </View>

        {smokeSnapshot && smokeSnapshot.threshold > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardMeta}>Duman seviyesi (canlı)</Text>
            <Text
              style={[
                styles.smokeValue,
                smokeSnapshot.raw >= smokeSnapshot.threshold * 0.8 &&
                  styles.smokeValueWarn,
                smokeSnapshot.raw >= smokeSnapshot.threshold &&
                  styles.smokeValueAlert,
              ]}
            >
              {smokeSnapshot.raw} / {smokeSnapshot.threshold}
            </Text>
            <View style={styles.smokeBarOuter}>
              <View
                style={[
                  styles.smokeBarInner,
                  {
                    width: `${Math.min(
                      100,
                      Math.round(
                        (smokeSnapshot.raw / Math.max(1, smokeSnapshot.threshold)) *
                          100,
                      ),
                    )}%`,
                    backgroundColor:
                      smokeSnapshot.raw >= smokeSnapshot.threshold
                        ? "#ef4444"
                        : smokeSnapshot.raw >= smokeSnapshot.threshold * 0.8
                          ? "#f59e0b"
                          : "#22c55e",
                  },
                ]}
              />
            </View>
            <Text style={styles.cardMeta}>Durum: {smokeSnapshot.state}</Text>
          </View>
        )}

        <Pressable
          onPress={() => setShowWifi((v) => !v)}
          style={({ pressed }) => [
            styles.wifiToggle,
            pressed && styles.wifiTogglePressed,
          ]}
        >
          <Text style={styles.wifiToggleText}>
            {showWifi ? "Wi-Fi Ayarını Kapat" : "Wi-Fi'yı Değiştir"}
          </Text>
        </Pressable>

        {showWifi && (
          <WifiPicker
            scan={handleWifiScan}
            connect={handleWifiConnect}
            currentSsid={currentSsid}
            connectLabel="Yeni Ağa Bağla"
            busyLabel="Bağlanılıyor..."
          />
        )}

        <RobotSettingsForm
          key={reloadKey}
          host={robot.host}
          fields={ALL_FIELDS}
          initial={env}
          saveLabel="Değişiklikleri Kaydet"
          onSaved={handleSaved}
        />

        <Pressable
          style={({ pressed }) => [
            styles.danger,
            pressed && styles.dangerPressed,
          ]}
          onPress={confirmRemove}
        >
          <Text style={styles.dangerText}>Robotu Sil</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 16 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  cardMeta: { color: "#94a3b8", fontSize: 13 },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    overflow: "hidden",
  },
  statusOk: { backgroundColor: "#14532d", color: "#86efac" },
  statusOff: { backgroundColor: "#7f1d1d", color: "#fca5a5" },
  smokeValue: { color: "#86efac", fontSize: 22, fontWeight: "700", marginTop: 6 },
  smokeValueWarn: { color: "#fbbf24" },
  smokeValueAlert: { color: "#fca5a5" },
  smokeBarOuter: {
    marginTop: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0b1422",
    overflow: "hidden",
  },
  smokeBarInner: { height: "100%", borderRadius: 4 },
  error: { color: "#ef4444", fontSize: 13 },
  wifiToggle: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  wifiTogglePressed: { backgroundColor: "#172033" },
  wifiToggleText: { color: "#cbd5e1", fontSize: 14, fontWeight: "500" },
  danger: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7f1d1d",
  },
  dangerPressed: { backgroundColor: "#1e0808" },
  dangerText: { color: "#fca5a5", fontSize: 15, fontWeight: "600" },
});
