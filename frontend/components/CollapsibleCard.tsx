import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CollapsibleCard({ title, open, onToggle, children }: Props) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerPressed: { backgroundColor: "#172033" },
  title: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  chevron: { color: "#94a3b8", fontSize: 16 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    gap: 16,
  },
});
