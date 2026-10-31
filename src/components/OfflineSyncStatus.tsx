import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function OfflineSyncStatus() {
  const { online, syncing, pendingCount, retry } = useOfflineSync();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("textlight");
  if (online && !syncing && pendingCount === 0) return null;
  const label = !online ? `${pendingCount ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} saved offline` : "Offline · saved data available"}` : syncing ? "Syncing saved changes…" : `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`;
  return <View accessibilityRole="summary" style={styles.row}>
    <ThemedText type="tiny" color={online ? accent : muted} style={styles.label}>{label}</ThemedText>
    {online && pendingCount > 0 ? <TouchableOpacity onPress={() => void retry()} accessibilityRole="button"><ThemedText type="tiny" color={accent}>Retry</ThemedText></TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({ row: { minHeight: 28, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, label: { flex: 1 } });
