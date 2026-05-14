import AsyncStorage from "@react-native-async-storage/async-storage";
import { Contact } from "./envTypes";

const PERSIST_KEY = "rosellea.emergency.context";

// Acil durum modali, kullanıcının açık olduğu robot'a ait host'u ve son
// alınmış env içerisindeki kişileri/şablonu bilmek zorunda. RobotDetail ekranı
// monitoring'i başlatırken bu store'a yazıyor; emergency.tsx route param'ına
// güvenmiyor çünkü background notification'dan açıldığında param gelmez.
//
// Bilinçli olarak ufak bir abone listesi kullanıyoruz — React Context bu
// dosyayı _layout dışındaki tüm route'larda yeniden render gerektirir, ama
// store React tree'sinden bağımsız.

type State = {
  host: string | null;
  robotName: string;
  contacts: Contact[];
  smsTemplate: string;
  countdownS: number;
  threshold: number;
};

const state: State = {
  host: null,
  robotName: "",
  contacts: [],
  smsTemplate: "ACIL DURUM: Rosellea ev içinde duman algıladı. Lütfen kontrol edin.",
  countdownS: 10,
  threshold: 18000,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function setMonitoringContext(patch: Partial<State>) {
  Object.assign(state, patch);
  for (const l of Array.from(listeners)) l();
  AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(state)).catch(() => undefined);
}

export async function hydrateMonitoringContext(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(state, parsed);
      for (const l of Array.from(listeners)) l();
    }
  } catch {
    // ignore
  }
}

export function getMonitoringContext(): Readonly<State> {
  return state;
}

export function subscribeContext(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
