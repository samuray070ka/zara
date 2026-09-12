import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api("/notifications").then(setItems).catch(() => {});
  }, []);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="notifications-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{t("notifications")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        testID="notifications-list"
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: S.lg, maxWidth: 700, width: "100%", alignSelf: "center" }}
        renderItem={({ item: n, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).springify()} style={st.card}>
            <View style={st.icon}>
              <Ionicons name="notifications" size={18} color={C.brandDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{n.title}</Text>
              <Text style={st.body}>{n.body}</Text>
              <Text style={st.date}>{new Date(n.created_at).toLocaleString()}</Text>
            </View>
            {!n.read && <View style={st.unread} />}
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="notifications-off-outline" size={56} color={C.borderStrong} />
            <Text style={{ color: C.muted, marginTop: S.md }}>Bildirishnomalar yo'q</Text>
          </View>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface },
  card: { flexDirection: "row", gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  icon: { width: 38, height: 38, borderRadius: R.md, backgroundColor: C.brandTint, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", fontSize: 14, color: C.onSurface },
  body: { fontSize: 13, color: C.onTertiary, marginTop: 2 },
  date: { fontSize: 11, color: C.borderStrong, marginTop: 4 },
  unread: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand },
});
