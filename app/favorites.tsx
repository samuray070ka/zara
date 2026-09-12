import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import ProductCard from "@/src/components/ProductCard";

export default function Favorites() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLang();
  const [items, setItems] = useState<any[]>([]);

  const cols = Math.min(6, Math.max(2, Math.floor(width / 220)));
  const cardW = (Math.min(width, 1200) - S.lg * 2 - S.md * (cols - 1)) / cols;

  useFocusEffect(
    useCallback(() => {
      api("/favorites").then(setItems).catch(() => {});
    }, [])
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="favorites-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{t("favorites")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        key={cols}
        testID="favorites-list"
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={cols}
        columnWrapperStyle={{ paddingHorizontal: S.lg, maxWidth: 1200, alignSelf: "center", width: "100%" }}
        contentContainerStyle={{ paddingTop: S.md, paddingBottom: S.xl }}
        renderItem={({ item, index }) => (
          <View style={{ width: cardW, marginBottom: S.md, marginRight: (index + 1) % cols === 0 ? 0 : S.md }}>
            <ProductCard product={item} index={index % cols} />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="heart-outline" size={56} color={C.borderStrong} />
            <Text style={{ color: C.muted, marginTop: S.md }}>Sevimlilar bo'sh</Text>
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
});
