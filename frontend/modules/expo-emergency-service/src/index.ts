import { requireNativeModule } from "expo";
import { Platform } from "react-native";

export type EmergencyEventPayload = {
  type:
    | "emergency.armed"
    | "emergency.cancelled"
    | "emergency.fired"
    | "emergency.sent"
    | "emergency.idle"
    | "emergency.snapshot"
    | "connection.open"
    | "connection.lost";
  raw?: number;
  threshold?: number;
  countdown_s?: number;
  started_at?: number;
  fired_at?: number;
  source?: string;
  count?: number;
  state?: string;
  ts?: number;
  phase?: string;
};

export type Subscription = { remove: () => void };

type NativeShape = {
  start(host: string, port: number, robotName: string): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  addListener(
    event: "onEmergencyEvent",
    cb: (e: EmergencyEventPayload) => void,
  ): Subscription;
};

const stub: NativeShape = {
  async start() {
    throw new Error(
      "ExpoEmergencyService sadece Android'de çalışır. Bu platformda izleyici başlatılamaz.",
    );
  },
  async stop() {
    return;
  },
  async isRunning() {
    return false;
  },
  addListener() {
    return { remove: () => undefined };
  },
};

export const ExpoEmergencyService: NativeShape =
  Platform.OS === "android"
    ? (requireNativeModule("ExpoEmergencyService") as unknown as NativeShape)
    : stub;

export function addEmergencyListener(
  cb: (e: EmergencyEventPayload) => void,
): Subscription {
  return ExpoEmergencyService.addListener("onEmergencyEvent", cb);
}

export default ExpoEmergencyService;
