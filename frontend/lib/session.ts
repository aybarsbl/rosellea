import { DiscoveredDevice } from "./ble";

type ProvisioningSession = {
  device: DiscoveredDevice | null;
  ip: string | null;
};

const empty = (): ProvisioningSession => ({
  device: null,
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

export function setIp(ip: string) {
  current.ip = ip;
}
