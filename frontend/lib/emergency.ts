import {
  addEmergencyListener,
  EmergencyEventPayload,
  ExpoEmergencyService,
} from "../modules/expo-emergency-service/src";
import {
  hasSmsPermission,
  requestSmsPermission,
  sendDirectSms,
} from "../modules/expo-direct-sms/src";
import { Linking, Platform } from "react-native";
import { Contact } from "./envTypes";
import { postEmergencyCancel, postEmergencySent } from "./api";

const PORT = 8000;

type Listener = (e: EmergencyEventPayload) => void;
const listeners = new Set<Listener>();
let nativeSubscription: { remove: () => void } | null = null;
let currentHost: string | null = null;

function fanout(e: EmergencyEventPayload) {
  for (const l of Array.from(listeners)) {
    try {
      l(e);
    } catch (err) {
      // bir dinleyici patlarsa diğerlerini etkilemesin
      console.warn("[emergency] listener hatası:", err);
    }
  }
}

function ensureNativeSubscription() {
  if (nativeSubscription) return;
  nativeSubscription = addEmergencyListener((e) => fanout(e));
}

export async function startMonitoring(
  host: string,
  robotName: string = "",
): Promise<void> {
  if (Platform.OS !== "android") {
    // Web/iOS — sadece JS-only fallback (gelişmiş özellik yok)
    return;
  }
  ensureNativeSubscription();
  currentHost = host;
  await ExpoEmergencyService.start(host, PORT, robotName);
}

export async function stopMonitoring(): Promise<void> {
  if (Platform.OS !== "android") return;
  await ExpoEmergencyService.stop();
  currentHost = null;
}

export async function isMonitoring(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return ExpoEmergencyService.isRunning();
}

export function getMonitoredHost(): string | null {
  return currentHost;
}

export function subscribe(cb: Listener): () => void {
  ensureNativeSubscription();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function cancelEmergency(host: string): Promise<void> {
  await postEmergencyCancel(host, "app");
}

// Kullanıcı izni vermediyse, dialog çıkar ve sonucu max 30 saniye bekle.
async function ensureSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (await hasSmsPermission()) return true;
  await requestSmsPermission();
  // Native modül dialog'u açtı, sonucu polling ile öğreniriz.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await hasSmsPermission()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function fireSms(
  host: string,
  contacts: Contact[],
  template: string,
): Promise<number> {
  if (Platform.OS !== "android") {
    throw new Error("SMS gönderimi sadece Android'de destekleniyor.");
  }
  const targets = contacts
    .map((c) => ({ name: (c.name ?? "").trim(), phone: (c.phone ?? "").trim() }))
    .filter((c) => c.phone.length > 0);
  if (targets.length === 0) {
    await postEmergencySent(host, 0).catch(() => undefined);
    return 0;
  }

  const ok = await ensureSmsPermission();
  if (!ok) {
    // İzin yoksa kullanıcıyı uygulama ayarlarına yönlendirmesi için
    // çağıran taraf Linking.openSettings() çağırabilir; biz sadece istisna.
    const err: any = new Error("SMS izni reddedildi. Ayarlardan SMS iznini ver.");
    err.code = "E_SMS_PERMISSION_DENIED";
    throw err;
  }

  let success = 0;
  for (const t of targets) {
    try {
      await sendDirectSms(t.phone, template);
      success += 1;
    } catch (e) {
      console.warn(`[emergency] SMS hata ${t.name} ${t.phone}:`, e);
    }
  }
  try {
    await postEmergencySent(host, success);
  } catch (e) {
    console.warn("[emergency] /emergency/sent bildirimi başarısız:", e);
  }
  return success;
}

export async function openAppSettings() {
  try {
    await Linking.openSettings();
  } catch {
    // ignore
  }
}

export type { EmergencyEventPayload } from "../modules/expo-emergency-service/src";
