import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EnvOptions } from "../lib/envTypes";

type Props = {
  label: string;
  options: EnvOptions;
  value: string;
  onChange: (value: string) => void;
  note?: string;
  placeholder?: string;
};

export function Dropdown({
  label,
  options,
  value,
  onChange,
  note,
  placeholder = "Seç",
}: Props) {
  const entries = useMemo(() => Object.entries(options), [options]);
  const [open, setOpen] = useState(false);

  const selectedKey = useMemo(() => {
    const match = entries.find(([, underlying]) => underlying === value);
    return match?.[0] ?? null;
  }, [entries, value]);

  const empty = entries.length === 0;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => {
          if (!empty) setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          pressed && !empty && styles.triggerPressed,
          empty && styles.triggerDisabled,
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            !selectedKey && styles.triggerPlaceholder,
          ]}
        >
          {empty ? "Seçenek yok" : (selectedKey ?? placeholder)}
        </Text>
        {!empty && <Text style={styles.chevron}>▾</Text>}
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={entries}
              keyExtractor={([k]) => k}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item: [key, underlying] }) => {
                const selected = underlying === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(underlying);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      selected && styles.rowSelected,
                      pressed && !selected && styles.rowPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        selected && styles.radioOuterSelected,
                      ]}
                    >
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.rowText,
                        selected && styles.rowTextSelected,
                      ]}
                    >
                      {key}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  fieldLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  trigger: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerPressed: { backgroundColor: "#172033" },
  triggerDisabled: { opacity: 0.6 },
  triggerText: { color: "#ffffff", fontSize: 16 },
  triggerPlaceholder: { color: "#64748b" },
  chevron: { color: "#64748b", fontSize: 14, marginLeft: 8 },
  note: { color: "#64748b", fontSize: 12, fontStyle: "italic" },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  sheetTitle: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  separator: { height: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#020617",
    gap: 12,
  },
  rowSelected: { backgroundColor: "#14532d" },
  rowPressed: { backgroundColor: "#1e293b" },
  rowText: { color: "#cbd5e1", fontSize: 16, flex: 1 },
  rowTextSelected: { color: "#bbf7d0", fontWeight: "600" },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: "#22c55e" },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
});
