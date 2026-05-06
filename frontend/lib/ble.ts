import { PermissionsAndroid, Platform } from "react-native";
import {
  BLE_CHAR_IP_UUID,
  BLE_CHAR_SCAN_UUID,
  BLE_CHAR_STATUS_UUID,
  BLE_CHAR_WIFI_UUID,
  BLE_DEVICE_NAME_PREFIX,
  BLE_SERVICE_UUID,
  WifiNetwork,
} from "./bleProtocol";

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi?: number;
};

export type ProvisioningResult = {
  ip: string;
};

export interface BleProvisioner {
  scan(timeoutMs?: number): Promise<DiscoveredDevice[]>;
  connect(deviceId: string): Promise<void>;
  scanWifi(timeoutMs?: number): Promise<WifiNetwork[]>;
  sendWifi(ssid: string, password: string): Promise<void>;
  awaitIp(timeoutMs?: number): Promise<ProvisioningResult>;
  disconnect(): Promise<void>;
}

class MockBleProvisioner implements BleProvisioner {
  private connectedId: string | null = null;
  private wifiSent = false;

  async scan(timeoutMs = 2000): Promise<DiscoveredDevice[]> {
    await delay(timeoutMs);
    return [{ id: "mock-rosellea-a1b2", name: "Rosellea-A1B2", rssi: -52 }];
  }

  async connect(deviceId: string): Promise<void> {
    await delay(800);
    this.connectedId = deviceId;
  }

  async scanWifi(timeoutMs = 1500): Promise<WifiNetwork[]> {
    if (!this.connectedId) throw new Error("Önce robota bağlanın.");
    await delay(timeoutMs);
    return [
      { ssid: "Ev_Wifi", signal: 82, secure: true },
      { ssid: "Ev_Wifi_5G", signal: 64, secure: true },
      { ssid: "Misafir", signal: 48, secure: false },
      { ssid: "TP-Link_2A4F", signal: 31, secure: true },
    ];
  }

  async sendWifi(ssid: string, password: string): Promise<void> {
    if (!this.connectedId) throw new Error("Önce robota bağlanın.");
    if (!ssid) throw new Error("Wi-Fi adı zorunlu.");
    await delay(500);
    this.wifiSent = true;
  }

  async awaitIp(timeoutMs = 3000): Promise<ProvisioningResult> {
    if (!this.wifiSent) throw new Error("Wi-Fi bilgileri gönderilmedi.");
    await delay(timeoutMs);
    return { ip: "127.0.0.1" };
  }

  async disconnect(): Promise<void> {
    await delay(200);
    this.connectedId = null;
    this.wifiSent = false;
  }
}

class RealBleProvisioner implements BleProvisioner {
  private manager: any = null;
  private device: any = null;

  private getManager() {
    if (this.manager) return this.manager;
    const { BleManager } = require("react-native-ble-plx");
    this.manager = new BleManager();
    return this.manager;
  }

