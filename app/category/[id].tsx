import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { fetchProductsSafe } from "@/src/lib/api";
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
  const [loadingMore, setLoadingMore] = useState(false);
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
      if (isAll) setTitle("Hammasi");
      else if (!isSeller) {
        const cat = c.find((x: any) => x.id === id);
        if (cat) setTitle(ml(cat.name, lang));
      }
    };
    readCachedCategories()
      .then((cached) => {
        if (cached?.length) applyCategories(cached);
      })
      .catch(() => {});
    fetchCategories().then(applyCategories).catch(() => {});
    return () => {
      active = false;
    };
  }, [id, lang, isSeller, isAll]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadingMore(false);
    setItems([]);
    (async () => {
      try {
        const all: any[] = [];
        const seen = new Set<string>();
        const pageSize = 6;
        let totalCount = Number.POSITIVE_INFINITY;
        let skip = 0;
        let emptyStreak = 0;
        let firstBatch = true;

        while (active && all.length < totalCount && skip < 2000) {
          const r = await fetchProductsSafe({
            sort: "new",
            limit: pageSize,
            skip,
            seller_id: isSeller ? String(sellerId) : undefined,
            category_id: !isSeller && !isAll ? String(sub || id) : undefined,
          });
          const list = Array.isArray(r?.items) ? r.items : [];
          if (typeof r?.total === "number" && r.total > 0) {
            totalCount = r.total;
          }
          if (!list.length) {
            emptyStreak++;
            if (emptyStreak >= 2) break;
            skip += pageSize;
            continue;
          }
          emptyStreak = 0;
          const before = all.length;
          for (const p of list) {
            const pid = String(p?.id || "");
            if (!pid || seen.has(pid)) continue;
            seen.add(pid);
            all.push(p);
          }
          if (!active) return;

          setItems([...all]);
          if (firstBatch) {
            setLoading(false);
            firstBatch = false;
            if (all.length < totalCount) setLoadingMore(true);
          }

          if (isAll) setTitle("Hammasi");
          if (isSeller && all[0]) setTitle("Do'kon");

          if (all.length === before) skip += pageSize;
          else skip = all.length;

          if (all.length >= totalCount) break;
          if (active) setLoadingMore(true);
        }
        if (!active) return;
        setItems([...all]);
        if (isAll) setTitle("Hammasi");
        if (isSeller && all[0]) setTitle("Do'kon");
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
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
        <Text style={st.headerTitle} numberOfLines={1}>
          {title || t("catalog")}
        </Text>
        <Pressable testID="category-search-button" onPress={() => router.push("/search")} style={st.backBtn}>
          <Ionicons name="search" size={20} color={C.onSurface} />
        </Pressable>
      </View>

      {subCats.length > 0 && (
        <View style={{ height: 56, justifyContent: "center" }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, alignItems: "center" }}
          >
            <Pressable testID="category-sub-all" style={[st.chip, !sub && st.chipActive]} onPress={() => setSub(null)}>
              <Text style={[st.chipTxt, !sub && { color: "#fff" }]}>{t("all")}</Text>
            </Pressable>
            {subCats.map((c) => (
              <Pressable
                key={c.id}
                testID={`category-sub-${c.id}`}
                style={[st.chip, sub === c.id && st.chipActive]}
                onPress={() => setSub(c.id)}
              >
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

      {loading && items.length === 0 ? (
        <View style={st.centerLoad}>
          <ActivityIndicator size="large" color={C.brand} />
          <Text style={st.loadTxt}>Mahsulotlar yuklanmoqda...</Text>
        </View>
      ) : (
        <FlatList
          key={cols}
          testID="category-products-list"
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={cols}
          columnWrapperStyle={{
            paddingHorizontal: S.lg,
            maxWidth: 1200,
            alignSelf: "center",
            width: "100%",
          }}
          contentContainerStyle={{ paddingTop: S.md, paddingBottom: S.xl }}
          renderItem={({ item, index }) => (
            <View
              style={{
                width: cardW,
                marginBottom: S.md,
                marginRight: (index + 1) % cols === 0 ? 0 : S.md,
              }}
            >
              <ProductCard product={item} index={index % cols} />
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <View style={st.footerLoad}>
                <ActivityIndicator color={C.brand} />
                <Text style={st.loadTxt}>Yana mahsulotlar yuklanmoqda...</Text>
              </View>
            ) : (
              <View style={{ height: S.xl }} />
            )
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={{ textAlign: "center", color: C.muted, marginTop: 60 }}>Mahsulotlar yo'q</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: S.sm,
    paddingHorizontal: S.lg,
    paddingVertical: S.sm,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: C.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.onSurface,
    flex: 1,
    textAlign: "center",
  },
  chip: {
    height: 36,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: C.inverse, borderColor: C.inverse },
  chipTxt: { fontSize: 13, fontWeight: "600", color: C.onTertiary },
  centerLoad: {
    marginTop: 60,
    alignItems: "center",
    gap: 12,
  },
  footerLoad: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  loadTxt: {
    fontSize: 13,
    color: C.muted,
    fontWeight: "600",
  },
});