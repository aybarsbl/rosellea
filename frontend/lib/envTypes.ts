export type Contact = { name: string; phone: string };

export type EnvOptions = Record<string, string>;

export type SafetyConfig = {
  enabled: boolean;
  threshold: number;
  countdown_s: number;
  sms_template: string;
};
