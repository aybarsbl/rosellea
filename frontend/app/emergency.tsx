import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getEmergency } from "../lib/api";
import {
  cancelEmergency,
  fireSms,
  openAppSettings,
  subscribe,
} from "../lib/emergency";
import {
  getMonitoringContext,
  isEmergencyOnCooldown,
  markEmergencySent,
  pickSmsTemplate,
  subscribeContext,
} from "../lib/emergencyStore";

type Phase =
  | "armed"
  | "cancelling"
  | "cancelled"
  | "fired"
  | "sending"
  | "sent"
  | "error";

export default function EmergencyScreen() {
  const router = useRouter();
  const [ctx, setCtx] = useState(getMonitoringContext());
  const [phase, setPhase] = useState<Phase>("armed");
  const [secondsLeft, setSecondsLeft] = useState<number>(ctx.countdownS || 10);
  const [info, setInfo] = useState<string>("");
  const [sentCount, setSentCount] = useState<number>(0);
  const [cancelSource, setCancelSource] = useState<string>("");
  const [emergencySource, setEmergencySource] = useState<string>("smoke");
  const startedAtRef = useRef<number>(Date.now() / 1000);
  const countdownRef = useRef<number>(ctx.countdownS || 10);
  const phaseRef = useRef<Phase>("armed");
  const smsLaunchedRef = useRef(false);

  // Store değişimlerini yansıt
  useEffect(() => {
    const unsub = subscribeContext(() => setCtx(getMonitoringContext()));
    return () => unsub();
  }, []);

  // Modal açıldığında ilk snapshot'ı çek — kullanıcı bildirimle direkt buraya
  // gelmiş olabilir, store boş kalmış olabilir.
  useEffect(() => {
    const host = ctx.host;
    if (!host) return;
    let cancelled = false;
    getEmergency(host)
      .then((snap) => {
        if (cancelled) return;
        if (snap.countdown_s > 0) {
          countdownRef.current = snap.countdown_s;
        }
        if (snap.started_at > 0) {
          startedAtRef.current = snap.started_at;
        }
        if ((snap as any).source) {
          setEmergencySource((snap as any).source);
        }
        if (snap.state === "fired" || snap.state === "sent") {
          setPhase(snap.state === "sent" ? "sent" : "fired");
          phaseRef.current = snap.state === "sent" ? "sent" : "fired";
        }
        if (snap.state === "cancelled") {
          setPhase("cancelled");
          phaseRef.current = "cancelled";
        }
      })
      .catch(() => {
        // backend offline — local timer'a güveniyoruz
      });
    return () => {
      cancelled = true;
    };
  }, [ctx.host]);

  // Vibration on mount (acil durum hissi).
  useEffect(() => {
    try {
      Vibration.vibrate([0, 800, 400, 800], true);
    } catch {
      // ignore
    }
    return () => {
      try {
        Vibration.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  // SSE event listener — backend cancel/fired/sent gelirse state güncelle.
  useEffect(() => {
    const unsub = subscribe((e) => {
      if (e.type === "emergency.armed") {
        // SSE reconnect'lerde aynı started_at ile tekrar gelen armed event
        // countdown'ı resetlemesin — kullanıcı için modal "yeniden açılmış"
        // gibi gözüküyor.
        const at = e.started_at ?? 0;
        if (at && at === startedAtRef.current) return;
        if (e.countdown_s) countdownRef.current = e.countdown_s;
        if (e.started_at) startedAtRef.current = e.started_at;
        if ((e as any).source) setEmergencySource((e as any).source);
        phaseRef.current = "armed";
        setPhase("armed");
      } else if (e.type === "emergency.cancelled") {
        setCancelSource(e.source || "");
        phaseRef.current = "cancelled";
        setPhase("cancelled");
        setInfo(
          e.source === "voice" ? "Ses ile iptal edildi." : "Uygulamadan iptal edildi.",
        );
        setTimeout(() => router.back(), 2000);
      } else if (e.type === "emergency.fired") {
        phaseRef.current = "fired";
        setPhase("fired");
      } else if (e.type === "emergency.sent") {
        phaseRef.current = "sent";
        setPhase("sent");
        if (typeof e.count === "number") setSentCount(e.count);
        setInfo("SMS gönderildi. Modal birazdan kapanacak.");
        setTimeout(() => router.back(), 4000);
      } else if (e.type === "emergency.idle") {
        if (phaseRef.current === "cancelled" || phaseRef.current === "sent") {
          // zaten kapanıyor
          return;
        }
        router.back();
      }
    });
    return () => unsub();
  }, [router]);

  // Local timer — backend sinyali kaybolsa bile sayaç asla durmasın.
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== "armed") return;
      const elapsed = Date.now() / 1000 - startedAtRef.current;
      const left = Math.max(0, Math.ceil(countdownRef.current - elapsed));
      setSecondsLeft(left);
      if (left <= 0 && phaseRef.current === "armed") {
        // Backend "fired" event'ini yollamış olmalı, ama timeout olduysa
        // kendimiz "fired" gibi davranıp SMS göndermeye başlayalım.
        phaseRef.current = "fired";
        setPhase("fired");
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  // fired olunca SMS'i otomatik fırlat — yalnızca bir kez.
  useEffect(() => {
    if (phase !== "fired") return;
    if (smsLaunchedRef.current) return;
    smsLaunchedRef.current = true;
    // Modal yeniden açılırsa smsLaunchedRef sıfırlanır; kalıcı 5 dk guard.
    if (isEmergencyOnCooldown()) {
      setPhase("sent");
      setInfo("Acil durum az önce gönderildi, 5 dakika içinde tekrar gönderilmedi.");
      setTimeout(() => router.back(), 3000);
      return;
    }
    const host = ctx.host;
    if (!host) {
      setPhase("error");
      setInfo("Robot bağlantı bilgisi yok, SMS gönderilemedi.");
      return;
    }
    setPhase("sending");
    const template = pickSmsTemplate(emergencySource);
    fireSms(host, ctx.contacts, template)
      .then((count) => {
        setSentCount(count);
        if (count > 0) {
          void markEmergencySent();
          setPhase("sent");
          setInfo(`${count} kişiye SMS gönderildi.`);
          setTimeout(() => router.back(), 4000);
        } else {
          setPhase("error");
          setInfo("Bağlı kişi yok veya SMS gönderilemedi.");
        }
      })
      .catch((err: any) => {
        if (err?.code === "E_SMS_PERMISSION_DENIED") {
          setPhase("error");
          setInfo("SMS izni yok. Ayarlardan SMS iznini etkinleştir.");
          Alert.alert(
            "SMS izni gerekli",
            "Acil durum SMS'lerini gönderebilmek için uygulamaya SMS izni vermeniz gerekiyor.",
            [
              { text: "Tamam" },
              { text: "Ayarları Aç", onPress: () => openAppSettings() },
            ],
          );
        } else {
          setPhase("error");
          setInfo(`SMS hatası: ${err?.message ?? "bilinmeyen"}`);
        }
      });
  }, [phase, ctx.host, ctx.contacts, ctx.smsTemplate, ctx.smsTemplateHeartRate, emergencySource, router]);

  const handleCancel = useCallback(async () => {
    const host = ctx.host;
    if (!host || phase !== "armed") return;
    setPhase("cancelling");
    try {
      await cancelEmergency(host);
      // Sonuç SSE'den `emergency.cancelled` olarak gelecek; ama backend
      // ulaşılamazsa local olarak da iptal et.
    } catch (e: any) {
      // Backend'e ulaşılamadıysa kullanıcı yine de yangının iptal olduğunu
      // bilsin — modalı kapat, ancak Pi 10s'den önce duyarsa anonsu kesmez.
      Alert.alert(
        "İptal başarısız",
        "Robota bağlanılamadı. Robotunun yanına git ve 'İptal' diye seslen.",
      );
      setPhase("armed");
    }
  }, [ctx.host, phase]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <Text style={styles.title}>ACİL DURUM</Text>
        <Text style={styles.subtitle}>
          {emergencySource === "heart_rate"
            ? "Kalp ritmi anomalisi"
            : "Duman algılandı"}
        </Text>

        {(phase === "armed" || phase === "cancelling") && (
          <>
            <Text style={styles.countdownLabel}>Geri Sayım</Text>
            <Text style={styles.countdown}>{secondsLeft}</Text>
            <Text style={styles.hint}>
              "İptal" diye seslen ya da aşağıdaki butonu kullan.
            </Text>
            <Pressable
              onPress={handleCancel}
              disabled={phase !== "armed"}
              style={({ pressed }) => [
                styles.cancelButton,
                (pressed || phase !== "armed") && styles.cancelButtonPressed,
              ]}
            >
              <Text style={styles.cancelText}>İPTAL ET</Text>
            </Pressable>
          </>
        )}

        {phase === "cancelled" && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultTitle}>İPTAL EDİLDİ</Text>
            <Text style={styles.resultBody}>
              {cancelSource === "voice"
                ? "Ses ile iptal edildi."
                : "Uygulamadan iptal edildi."}
            </Text>
          </View>
        )}

        {(phase === "fired" || phase === "sending") && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultTitle}>SMS GÖNDERİLİYOR</Text>
            <Text style={styles.resultBody}>
              Bağlı kişilere acil durum SMS'i iletiliyor...
            </Text>
          </View>
        )}

        {phase === "sent" && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultTitleOk}>SMS GÖNDERİLDİ</Text>
            <Text style={styles.resultBody}>
              {sentCount} kişiye ulaşıldı.
            </Text>
            {info ? <Text style={styles.info}>{info}</Text> : null}
          </View>
        )}

        {phase === "error" && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultTitleWarn}>HATA</Text>
            <Text style={styles.resultBody}>{info}</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryText}>Kapat</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#7f1d1d" },
  body: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  title: { color: "#ffffff", fontSize: 48, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: "#fecaca", fontSize: 18, fontWeight: "600", marginTop: 8 },
  countdownLabel: { color: "#fecaca", fontSize: 14, marginTop: 36, letterSpacing: 1 },
  countdown: {
    color: "#ffffff",
    fontSize: 144,
    fontWeight: "900",
    lineHeight: 156,
    marginTop: 8,
  },
  hint: { color: "#fecaca", fontSize: 14, marginTop: 8, textAlign: "center" },
  cancelButton: {
    marginTop: 32,
    backgroundColor: "#ffffff",
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 999,
    minWidth: 240,
    alignItems: "center",
  },
  cancelButtonPressed: { opacity: 0.7 },
  cancelText: { color: "#7f1d1d", fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  resultBlock: {
    marginTop: 36,
    alignItems: "center",
    gap: 8,
  },
  resultTitle: { color: "#ffffff", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  resultTitleOk: { color: "#bbf7d0", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  resultTitleWarn: { color: "#fde68a", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  resultBody: { color: "#ffffff", fontSize: 16, textAlign: "center", marginTop: 8 },
  info: { color: "#fecaca", fontSize: 13, marginTop: 8 },
  secondaryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  secondaryText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
