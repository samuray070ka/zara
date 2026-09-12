import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { fetchCategories, readCachedCategories } from "@/src/lib/categories";

export default function Catalog() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLang();
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await readCachedCategories();
      if (active && cached?.length) {
        setCats(cached);
        setLoading(false);
      }

      fetchCategories()
        .then((data) => {
          if (!active) return;
          setCats(data);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setLoading(false);
        });
    })();

    return () => {
      active = false;
    };
  }, []);

  const parents = cats.filter((c) => !c.parent_id);
  const subs = (pid: string) => cats.filter((c) => c.parent_id === pid);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>{t("catalog")}</Text>
        <Pressable testID="catalog-search-button" style={st.iconBtn} onPress={() => router.push("/search")}>
          <Ionicons name="search" size={20} color={C.onSurface} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={C.brand} size="large" style={{ marginTop: 60 }} />
      ) : parents.length ? (
        <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 800, width: "100%", alignSelf: "center", paddingBottom: S.xl }}>
          {parents.map((c, i) => (
            <Animated.View key={c.id} entering={FadeInDown.delay(i * 60).springify()}>
              <Pressable
                testID={`catalog-category-${c.id}`}
                style={st.catRow}
                onPress={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <View style={st.catIcon}>
                  {(c.preview_image || c.image) ? (
                    <Image source={{ uri: c.preview_image || c.image }} style={st.catImage} contentFit="cover" />
                  ) : (
                    <MaterialIcons name={c.icon as any} size={24} color={C.brandDark} />
                  )}
                </View>
                <Text style={st.catName}>{ml(c.name, lang)}</Text>
                <Ionicons name={expanded === c.id ? "chevron-up" : "chevron-down"} size={18} color={C.muted} />
              </Pressable>
              {expanded === c.id && (
                <View style={st.subWrap}>
                  <Pressable testID={`catalog-all-${c.id}`} style={st.subRow} onPress={() => router.push(`/category/${c.id}`)}>
                    <Text style={[st.subName, { color: C.brandDark, fontWeight: "800" }]}>{t("all")} →</Text>
                  </Pressable>
                  {subs(c.id).map((s) => (
                    <Pressable key={s.id} testID={`catalog-sub-${s.id}`} style={st.subRow} onPress={() => router.push(`/category/${s.id}`)}>
                      <Text style={st.subName}>{ml(s.name, lang)}</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.borderStrong} />
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          ))}
        </ScrollView>
      ) : (
        <View style={st.emptyWrap}>
          <MaterialIcons name="category" size={34} color={C.borderStrong} />
          <Text style={st.emptyTitle}>Katalog hozircha yuklanmadi</Text>
          <Text style={st.emptyHint}>Sahifani yangilang yoki birozdan keyin qayta urinib ko'ring</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: "900", color: C.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  catRow: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  catIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.brandTint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  catImage: { width: "100%", height: "100%" },
  catName: { flex: 1, fontSize: 16, fontWeight: "700", color: C.onSurface },
  subWrap: { backgroundColor: C.card, borderRadius: R.md, marginBottom: S.sm, marginTop: -4, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  subName: { fontSize: 14, color: C.onTertiary, fontWeight: "500" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: S.xl, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.onSurface, textAlign: "center" },
  emptyHint: { fontSize: 13, color: C.muted, textAlign: "center" },
});