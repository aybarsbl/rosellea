import { DiscoveredDevice } from "./ble";

type ProvisioningSession = {
  device: DiscoveredDevice | null;
  ssid: string;
  password: string;
  ip: string | null;
};

const empty = (): ProvisioningSession => ({
  device: null,
  ssid: "",
  password: "",
  ip: null,
});

let current: ProvisioningSession = empty();

export function resetSession() {
  current = empty();
}

export function getSession(): ProvisioningSession {
  return current;
}

export function setDevice(device: DiscoveredDevice) {
  current.device = device;
}

export function setWifi(ssid: string, password: string) {
  current.ssid = ssid;
  current.password = password;
}

export function setIp(ip: string) {
  current.ip = ip;
}
