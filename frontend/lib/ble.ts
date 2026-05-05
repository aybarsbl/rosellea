import { PermissionsAndroid, Platform } from "react-native";
import {
  BLE_CHAR_IP_UUID,
  BLE_CHAR_STATUS_UUID,
  BLE_CHAR_WIFI_UUID,
  BLE_DEVICE_NAME_PREFIX,
  BLE_SERVICE_UUID,
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

  async sendWifi(ssid: string, password: string): Promise<void> {
    if (!this.connectedId) throw new Error("Önce robota bağlanın.");
    if (!ssid || !password) throw new Error("Wi-Fi adı ve parola zorunlu.");
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

  async sendWifi(ssid: string, password: string): Promise<void> {
    if (!this.device) throw new Error("Önce robota bağlanın.");
    if (!ssid || !password) throw new Error("Wi-Fi adı ve parola zorunlu.");
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
