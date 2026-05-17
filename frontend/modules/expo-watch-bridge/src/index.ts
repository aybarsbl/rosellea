import { requireNativeModule } from "expo";
import { Platform } from "react-native";

export type BpmEventPayload = {
  heart_rate: number;
  on_wrist: boolean;
  accuracy: string;
  timestamp: number;
  device_id: string;
};

export type Subscription = { remove: () => void };

type NativeShape = {
  setTargets(hosts: string[], port: number): Promise<void>;
  getTargets(): Promise<string[]>;
  addListener(
    event: "onBpm",
    cb: (e: BpmEventPayload) => void,
  ): Subscription;
};

const stub: NativeShape = {
  async setTargets() {
    return;
  },
  async getTargets() {
    return [];
  },
  addListener() {
    return { remove: () => undefined };
  },
};

export const ExpoWatchBridge: NativeShape =
  Platform.OS === "android"
    ? (requireNativeModule("ExpoWatchBridge") as unknown as NativeShape)
    : stub;

export function addBpmListener(cb: (e: BpmEventPayload) => void): Subscription {
  return ExpoWatchBridge.addListener("onBpm", cb);
}

export default ExpoWatchBridge;
