import Slider from "@react-native-community/slider";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getByPath,
  patchEnvBulk,
  postRestart,
  waitForHealth,
  EnvPatch,
} from "../lib/api";
import { Contact, EnvOptions } from "../lib/envTypes";
import { ContactsEditor } from "./ContactsEditor";
import { Dropdown } from "./Dropdown";

export type FieldKey =
  | "name"
  | "age"
  | "friendship"
  | "hobbies"
  | "health_notes"
  | "contacts"
  | "assistantModel"
  | "elabsModel"
  | "elabsOutput"
  | "elabsVoice"
  | "speakerVolume"
  | "micGain"
  | "safetyEnabled"
  | "smokeThreshold"
  | "smsTemplate"
  | "hrEnabled"
  | "hrLowBpm"
  | "hrHighBpm"
  | "hrLowSeconds"
  | "hrHighSeconds"
  | "hrSuddenChangeBpm"
  | "hrSuddenChangeWindowS"
  | "hrSmsTemplate";

type Props = {
  host: string;
  fields: FieldKey[];
  initial: Record<string, unknown>;
  saveLabel: string;
  onSaved?: () => void | Promise<void>;
  restartAfterSave?: boolean;
  onBeforeRestart?: () => void | Promise<void>;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asContactArray(v: unknown): Contact[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      name: asString(x.name),
      phone: asString(x.phone),
    }));
}

