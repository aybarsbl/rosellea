import { requireNativeModule } from "expo";
import { Platform } from "react-native";

type ExpoDirectSmsModuleType = {
  sendDirectSms(phone: string, message: string): Promise<void>;
  hasSmsPermission(): Promise<boolean>;
  requestSmsPermission(): Promise<boolean>;
};

// Modül web/iOS'ta yok — orada çağrılırsa anlamlı bir hata fırlat.
const stub: ExpoDirectSmsModuleType = {
  async sendDirectSms() {
    throw new Error(
      "ExpoDirectSms sadece Android'de çalışır. Bu platformda SMS gönderilemez.",
    );
  },
  async hasSmsPermission() {
    return false;
  },
  async requestSmsPermission() {
    return false;
  },
};

const native: ExpoDirectSmsModuleType =
  Platform.OS === "android"
    ? (requireNativeModule(
        "ExpoDirectSms",
      ) as unknown as ExpoDirectSmsModuleType)
    : stub;

export async function sendDirectSms(
  phone: string,
  message: string,
): Promise<void> {
  return native.sendDirectSms(phone, message);
}

export async function hasSmsPermission(): Promise<boolean> {
  return native.hasSmsPermission();
}

export async function requestSmsPermission(): Promise<boolean> {
  return native.requestSmsPermission();
}

export default {
  sendDirectSms,
  hasSmsPermission,
  requestSmsPermission,
};
