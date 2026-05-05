import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getByPath, patchEnvBulk, EnvPatch } from "../lib/api";
import { Contact, EnvOptions } from "../lib/envTypes";
import { ContactsEditor } from "./ContactsEditor";
import { SegmentedSelector } from "./SegmentedSelector";

export type FieldKey =
  | "name"
  | "age"
  | "hobbies"
  | "health_notes"
  | "contacts"
  | "assistantModel"
  | "elabsModel"
  | "elabsOutput"
  | "elabsVoice";

type Props = {
  host: string;
  fields: FieldKey[];
  initial: Record<string, unknown>;
  saveLabel: string;
  onSaved?: () => void | Promise<void>;
};

const RESTART_NOTE = "Bu ayar robot yeniden başlatıldığında etkili olur.";

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
}: Props) {
  const has = (k: FieldKey) => fields.includes(k);

  const initialName = useMemo(() => asString(getByPath(initial, "user.name")), [initial]);
  const initialAge = useMemo(() => asNumber(getByPath(initial, "user.age")), [initial]);
  const initialHobbies = useMemo(() => asStringArray(getByPath(initial, "user.hobbies")), [initial]);
  const initialNotes = useMemo(() => asStringArray(getByPath(initial, "user.health_notes")), [initial]);
  const initialContacts = useMemo(() => asContactArray(getByPath(initial, "user.contacts")), [initial]);
  const initialAssistantModel = useMemo(() => asString(getByPath(initial, "assistant.model")), [initial]);
  const initialElabsModel = useMemo(() => asString(getByPath(initial, "elabs.model")), [initial]);
  const initialElabsOutput = useMemo(() => asString(getByPath(initial, "elabs.output")), [initial]);
  const initialElabsVoice = useMemo(() => asString(getByPath(initial, "elabs.voice")), [initial]);

  const assistantModelOptions = useMemo(() => asOptions(getByPath(initial, "openai.models")), [initial]);
  const elabsModelOptions = useMemo(() => asOptions(getByPath(initial, "elabs.models")), [initial]);
  const elabsOutputOptions = useMemo(() => asOptions(getByPath(initial, "elabs.outputs")), [initial]);
  const elabsVoiceOptions = useMemo(() => asOptions(getByPath(initial, "elabs.voices")), [initial]);

  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initialAge != null ? String(initialAge) : "");
  const [hobbies, setHobbies] = useState(initialHobbies.join(", "));
  const [healthNotes, setHealthNotes] = useState(initialNotes.join(", "));
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [assistantModel, setAssistantModel] = useState(initialAssistantModel);
  const [elabsModel, setElabsModel] = useState(initialElabsModel);
  const [elabsOutput, setElabsOutput] = useState(initialElabsOutput);
  const [elabsVoice, setElabsVoice] = useState(initialElabsVoice);

  const [saving, setSaving] = useState(false);
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

    setSaving(true);
    try {
      if (patches.length > 0) {
        await patchEnvBulk(host, patches);
      }
      await onSaved?.();
    } catch (e: any) {
      setError(e?.message ?? "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

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
        <SegmentedSelector
          label="Asistan Modeli"
          options={assistantModelOptions}
          value={assistantModel}
          onChange={setAssistantModel}
          note={RESTART_NOTE}
        />
      )}

      {has("elabsModel") && (
        <SegmentedSelector
          label="Ses Modeli"
          options={elabsModelOptions}
          value={elabsModel}
          onChange={setElabsModel}
          note={RESTART_NOTE}
        />
      )}

      {has("elabsOutput") && (
        <SegmentedSelector
          label="Ses Kalitesi"
          options={elabsOutputOptions}
          value={elabsOutput}
          onChange={setElabsOutput}
          note={RESTART_NOTE}
        />
      )}

      {has("elabsVoice") && (
        <SegmentedSelector
          label="Ses"
          options={elabsVoiceOptions}
          value={elabsVoice}
          onChange={setElabsVoice}
          note={RESTART_NOTE}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [
          styles.primary,
          (pressed || saving) && styles.primaryPressed,
        ]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.primaryText}>
          {saving ? "Kaydediliyor..." : saveLabel}
        </Text>
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
  primary: {
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryPressed: { backgroundColor: "#16a34a", transform: [{ scale: 0.98 }] },
  primaryText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
});
