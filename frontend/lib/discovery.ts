import { Platform } from "react-native";

export type DiscoveredService = {
  name: string;
  host: string;
  port: number;
};

const SERVICE_TYPE = "rosellea";
const PROTOCOL = "tcp";

let zeroconfModule: any = null;
let loadAttempted = false;

function loadZeroconf(): any {
  if (loadAttempted) return zeroconfModule;
  loadAttempted = true;
  if (Platform.OS === "web") return null;
  try {
    const Zeroconf = require("react-native-zeroconf").default;
    zeroconfModule = new Zeroconf();
    return zeroconfModule;
  } catch {
    return null;
  }
}

export async function scanRosellea(timeoutMs = 4000): Promise<DiscoveredService[]> {
  const zc = loadZeroconf();
  if (!zc) return [];

  const found = new Map<string, DiscoveredService>();

  return new Promise((resolve) => {
    const onResolved = (service: any) => {
      const host: string | undefined =
        service?.addresses?.[0] ?? service?.host;
      if (!host) return;
      const name: string =
        service?.txt?.name ?? service?.name ?? "Rosellea";
      const port: number = service?.port ?? 8000;
      found.set(service?.name ?? host, { name, host, port });
    };

    try {
      zc.on?.("resolved", onResolved);
      zc.scan?.(SERVICE_TYPE, PROTOCOL, "local.");
    } catch {
      resolve([]);
      return;
    }

    setTimeout(() => {
      try {
        zc.stop?.();
        zc.removeListener?.("resolved", onResolved);
      } catch {
        // ignore
      }
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}
