export const BLE_SERVICE_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b7c";
export const BLE_CHAR_WIFI_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b71";
export const BLE_CHAR_STATUS_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b72";
export const BLE_CHAR_IP_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b73";

export const BLE_DEVICE_NAME_PREFIX = "Rosellea";

export type ProvisioningStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "failed";
