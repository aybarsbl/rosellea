import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DiscoveredDevice, provisioner } from "../../lib/ble";
import { resetSession, setDevice } from "../../lib/session";

// BLE adapter kapalı / izin yok / generic hata — hepsini tek anlaşılır mesaja eşle.
function mapBleError(raw: string | undefined): string {
  const msg = raw ?? "";
  if (/bluetooth|ble|powered|permission|izin/i.test(msg)) {
    return "Bluetooth Bağlantısını etkin hale getirmeniz gerekiyor.";
  }
  return msg || "Bağlanılamadı.";
}

export default function AddScan() {
  const router = useRouter();
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);

  useEffect(() => {
    resetSession();
    let cancelled = false;
    setScanning(true);
    setError(null);
    provisioner
      .scan()
      .then((found) => {
        if (!cancelled) setDevices(found);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(mapBleError(e?.message));
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (device: DiscoveredDevice) => {
    setError(null);
    try {
      await provisioner.connect(device.id);
      setDevice(device);
      router.push("/add/setup");
    } catch (e: any) {
      setError(mapBleError(e?.message));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.body}>
        {scanning ? (
          <View style={styles.statusBox}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.statusText}>Robot aranıyor...</Text>
          </View>
        ) : error ? (
          <View style={styles.statusBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={devices}
            keyExtractor={(d) => d.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>
                  Yakında bir robot bulunamadı.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.deviceRow,
                  pressed && styles.deviceRowPressed,
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceMeta}>{item.id}</Text>
                </View>
                {typeof item.rssi === "number" && (
                  <Text style={styles.deviceRssi}>{item.rssi} dBm</Text>
                )}
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { flex: 1, padding: 16 },
  statusBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  statusText: { color: "#94a3b8", fontSize: 15 },
  errorText: { color: "#ef4444", fontSize: 15, textAlign: "center" },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  deviceRowPressed: { backgroundColor: "#1e293b" },
  deviceName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  deviceMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  deviceRssi: { color: "#22c55e", fontSize: 13, fontWeight: "500" },
  separator: { height: 8 },
});
