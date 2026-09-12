import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { C, R, S } from "@/src/lib/theme";

export function SectionLoader({ label = "Ma'lumot yuklanmoqda..." }: { label?: string }) {
  return (
    <View style={st.loaderCard}>
      <ActivityIndicator size="small" color={C.brandDark} />
      <Text style={st.loaderTitle}>{label}</Text>
      <Text style={st.loaderHint}>Iltimos, biroz kuting...</Text>
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={st.emptyCard}>
      <Text style={st.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={st.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  loaderCard: {
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 132,
    marginBottom: S.sm,
  },
  loaderTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: C.onSurface,
    textAlign: "center",
  },
  loaderHint: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
  },
  emptyCard: {
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    minHeight: 120,
    justifyContent: "center",
    marginBottom: S.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.onSurface,
  },
  emptySubtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 6,
    lineHeight: 18,
  },
});
