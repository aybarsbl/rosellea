import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSession, setWifi } from "../../lib/session";

export default function WifiForm() {
  const router = useRouter();
  const session = getSession();
  const [ssid, setSsid] = useState(session.ssid);
  const [password, setPassword] = useState(session.password);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!ssid.trim() || !password.trim()) {
      setError("Wi-Fi adı ve parola zorunlu.");
      return;
    }
    setError(null);
    setWifi(ssid.trim(), password);
    router.push("/add/connecting");
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.body}>
        <Text style={styles.label}>
          Robot, bu Wi-Fi ağına bağlanacak. Telefonunla aynı ağı seç.
        </Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Wi-Fi Adı (SSID)</Text>
          <TextInput
            value={ssid}
            onChangeText={setSsid}
            placeholder="örn. Ev_WiFi"
            placeholderTextColor="#475569"
            style={[styles.input, { outline: "none" } as any]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

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

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={submit}
        >
          <Text style={styles.buttonText}>Devam</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  body: { flex: 1, padding: 16, gap: 16 },
  label: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
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
  error: { color: "#ef4444", fontSize: 13 },
  button: {
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: "auto",
  },
  buttonPressed: { backgroundColor: "#16a34a", transform: [{ scale: 0.98 }] },
  buttonText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
});
