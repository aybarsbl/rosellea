import { WifiNetwork } from "./bleProtocol";

const PORT = 8000;

export type Health = {
  name: string;
  version: string;
  setup_completed: boolean;
};

export type EnvPatch = {
  key: string;
  value: unknown;
};

export type WifiScanResponse = {
  current: string | null;
  networks: WifiNetwork[];
};

function url(host: string, path: string) {
  return `http://${host}:${PORT}${path}`;
}

export async function getHealth(host: string): Promise<Health> {
  const res = await fetch(url(host, "/health"));
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getEnv(host: string): Promise<Record<string, unknown>> {
  const res = await fetch(url(host, "/env"));
  if (!res.ok) throw new Error(`GET /env failed: ${res.status}`);
  return res.json();
}

export async function patchEnv(host: string, patch: EnvPatch): Promise<void> {
  const res = await fetch(url(host, "/env"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH /env failed: ${res.status}`);
}

export async function patchEnvBulk(
  host: string,
  patches: EnvPatch[],
): Promise<void> {
  for (const p of patches) {
    await patchEnv(host, p);
  }
}

export async function postSetupComplete(host: string): Promise<void> {
  const res = await fetch(url(host, "/setup/complete"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /setup/complete failed: ${res.status}`);
}

export async function postReset(host: string): Promise<void> {
  const res = await fetch(url(host, "/reset"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /reset failed: ${res.status}`);
}

export async function postRestart(host: string): Promise<void> {
  const res = await fetch(url(host, "/restart"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /restart failed: ${res.status}`);
}

export async function waitForHealth(
  host: string,
  timeoutMs: number = 60000,
  intervalMs: number = 1000,
): Promise<Health> {
  const deadline = Date.now() + timeoutMs;
  // Respawn sırasında uvicorn kısa bir süre kapalı kalır; sonra geri gelir.
  // Önce ilk hatanın geçmesini bekle ki cache'lenmiş "Bağlı" durumu eski
  // süreci yansıtmasın.
  await new Promise((r) => setTimeout(r, 1500));
  while (Date.now() < deadline) {
    try {
      const h = await getHealth(host);
      return h;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error("Robot yeniden aktif olmadı.");
}

export type EmergencySnapshot = {
  state: "idle" | "armed" | "cancelled" | "fired" | "sent";
  raw: number;
  threshold: number;
  started_at: number;
  fired_at: number;
  countdown_s: number;
  sent_count: number;
};

export async function getEmergency(host: string): Promise<EmergencySnapshot> {
  const res = await fetch(url(host, "/emergency"));
  if (!res.ok) throw new Error(`GET /emergency failed: ${res.status}`);
  return res.json();
}

export async function postEmergencyCancel(
  host: string,
  source: string = "app",
): Promise<void> {
  const res = await fetch(url(host, "/emergency/cancel"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.detail ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `POST /emergency/cancel failed: ${res.status}`);
  }
}

export async function postEmergencySent(
  host: string,
  count: number,
): Promise<void> {
  const res = await fetch(url(host, "/emergency/sent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.detail ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `POST /emergency/sent failed: ${res.status}`);
  }
}

export async function postEmergencyTest(host: string): Promise<void> {
  const res = await fetch(url(host, "/emergency/test"), { method: "POST" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.detail ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `POST /emergency/test failed: ${res.status}`);
  }
}

export type HeartRateSample = {
  ts: number;
  bpm: number;
  on_wrist: boolean;
  accuracy: string;
  age_s: number;
};

export type HeartRateSnapshot = {
  device_id: string;
  samples: number;
  last: HeartRateSample | null;
  enabled: boolean;
  low_bpm: number;
  high_bpm: number;
};

export async function getHeartRate(host: string): Promise<HeartRateSnapshot> {
  const res = await fetch(url(host, "/vitals/heart_rate"));
  if (!res.ok) throw new Error(`GET /vitals/heart_rate failed: ${res.status}`);
  return res.json();
}

export async function getWifiScan(host: string): Promise<WifiScanResponse> {
  const res = await fetch(url(host, "/wifi/scan"));
  if (!res.ok) throw new Error(`GET /wifi/scan failed: ${res.status}`);
  return res.json();
}

export async function postWifiConnect(
  host: string,
  ssid: string,
  password: string,
): Promise<{ ip: string }> {
  const res = await fetch(url(host, "/wifi/connect"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssid, password }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.detail ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `POST /wifi/connect failed: ${res.status}`);
  }
  return res.json();
}

export function getByPath(env: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = env;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as object)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