function asOptions(v: unknown): EnvOptions {
  if (!v || typeof v !== "object") return {};
  const out: EnvOptions = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function arrayEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RobotSettingsForm({
  host,
  fields,
  initial,
  saveLabel,
  onSaved,
  restartAfterSave = false,
  onBeforeRestart,
}: Props) {
  const has = (k: FieldKey) => fields.includes(k);

  const initialName = useMemo(() => asString(getByPath(initial, "user.name")), [initial]);
  const initialAge = useMemo(() => asNumber(getByPath(initial, "user.age")), [initial]);
  const initialFriendship = useMemo(
    () => asNumber(getByPath(initial, "user.friendship")) ?? 40,
    [initial],
  );
  const initialHobbies = useMemo(() => asStringArray(getByPath(initial, "user.hobbies")), [initial]);
  const initialNotes = useMemo(() => asStringArray(getByPath(initial, "user.health_notes")), [initial]);
  const initialContacts = useMemo(() => asContactArray(getByPath(initial, "user.contacts")), [initial]);
  const initialAssistantModel = useMemo(() => asString(getByPath(initial, "assistant.model")), [initial]);
  const initialElabsModel = useMemo(() => asString(getByPath(initial, "elabs.model")), [initial]);
  const initialElabsOutput = useMemo(() => asString(getByPath(initial, "elabs.output")), [initial]);
  const initialElabsVoice = useMemo(() => asString(getByPath(initial, "elabs.voice")), [initial]);
  const initialSpeakerVolume = useMemo(
    () => asNumber(getByPath(initial, "speaker.volume")) ?? 60,
    [initial],
  );
  const initialMicGain = useMemo(
    () => asNumber(getByPath(initial, "mic.gain")) ?? 75,
    [initial],
  );
  const initialSafetyEnabled = useMemo(
    () => {
      const v = getByPath(initial, "safety.smoke.enabled");
      return typeof v === "boolean" ? v : true;
    },
    [initial],
  );
  const initialSmokeThreshold = useMemo(
    () => asNumber(getByPath(initial, "safety.smoke.threshold")) ?? 18000,
    [initial],
  );
  const initialSmsTemplate = useMemo(
    () =>
      asString(getByPath(initial, "safety.smoke.sms_template")) ||
      "ACIL DURUM: Rosellea ev içinde duman algıladı. Lütfen kontrol edin.",
    [initial],
  );
  const initialHrEnabled = useMemo(
    () => {
      const v = getByPath(initial, "safety.heart_rate.enabled");
      return typeof v === "boolean" ? v : true;
    },
    [initial],
  );
  const initialHrLowBpm = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.low_threshold_bpm")) ?? 40,
    [initial],
  );
  const initialHrHighBpm = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.high_threshold_bpm")) ?? 130,
    [initial],
  );
  const initialHrLowSeconds = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.low_threshold_seconds")) ?? 15,
    [initial],
  );
  const initialHrHighSeconds = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.high_threshold_seconds")) ?? 30,
    [initial],
  );
  const initialHrSuddenChangeBpm = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.sudden_change_bpm")) ?? 30,
    [initial],
  );
  const initialHrSuddenChangeWindowS = useMemo(
    () => asNumber(getByPath(initial, "safety.heart_rate.sudden_change_window_s")) ?? 30,
    [initial],
  );
  const initialHrSmsTemplate = useMemo(
    () =>
      asString(getByPath(initial, "safety.heart_rate.sms_template")) ||
      "ACIL DURUM: Rosellea kalp ritmi anomalisi tespit etti. Lütfen kontrol edin.",
    [initial],
  );

  const assistantModelOptions = useMemo(() => asOptions(getByPath(initial, "openai.models")), [initial]);
  const elabsModelOptions = useMemo(() => asOptions(getByPath(initial, "elabs.models")), [initial]);
  const elabsOutputOptions = useMemo(() => asOptions(getByPath(initial, "elabs.outputs")), [initial]);
  const elabsVoiceOptions = useMemo(() => asOptions(getByPath(initial, "elabs.voices")), [initial]);

  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initialAge != null ? String(initialAge) : "");
  const [friendship, setFriendship] = useState(initialFriendship);
  const [hobbies, setHobbies] = useState(initialHobbies.join(", "));
  const [healthNotes, setHealthNotes] = useState(initialNotes.join(", "));
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [assistantModel, setAssistantModel] = useState(initialAssistantModel);
  const [elabsModel, setElabsModel] = useState(initialElabsModel);
  const [elabsOutput, setElabsOutput] = useState(initialElabsOutput);
  const [elabsVoice, setElabsVoice] = useState(initialElabsVoice);
  const [speakerVolume, setSpeakerVolume] = useState(initialSpeakerVolume);
  const [micGain, setMicGain] = useState(initialMicGain);
  const [safetyEnabled, setSafetyEnabled] = useState(initialSafetyEnabled);
  const [smokeThreshold, setSmokeThreshold] = useState(
    String(initialSmokeThreshold),
  );
  const [smsTemplate, setSmsTemplate] = useState(initialSmsTemplate);
  const [hrEnabled, setHrEnabled] = useState(initialHrEnabled);
  const [hrLowBpm, setHrLowBpm] = useState(String(initialHrLowBpm));
  const [hrHighBpm, setHrHighBpm] = useState(String(initialHrHighBpm));
  const [hrLowSeconds, setHrLowSeconds] = useState(String(initialHrLowSeconds));
  const [hrHighSeconds, setHrHighSeconds] = useState(String(initialHrHighSeconds));
  const [hrSuddenChangeBpm, setHrSuddenChangeBpm] = useState(
    String(initialHrSuddenChangeBpm),
  );
  const [hrSuddenChangeWindowS, setHrSuddenChangeWindowS] = useState(
    String(initialHrSuddenChangeWindowS),
  );
  const [hrSmsTemplate, setHrSmsTemplate] = useState(initialHrSmsTemplate);

  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);

    let ageNum: number | null = null;
    if (has("age")) {
      if (age.trim()) {
        const parsed = Number(age);
        if (Number.isNaN(parsed) || parsed < 0) {
          setError("Yaş geçerli bir sayı olmalı.");
          return;
        }
        ageNum = parsed;
      }
    }

    const hobbyList = hobbies
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const notesList = healthNotes
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const cleanContacts: Contact[] = contacts
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ name: c.name.trim(), phone: c.phone.trim() }));

    const patches: EnvPatch[] = [];

    if (has("name") && name.trim() !== initialName) {
      patches.push({ key: "user.name", value: name.trim() });
    }
    if (has("age") && ageNum !== initialAge) {
      patches.push({ key: "user.age", value: ageNum });
    }
    if (has("friendship") && friendship !== initialFriendship) {
      patches.push({ key: "user.friendship", value: friendship });
    }
    if (has("hobbies") && !arrayEq(hobbyList, initialHobbies)) {
      patches.push({ key: "user.hobbies", value: hobbyList });
    }
    if (has("health_notes") && !arrayEq(notesList, initialNotes)) {
      patches.push({ key: "user.health_notes", value: notesList });
    }
    if (has("contacts") && !arrayEq(cleanContacts, initialContacts)) {
      patches.push({ key: "user.contacts", value: cleanContacts });
    }
    if (has("assistantModel") && assistantModel && assistantModel !== initialAssistantModel) {
      patches.push({ key: "assistant.model", value: assistantModel });
    }
    if (has("elabsModel") && elabsModel && elabsModel !== initialElabsModel) {
      patches.push({ key: "elabs.model", value: elabsModel });
    }
    if (has("elabsOutput") && elabsOutput && elabsOutput !== initialElabsOutput) {
      patches.push({ key: "elabs.output", value: elabsOutput });
    }
    if (has("elabsVoice") && elabsVoice && elabsVoice !== initialElabsVoice) {
      patches.push({ key: "elabs.voice", value: elabsVoice });
    }
    if (has("speakerVolume") && speakerVolume !== initialSpeakerVolume) {
      patches.push({ key: "speaker.volume", value: speakerVolume });
    }
    if (has("micGain") && micGain !== initialMicGain) {
      patches.push({ key: "mic.gain", value: micGain });
    }
    if (has("safetyEnabled") && safetyEnabled !== initialSafetyEnabled) {
      patches.push({ key: "safety.smoke.enabled", value: safetyEnabled });
    }
    if (has("smokeThreshold")) {
      const parsed = Number(smokeThreshold);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed !== initialSmokeThreshold) {
        patches.push({ key: "safety.smoke.threshold", value: parsed });
      }
    }
    if (has("smsTemplate") && smsTemplate.trim() !== initialSmsTemplate) {
      patches.push({ key: "safety.smoke.sms_template", value: smsTemplate.trim() });
    }

    // Saatten gelen kalp ritmi anomali kuralı eşikleri. Min < Max kontrolünü
    // hem uygulanabilirlik hem de kullanıcı hatasını yakalamak için yapıyoruz.
    const parseHr = (raw: string, name: string, min = 1): number | null => {
      const n = Number(raw);
      if (Number.isNaN(n) || n < min) {
        setError(`${name} geçerli bir sayı olmalı.`);
        return null;
      }
      return n;
    };

    if (has("hrEnabled") && hrEnabled !== initialHrEnabled) {
      patches.push({ key: "safety.heart_rate.enabled", value: hrEnabled });
    }

    let hrLow: number | null = null;
    let hrHigh: number | null = null;
    if (has("hrLowBpm")) {
      hrLow = parseHr(hrLowBpm, "Min BPM", 20);
      if (hrLow === null) return;
    }
    if (has("hrHighBpm")) {
      hrHigh = parseHr(hrHighBpm, "Max BPM", 40);
      if (hrHigh === null) return;
    }
    if (hrLow !== null && hrHigh !== null && hrLow >= hrHigh) {
      setError("Min BPM, Max BPM'den küçük olmalı.");
      return;
    }
    if (hrLow !== null && hrLow !== initialHrLowBpm) {
      patches.push({ key: "safety.heart_rate.low_threshold_bpm", value: hrLow });
    }
    if (hrHigh !== null && hrHigh !== initialHrHighBpm) {
      patches.push({ key: "safety.heart_rate.high_threshold_bpm", value: hrHigh });
    }

    if (has("hrLowSeconds")) {
      const v = parseHr(hrLowSeconds, "Min BPM süresi", 1);
      if (v === null) return;
      if (v !== initialHrLowSeconds) {
        patches.push({ key: "safety.heart_rate.low_threshold_seconds", value: v });
      }
    }
    if (has("hrHighSeconds")) {
      const v = parseHr(hrHighSeconds, "Max BPM süresi", 1);
      if (v === null) return;
      if (v !== initialHrHighSeconds) {
        patches.push({ key: "safety.heart_rate.high_threshold_seconds", value: v });
      }
    }
    if (has("hrSuddenChangeBpm")) {
      const v = parseHr(hrSuddenChangeBpm, "Ani değişim BPM", 5);
      if (v === null) return;
      if (v !== initialHrSuddenChangeBpm) {
        patches.push({ key: "safety.heart_rate.sudden_change_bpm", value: v });
      }
    }
    if (has("hrSuddenChangeWindowS")) {
      const v = parseHr(hrSuddenChangeWindowS, "Ani değişim penceresi", 5);
      if (v === null) return;
      if (v !== initialHrSuddenChangeWindowS) {
        patches.push({ key: "safety.heart_rate.sudden_change_window_s", value: v });
      }
    }
    if (has("hrSmsTemplate") && hrSmsTemplate.trim() !== initialHrSmsTemplate) {
      patches.push({
        key: "safety.heart_rate.sms_template",
        value: hrSmsTemplate.trim(),
      });
    }

    setSaving(true);
    try {
      if (patches.length > 0) {
        await patchEnvBulk(host, patches);
      }
      if (restartAfterSave) {
        await onBeforeRestart?.();
        setSaving(false);
        setRestarting(true);
        await postRestart(host);
        await waitForHealth(host);
      }
      await onSaved?.();
    } catch (e: any) {
      setError(e?.message ?? "Kaydedilemedi.");
    } finally {
      setSaving(false);
      setRestarting(false);
    }
  };

  const busy = saving || restarting;
  const buttonLabel = restarting
    ? "Yeniden başlatılıyor..."
    : saving
      ? "Kaydediliyor..."
      : saveLabel;

  return (
    <View style={styles.form}>
      {has("name") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Adın</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="örn. Aybars"
            placeholderTextColor="#475569"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("age") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Yaş</Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="örn. 20"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("friendship") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Yakınlık Seviyesi: {friendship}</Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={friendship}
            onValueChange={setFriendship}
            minimumTrackTintColor="#22c55e"
            maximumTrackTintColor="#1e293b"
            thumbTintColor="#22c55e"
          />
          <Text style={styles.helper}>0: mesafeli — 100: çok yakın</Text>
        </View>
      )}

      {has("hobbies") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Hobiler (virgülle ayır)</Text>
          <TextInput
            value={hobbies}
            onChangeText={setHobbies}
            placeholder="örn. satranç, kitap, kodlama"
            placeholderTextColor="#475569"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("health_notes") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Sağlık Notları (virgülle ayır)</Text>
          <TextInput
            value={healthNotes}
            onChangeText={setHealthNotes}
            placeholder="örn. diyabet, diz ağrısı"
            placeholderTextColor="#475569"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("contacts") && (
        <ContactsEditor contacts={contacts} onChange={setContacts} />
      )}

      {has("assistantModel") && (
        <Dropdown
          label="Asistan Modeli"
          options={assistantModelOptions}
          value={assistantModel}
          onChange={setAssistantModel}
        />
      )}

      {has("elabsModel") && (
        <Dropdown
          label="Ses Modeli"
          options={elabsModelOptions}
          value={elabsModel}
          onChange={setElabsModel}
        />
      )}

      {has("elabsOutput") && (
        <Dropdown
          label="Ses Kalitesi"
          options={elabsOutputOptions}
          value={elabsOutput}
          onChange={setElabsOutput}
        />
      )}

      {has("elabsVoice") && (
        <Dropdown
          label="Ses"
          options={elabsVoiceOptions}
          value={elabsVoice}
          onChange={setElabsVoice}
        />
      )}

      {has("speakerVolume") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Ses Seviyesi: {speakerVolume}</Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={speakerVolume}
            onValueChange={setSpeakerVolume}
            minimumTrackTintColor="#22c55e"
            maximumTrackTintColor="#1e293b"
            thumbTintColor="#22c55e"
          />
        </View>
      )}

      {has("micGain") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Mikrofon Seviyesi: {micGain}</Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={micGain}
            onValueChange={setMicGain}
            minimumTrackTintColor="#22c55e"
            maximumTrackTintColor="#1e293b"
            thumbTintColor="#22c55e"
          />
        </View>
      )}

      {has("safetyEnabled") && (
        <View style={styles.safetyHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Yangın/Duman İzleyici</Text>
            <Text style={styles.helper}>
              MQ-2 duman sensörünü dinler. Eşik aşılırsa robot anons yapar ve
              telefon kişilere SMS gönderir.
            </Text>
          </View>
          <Switch
            value={safetyEnabled}
            onValueChange={setSafetyEnabled}
            trackColor={{ false: "#1e293b", true: "#15803d" }}
            thumbColor={safetyEnabled ? "#22c55e" : "#475569"}
          />
        </View>
      )}

      {has("smokeThreshold") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Duman Eşiği (ham ADC değeri)</Text>
          <TextInput
            value={smokeThreshold}
            onChangeText={setSmokeThreshold}
            placeholder="örn. 18000"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
          <Text style={styles.helper}>
            ADS1115 16-bit ham okuma. MQ-2 ortamda ~3000-5000, dumanda 18000+'a
            çıkar. Kalibrasyon için robot detayındaki canlı değeri izle.
          </Text>
        </View>
      )}

      {has("smsTemplate") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Acil Durum SMS Şablonu</Text>
          <TextInput
            value={smsTemplate}
            onChangeText={setSmsTemplate}
            placeholder="ACIL DURUM: ..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multiline, { outline: "none" } as any]}
          />
          <Text style={styles.helper}>
            Geri sayım iptal edilmezse bağlı tüm kişilere bu mesaj gönderilir.
          </Text>
        </View>
      )}

      {has("hrEnabled") && (
        <View style={styles.safetyHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Kalp Ritmi İzleyici</Text>
            <Text style={styles.helper}>
              Saatten gelen BPM örneklerini değerlendirir. Eşik aşılırsa robot
              anons yapar ve telefon kişilere SMS gönderir.
            </Text>
          </View>
          <Switch
            value={hrEnabled}
            onValueChange={setHrEnabled}
            trackColor={{ false: "#1e293b", true: "#15803d" }}
            thumbColor={hrEnabled ? "#22c55e" : "#475569"}
          />
        </View>
      )}

      {has("hrLowBpm") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Min BPM (alt eşik)</Text>
          <TextInput
            value={hrLowBpm}
            onChangeText={setHrLowBpm}
            placeholder="örn. 40"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
          <Text style={styles.helper}>
            Bilekte ölçülen BPM bu değerin altına düşerse ve alt süre eşiği
            kadar sürerse alarm tetiklenir.
          </Text>
        </View>
      )}

      {has("hrHighBpm") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Max BPM (üst eşik)</Text>
          <TextInput
            value={hrHighBpm}
            onChangeText={setHrHighBpm}
            placeholder="örn. 130"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
          <Text style={styles.helper}>
            Bilekte ölçülen BPM bu değerin üstüne çıkarsa ve üst süre eşiği
            kadar sürerse alarm tetiklenir.
          </Text>
        </View>
      )}

      {has("hrLowSeconds") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Alt eşik süresi (sn)</Text>
          <TextInput
            value={hrLowSeconds}
            onChangeText={setHrLowSeconds}
            placeholder="örn. 15"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("hrHighSeconds") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Üst eşik süresi (sn)</Text>
          <TextInput
            value={hrHighSeconds}
            onChangeText={setHrHighSeconds}
            placeholder="örn. 30"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("hrSuddenChangeBpm") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Ani değişim BPM eşiği</Text>
          <TextInput
            value={hrSuddenChangeBpm}
            onChangeText={setHrSuddenChangeBpm}
            placeholder="örn. 30"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
          <Text style={styles.helper}>
            Aşağıdaki pencerede max-min farkı bu değeri aşarsa alarm tetiklenir.
          </Text>
        </View>
      )}

      {has("hrSuddenChangeWindowS") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Ani değişim penceresi (sn)</Text>
          <TextInput
            value={hrSuddenChangeWindowS}
            onChangeText={setHrSuddenChangeWindowS}
            placeholder="örn. 30"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            style={[styles.input, { outline: "none" } as any]}
          />
        </View>
      )}

      {has("hrSmsTemplate") && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Kalp Ritmi SMS Şablonu</Text>
          <TextInput
            value={hrSmsTemplate}
            onChangeText={setHrSmsTemplate}
            placeholder="ACIL DURUM: ..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multiline, { outline: "none" } as any]}
          />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [
          styles.primary,
          (pressed || busy) && styles.primaryPressed,
        ]}
        onPress={save}
        disabled={busy}
      >
        <View style={styles.primaryInner}>
          {busy && (
            <ActivityIndicator
              size="small"
              color="#ffffff"
              style={styles.primarySpinner}
            />
          )}
          <Text style={styles.primaryText}>{buttonLabel}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  field: { gap: 6 },
  fieldLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
  },
  error: { color: "#ef4444", fontSize: 13 },
  helper: { color: "#64748b", fontSize: 12 },
  primary: {
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryPressed: { backgroundColor: "#16a34a", transform: [{ scale: 0.98 }] },
  primaryInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primarySpinner: { marginRight: 4 },
  primaryText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  safetyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
});
