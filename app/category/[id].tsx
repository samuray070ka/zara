import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import { fetchCategories, readCachedCategories } from "@/src/lib/categories";
import ProductCard from "@/src/components/ProductCard";


export default function CategoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, lang } = useLang();
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [sub, setSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");

  const isSeller = id?.startsWith("seller-");
  const sellerId = isSeller ? id!.replace("seller-", "") : null;
  const isAll = id === "all";


  const cols = Math.min(6, Math.max(2, Math.floor(width / 220)));
  const cardW = (Math.min(width, 1200) - S.lg * 2 - S.md * (cols - 1)) / cols;

  useEffect(() => {
    let active = true;

    const applyCategories = (c: any[]) => {
      if (!active) return;
      setCats(c);
      if (isAll) {
        setTitle("Hammasi");
      } else if (!isSeller) {
        const cat = c.find((x: any) => x.id === id);
        if (cat) setTitle(ml(cat.name, lang));
      }
    };

    readCachedCategories().then((cached) => {
      if (cached?.length) applyCategories(cached);
    }).catch(() => {});

    fetchCategories().then(applyCategories).catch(() => {});

    return () => {
      active = false;
    };
  }, [id, lang, isSeller, isAll]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const all: any[] = [];
        const seen = new Set<string>();
        const pageSize = 50;
        for (let skip = 0; skip < 2000; skip += pageSize) {
          const url = isSeller
            ? `/products?seller_id=${sellerId}&sort=mix&limit=${pageSize}&skip=${skip}`
            : isAll
            ? `/products?sort=mix&limit=${pageSize}&skip=${skip}`
            : `/products?category_id=${encodeURIComponent(String(sub || id))}&sort=mix&limit=${pageSize}&skip=${skip}`;
          const r = await api(url).catch(() => ({ items: [] }));
          const list = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
          if (!list.length) break;
          const before = all.length;
          for (const p of list) {
            const pid = String(p?.id || "");
            if (!pid || seen.has(pid)) continue;
            seen.add(pid);
            all.push(p);
          }
          if (all.length === before || list.length < pageSize) break;
        }
        if (!active) return;
        setItems(all);
        if (isAll) setTitle("Hammasi");
        if (isSeller && all[0]) setTitle("Do'kon");
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, sub, isAll, isSeller, sellerId]);

  const subCats = cats.filter((c) => c.parent_id === id);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="category-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle} numberOfLines={1}>{title || t("catalog")}</Text>
        <Pressable testID="category-search-button" onPress={() => router.push("/search")} style={st.backBtn}>
          <Ionicons name="search" size={20} color={C.onSurface} />
        </Pressable>
      </View>

      {subCats.length > 0 && (
        <View style={{ height: 56, justifyContent: "center" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, alignItems: "center" }}>
            <Pressable testID="category-sub-all" style={[st.chip, !sub && st.chipActive]} onPress={() => setSub(null)}>
              <Text style={[st.chipTxt, !sub && { color: "#fff" }]}>{t("all")}</Text>
            </Pressable>
            {subCats.map((c) => (
              <Pressable key={c.id} testID={`category-sub-${c.id}`} style={[st.chip, sub === c.id && st.chipActive]} onPress={() => setSub(c.id)}>
                <Text style={[st.chipTxt, sub === c.id && { color: "#fff" }]}>{ml(c.name, lang)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ paddingHorizontal: S.lg, paddingVertical: S.sm }}>
        <View style={[st.chip, st.chipActive, { alignSelf: "flex-start" }]}>
          <Text style={[st.chipTxt, { color: "#fff" }]}>Hammasi</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          key={cols}
          testID="category-products-list"
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
          ListEmptyComponent={<Text style={{ textAlign: "center", color: C.muted, marginTop: 60 }}>Mahsulotlar yo'q</Text>}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.sm, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface, flex: 1, textAlign: "center" },
  chip: { height: 36, paddingHorizontal: S.md, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: C.inverse, borderColor: C.inverse },
  chipTxt: { fontSize: 13, fontWeight: "600", color: C.onTertiary },
});