  private async ensurePermissions() {
    if (Platform.OS !== "android") return;
    const apiLevel = Platform.Version as number;
    const perms =
      apiLevel >= 31
        ? ([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ] as const)
        : ([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] as const);
    const granted = (await PermissionsAndroid.requestMultiple(
      perms as unknown as Parameters<
        typeof PermissionsAndroid.requestMultiple
      >[0],
    )) as Record<string, string>;
    const allGranted = perms.every(
      (p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED,
    );
    if (!allGranted) throw new Error("Bluetooth izinleri reddedildi.");
  }

  async scan(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
    await this.ensurePermissions();
    const manager = this.getManager();
    const found = new Map<string, DiscoveredDevice>();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        manager.stopDeviceScan();
        err ? reject(err) : resolve();
      };
      manager.startDeviceScan(
        [BLE_SERVICE_UUID],
        null,
        (error: any, device: any) => {
          if (error) {
            finish(error);
            return;
          }
          if (!device?.id) return;
          const name = device.name ?? device.localName ?? "";
          if (!name.startsWith(BLE_DEVICE_NAME_PREFIX)) return;
          found.set(device.id, {
            id: device.id,
            name,
            rssi: device.rssi ?? undefined,
          });
        },
      );
      setTimeout(() => finish(), timeoutMs);
    });

    return Array.from(found.values());
  }

  async connect(deviceId: string): Promise<void> {
    const manager = this.getManager();
    this.device = await manager.connectToDevice(deviceId, { timeout: 10000 });
    await this.device.discoverAllServicesAndCharacteristics();
    try {
      await this.device.requestMTU(256);
    } catch {
      // bazı cihazlar desteklemez
    }
  }

  async scanWifi(timeoutMs = 20000): Promise<WifiNetwork[]> {
    if (!this.device) throw new Error("Önce robota bağlanın.");
    const device = this.device;
    return new Promise((resolve, reject) => {
      let settled = false;
      let subscription: any = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (err: Error | null, result?: WifiNetwork[]) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        subscription?.remove?.();
        if (err) reject(err);
        else resolve(result ?? []);
      };

      // Pi tarama sonucunu SCAN karakteristiğine yazıyor; payload BLE notify
      // MTU sınırına takılıyor (1.5KB+ vs ~250B), bu yüzden notify'ı kullanmak
      // yerine STATUS "idle"a düşünce SCAN'i Read ediyoruz — Read otomatik
      // chunk'lanır ve tam payload'ı getirir.
      const tryReadResult = async (): Promise<boolean> => {
        try {
          console.log("[scanWifi] reading SCAN characteristic...");
          const ch = await device.readCharacteristicForService(
            BLE_SERVICE_UUID,
            BLE_CHAR_SCAN_UUID,
          );
          const value: string | null = ch?.value ?? null;
          console.log("[scanWifi] read raw base64 length:", value?.length ?? 0);
          if (!value) return false;
          const text = fromBase64(value);
          console.log(
            "[scanWifi] decoded text length:",
            text.length,
            "preview:",
            text.slice(0, 80),
          );
          const parsed = JSON.parse(text);
          if (parsed === null) {
            console.log("[scanWifi] sentinel null, waiting...");
            return false;
          }
          if (!Array.isArray(parsed)) {
            finish(new Error("Tarama verisi geçersiz."));
            return true;
          }
          const networks = parsed
            .filter(
              (n): n is { ssid: string; signal?: number; secure?: boolean } =>
                !!n &&
                typeof n === "object" &&
                typeof (n as any).ssid === "string",
            )
            .map((n) => ({
              ssid: n.ssid,
              signal: typeof n.signal === "number" ? n.signal : 0,
              secure: typeof n.secure === "boolean" ? n.secure : true,
            }));
          finish(null, networks);
          return true;
        } catch {
          return false;
        }
      };

      subscription = device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_STATUS_UUID,
        async (error: any, characteristic: any) => {
          if (settled) return;
          if (error) {
            console.log("[scanWifi] STATUS monitor error:", error?.message ?? error);
            return finish(error);
          }
          const raw: string | null = characteristic?.value ?? null;
          if (!raw) return;
          const status = fromBase64(raw).trim();
          console.log("[scanWifi] STATUS notify:", status);
          if (status === "idle") {
            await tryReadResult();
          }
        },
      );

      console.log("[scanWifi] writing trigger to SCAN char...");
      device
        .writeCharacteristicWithResponseForService(
          BLE_SERVICE_UUID,
          BLE_CHAR_SCAN_UUID,
          toBase64(""),
        )
        .then(() => console.log("[scanWifi] trigger write ok"))
        .catch((err: any) => {
          console.log("[scanWifi] trigger write FAILED:", err?.message ?? err);
          finish(err);
        });

      timer = setTimeout(() => {
        console.log("[scanWifi] TIMEOUT (no idle status received within window)");
        finish(new Error("Wi-Fi taraması zaman aşımına uğradı."));
      }, timeoutMs);
    });
  }

  async sendWifi(ssid: string, password: string): Promise<void> {
    if (!this.device) throw new Error("Önce robota bağlanın.");
    if (!ssid) throw new Error("Wi-Fi adı zorunlu.");
    const payload = JSON.stringify({ ssid, password });
    const base64 = toBase64(payload);
    await this.device.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHAR_WIFI_UUID,
      base64,
    );
  }

  async awaitIp(timeoutMs = 30000): Promise<ProvisioningResult> {
    if (!this.device) throw new Error("Bağlantı yok.");
    return new Promise((resolve, reject) => {
      let settled = false;
      const subscription = this.device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_IP_UUID,
        (error: any, characteristic: any) => {
          if (settled) return;
          if (error) {
            settled = true;
            reject(error);
            return;
          }
          const value: string | null = characteristic?.value ?? null;
          if (!value) return;
          const ip = fromBase64(value).trim();
          if (!ip) return;
          settled = true;
          subscription?.remove?.();
          resolve({ ip });
        },
      );
      setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription?.remove?.();
        reject(new Error("IP bilgisi zaman aşımına uğradı."));
      }, timeoutMs);
    });
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch {
        // already disconnected
      }
      this.device = null;
    }
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toBase64(input: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(unescape(encodeURIComponent(input)));
  }
  // fallback: react-native global Buffer
  const Buffer = (globalThis as any).Buffer ?? require("buffer").Buffer;
  return Buffer.from(input, "utf-8").toString("base64");
}

function fromBase64(input: string): string {
  if (typeof globalThis.atob === "function") {
    return decodeURIComponent(escape(globalThis.atob(input)));
  }
  const Buffer = (globalThis as any).Buffer ?? require("buffer").Buffer;
  return Buffer.from(input, "base64").toString("utf-8");
}

function pickProvisioner(): BleProvisioner {
  if (Platform.OS === "web") return new MockBleProvisioner();
  try {
    const { BleManager } = require("react-native-ble-plx");
    // BleManager native module yoksa (Expo Go) constructor anında patlar.
    new BleManager().destroy();
    return new RealBleProvisioner();
  } catch {
    return new MockBleProvisioner();
  }
}

export const provisioner: BleProvisioner = pickProvisioner();
