import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Contact } from "../lib/envTypes";

type Props = {
  contacts: Contact[];
  onChange: (next: Contact[]) => void;
};

export function ContactsEditor({ contacts, onChange }: Props) {
  const updateAt = (idx: number, patch: Partial<Contact>) => {
    onChange(
      contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const removeAt = (idx: number) => {
    onChange(contacts.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...contacts, { name: "", phone: "" }]);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Kişiler</Text>

      {contacts.length === 0 ? (
        <Text style={styles.empty}>Henüz kişi eklenmedi.</Text>
      ) : (
        contacts.map((c, idx) => (
          <View key={idx} style={styles.row}>
            <TextInput
              value={c.name}
              onChangeText={(name) => updateAt(idx, { name })}
              placeholder="Ad"
              placeholderTextColor="#475569"
              style={[styles.input, styles.nameInput, { outline: "none" } as any]}
            />
            <TextInput
              value={c.phone}
              onChangeText={(phone) => updateAt(idx, { phone })}
              placeholder="Telefon"
              placeholderTextColor="#475569"
              keyboardType="phone-pad"
              style={[styles.input, styles.phoneInput, { outline: "none" } as any]}
            />
            <Pressable
              onPress={() => removeAt(idx)}
              style={({ pressed }) => [
                styles.removeBtn,
                pressed && styles.removeBtnPressed,
              ]}
              accessibilityLabel="Kişiyi sil"
            >
              <Text style={styles.removeBtnText}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable
        onPress={add}
        style={({ pressed }) => [
          styles.addBtn,
          pressed && styles.addBtnPressed,
        ]}
      >
        <Text style={styles.addBtnText}>+ Kişi ekle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  fieldLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 15,
  },
  nameInput: { flex: 1.2 },
  phoneInput: { flex: 1 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7f1d1d",
  },
  removeBtnPressed: { backgroundColor: "#1e0808" },
  removeBtnText: { color: "#fca5a5", fontSize: 16, fontWeight: "700" },
  addBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  addBtnPressed: { backgroundColor: "#172033" },
  addBtnText: { color: "#22c55e", fontSize: 13, fontWeight: "600" },
  empty: { color: "#64748b", fontSize: 13, fontStyle: "italic" },
});
