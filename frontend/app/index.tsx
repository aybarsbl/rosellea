import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { scanRosellea } from "../lib/discovery";
import { listRobots, removeRobot, Robot, updateRobotHost } from "../lib/storage";
import { getHealth, postReset } from "../lib/api";
import { ExpoWatchBridge } from "expo-watch-bridge";

type Status = "ok" | "off" | "unknown";

const HEALTH_TIMEOUT_MS = 2000;
const REFRESH_INTERVAL_MS = 5000;

async function checkHealth(host: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${host}:8000/health`, {
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function Index() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [robots, setRobots] = useState<Robot[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const robotsRef = useRef<Robot[]>([]);
  robotsRef.current = robots;

  const refreshHealth = useCallback(async () => {
    const list = robotsRef.current;
    if (list.length === 0) return;
    const results = await Promise.all(
      list.map(async (r) => [r.id, r.host, await checkHealth(r.host)] as const),
    );
    const next: Record<string, Status> = {};
    const online: string[] = [];
    for (const [id, host, ok] of results) {
      next[id] = ok ? "ok" : "off";
      if (ok) online.push(host);
    }
    setStatus(next);
    try {
      await ExpoWatchBridge.setTargets(online, 8000);
    } catch {
      // native modül yoksa sessiz geç (web/iOS stub)
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const refresh = async () => {
        const list = await listRobots();
        if (cancelled) return;
        setRobots(list);
        // Bilinmeyen olarak başlat; sağlık taraması sonra dolduracak.
        setStatus((prev) => {
          const next: Record<string, Status> = {};
          for (const r of list) next[r.id] = prev[r.id] ?? "unknown";
          return next;
        });

        if (list.length > 0) {
          // mDNS host güncellemesi (mevcut davranış)
          const services = await scanRosellea();
          if (!cancelled && services.length > 0) {
            const byName = new Map(services.map((s) => [s.name, s.host]));
            let changed = false;
            const updated = await Promise.all(
              list.map(async (r) => {
                const host = byName.get(r.name);
                if (host && host !== r.host) {
                  await updateRobotHost(r.id, host);
                  changed = true;
                  return { ...r, host };
                }
                return r;
              }),
            );
            if (!cancelled && changed) setRobots(updated);
          }
        }
        if (!cancelled) await refreshHealth();
      };

      refresh();
      interval = setInterval(() => {
        if (!cancelled) refreshHealth();
      }, REFRESH_INTERVAL_MS);

      return () => {
        cancelled = true;
        if (interval) clearInterval(interval);
      };
    }, [refreshHealth]),
  );

  const handleLongPressDelete = useCallback((robot: Robot) => {
    const message = `"${robot.name}" silinecek. Robot çevrimiçiyse fabrika ayarlarına dönecek; çevrimdışıysa yalnızca listeden kaldırılır. Devam edilsin mi?`;
    const performDelete = async () => {
      try {
        await postReset(robot.host);
      } catch {
        // Çevrimdışı robot — fabrika resetini atla, yine de listeden çıkar.
      }
      await removeRobot(robot.id);
      const fresh = await listRobots();
      setRobots(fresh);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(message)) {
        performDelete();
      }
      return;
    }
    Alert.alert("Robotu Sil", message, [
      { text: "İptal", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: performDelete },
    ]);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return robots;
    return robots.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.host.toLowerCase().includes(q),
    );
  }, [robots, query]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Rosellea</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.searchBox}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ara..."
            placeholderTextColor="#64748b"
            style={[styles.searchInput, { outline: "none" } as any]}
          />
        </View>

        <View style={styles.listBox}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const s: Status = status[item.id] ?? "unknown";
              const isOk = s === "ok";
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.listItem,
                    pressed && isOk && styles.listItemPressed,
                    !isOk && styles.listItemDisabled,
                  ]}
                  onPress={() => {
                    if (!isOk) return;
                    router.push(`/robot/${item.id}`);
                  }}
                  onLongPress={() => handleLongPressDelete(item)}
                  delayLongPress={500}
                >
                  <View style={styles.listItemText}>
                    <Text style={styles.listItemTitle}>{item.name}</Text>
                    <Text style={styles.listItemSubtitle}>{item.host}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusDot,
                      s === "ok" && styles.statusDotOk,
                      s === "off" && styles.statusDotOff,
                      s === "unknown" && styles.statusDotUnknown,
                    ]}
                  />
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  Henüz bir robot eklenmemiş.
                </Text>
                <Text style={styles.emptyHint}>
                  Aşağıdaki Ekle tuşuna basarak başlayın.
                </Text>
              </View>
            }
            ListFooterComponent={
              <Pressable
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.addButtonPressed,
                ]}
                onPress={() => router.push("/add")}
              >
                <Text style={styles.addButtonText}>Ekle</Text>
              </Pressable>
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#0f172a",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 100,
  },
  title: {
    flex: 1,
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  headerSpacer: {
    width: 50,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchBox: {
    width: "100%",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.7,
    padding: 3,
  },
  listBox: {
    flex: 1,
    width: "100%",
    borderRadius: 12,
    padding: 12,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  listItemText: {
    flex: 1,
    paddingRight: 12,
  },
  listItemPressed: {
    backgroundColor: "#0f172a",
  },
  listItemDisabled: {
    opacity: 0.5,
  },
  listItemTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  listItemSubtitle: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotOk: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  statusDotOff: {
    backgroundColor: "#ef4444",
  },
  statusDotUnknown: {
    backgroundColor: "#475569",
  },
  separator: {
    height: 1,
    backgroundColor: "#1e293b",
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "500",
  },
  emptyHint: {
    color: "#475569",
    fontSize: 13,
    marginTop: 6,
  },
  addButton: {
    width: "100%",
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
    marginTop: 16,
  },
  addButtonPressed: {
    backgroundColor: "#16a34a",
    transform: [{ scale: 0.98 }],
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
