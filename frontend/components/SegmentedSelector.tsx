import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EnvOptions } from "../lib/envTypes";

type Props = {
  label: string;
  options: EnvOptions;
  value: string;
  onChange: (value: string) => void;
  note?: string;
};

export function SegmentedSelector({
  label,
  options,
  value,
  onChange,
  note,
}: Props) {
  const entries = Object.entries(options);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {entries.length === 0 ? (
        <Text style={styles.empty}>Seçenek bulunamadı.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {entries.map(([key, underlying]) => {
            const selected = underlying === value;
            return (
              <Pressable
                key={key}
                onPress={() => onChange(underlying)}
                style={({ pressed }) => [
                  styles.pill,
                  selected && styles.pillSelected,
                  pressed && !selected && styles.pillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    selected && styles.pillTextSelected,
                  ]}
                >
                  {key}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}
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
  row: { gap: 8, paddingVertical: 2 },
  pill: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillSelected: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  pillPressed: { backgroundColor: "#172033" },
  pillText: { color: "#cbd5e1", fontSize: 14, fontWeight: "500" },
  pillTextSelected: { color: "#052e16", fontWeight: "700" },
  note: { color: "#64748b", fontSize: 12, fontStyle: "italic" },
  empty: { color: "#64748b", fontSize: 13, fontStyle: "italic" },
});
