import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WifiNetwork } from "../lib/bleProtocol";
import { Dropdown } from "./Dropdown";

type Props = {
  scan: () => Promise<WifiNetwork[]>;
  connect: (ssid: string, password: string) => Promise<void>;
  currentSsid?: string | null;
  connectLabel?: string;
  busyLabel?: string;
  autoScan?: boolean;
  onConnected?: () => void;
  onError?: (message: string) => void;
};

export function WifiPicker({
  scan,
  connect,
  currentSsid,
  connectLabel = "Wi-Fi'ya Bağlan",
  busyLabel = "Bağlanılıyor...",
  autoScan = true,
  onConnected,
  onError,
}: Props) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedSsid, setSelectedSsid] = useState<string>("");
  const [manualSsid, setManualSsid] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ssidOptions = useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of networks) {
      const lock = n.secure ? " 🔒" : "";
      const bars = signalBars(n.signal);
      out[`${n.ssid}${lock} ${bars}`] = n.ssid;
    }
    return out;
  }, [networks]);

  const selectedNetwork = useMemo(
    () => networks.find((n) => n.ssid === selectedSsid) ?? null,
    [networks, selectedSsid],
  );

  const effectiveSsid = showManual ? manualSsid.trim() : selectedSsid;
  const needsPassword = showManual ? true : (selectedNetwork?.secure ?? true);

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const found = await scan();
      setNetworks(found);
      // Otomatik seçim: aktif Wi-Fi varsa onu seç, yoksa boş bırak.
      if (currentSsid && found.some((n) => n.ssid === currentSsid)) {
        setSelectedSsid(currentSsid);
      } else if (!found.some((n) => n.ssid === selectedSsid)) {
        setSelectedSsid("");
      }
    } catch (e: any) {
      setScanError(e?.message ?? "Tarama başarısız.");
      setNetworks([]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (autoScan) runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError(null);
    if (!effectiveSsid) {
      setError("Bir Wi-Fi ağı seç ya da elle gir.");
      return;
    }
    if (needsPassword && !password) {
      setError("Parola zorunlu.");
      return;
    }
    setBusy(true);
    try {
      await connect(effectiveSsid, password);
      onConnected?.();
    } catch (e: any) {
      const msg = e?.message ?? "Bağlanılamadı.";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      {currentSsid ? (
        <Text style={styles.current}>
          Şu an bağlı: <Text style={styles.currentName}>{currentSsid}</Text>
        </Text>
      ) : null}

      <View style={styles.headerRow}>
        <Text style={styles.title}>Wi-Fi Ağı</Text>
        <Pressable
          onPress={runScan}
          disabled={scanning || busy}
          style={({ pressed }) => [
            styles.refresh,
            pressed && styles.refreshPressed,
            (scanning || busy) && styles.refreshDisabled,
          ]}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#22c55e" />
          ) : (
            <Text style={styles.refreshText}>Yenile</Text>
          )}
        </Pressable>
      </View>

      {!showManual ? (
        <Dropdown
          label="Yakındaki ağlar"
          options={ssidOptions}
          value={selectedSsid}
          onChange={setSelectedSsid}
          placeholder={scanning ? "Aranıyor..." : "Bir ağ seç"}
        />
      ) : (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Wi-Fi Adı (SSID)</Text>
          <TextInput
            value={manualSsid}
            onChangeText={setManualSsid}
            placeholder="örn. Ev_WiFi"
            placeholderTextColor="#475569"
            style={[styles.input, { outline: "none" } as any]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {scanError && !showManual && (
        <Text style={styles.error}>{scanError}</Text>
      )}

      <Pressable onPress={() => setShowManual((v) => !v)}>
        <Text style={styles.toggle}>
          {showManual ? "Listeden seç" : "Elle gir (gizli ağ)"}
        </Text>
      </Pressable>

      {needsPassword && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Parola</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#475569"
            secureTextEntry
            style={[styles.input, { outline: "none" } as any]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => [
          styles.button,
          (pressed || busy) && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{busy ? busyLabel : connectLabel}</Text>
      </Pressable>
    </View>
  );
}

function signalBars(signal: number): string {
  if (signal >= 75) return "▰▰▰▰";
  if (signal >= 55) return "▰▰▰▱";
  if (signal >= 35) return "▰▰▱▱";
  if (signal >= 15) return "▰▱▱▱";
  return "▱▱▱▱";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0b1426",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  current: { color: "#94a3b8", fontSize: 13 },
  currentName: { color: "#bbf7d0", fontWeight: "600" },
  refresh: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  refreshPressed: { backgroundColor: "#172033" },
  refreshDisabled: { opacity: 0.6 },
  refreshText: { color: "#22c55e", fontSize: 13, fontWeight: "500" },
  field: { gap: 6 },
  fieldLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
  },
  toggle: {
    color: "#64748b",
    fontSize: 12,
    fontStyle: "italic",
    textDecorationLine: "underline",
  },
  error: { color: "#ef4444", fontSize: 13 },
  button: {
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonPressed: { backgroundColor: "#16a34a", transform: [{ scale: 0.98 }] },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
