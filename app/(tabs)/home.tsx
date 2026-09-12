import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, RefreshControl, useWindowDimensions, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import zarramarketLogo from "../../assets/images/zarramarket-logo.png";
import { C, S, R } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";
import { fetchCategories, readCachedCategories } from "@/src/lib/categories";
import ProductCard from "@/src/components/ProductCard";

type FeedResponse = { items: any[]; total: number };

/** Home feed xotira cache — qayta ochganda darhol ko'rsatish */
const _homeMem: {
  banners?: any[];
  flash?: any[];
  recs?: any[];
  feed?: any[];
  total?: number;
  at: number;
} = { at: 0 };
const HOME_MEM_TTL_MS = 45_000;

function Countdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) return setLeft("00:00:00");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endsAt]);
  return (
    <View style={st.timer} testID="flash-sale-countdown">
      <Ionicons name="time" size={14} color="#fff" />
      <Text style={st.timerTxt}>{left}</Text>
    </View>
  );
}

function InlineLoader({ label }: { label: string }) {
  return (
    <View style={st.inlineLoader}>
      <ActivityIndicator size="small" color={C.brandDark} />
      <Text style={st.inlineLoaderTitle}>{label}</Text>
      <Text style={st.inlineLoaderHint}>Ma'lumot kelishi bilan sahifa darhol yangilanadi.</Text>
    </View>
  );
}

function CategorySkeletons() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm }}>
      {Array.from({ length: 8 }).map((_, idx) => (
        <View key={idx} style={st.catChip}>
          <View style={[st.catIcon, st.skeletonBlock]} />
          <View style={[st.skeletonLine, { width: 58 }]} />
        </View>
      ))}
    </ScrollView>
  );
}

function BannerSkeletons({ width }: { width: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.md, paddingTop: S.md }}>
      {Array.from({ length: 2 }).map((_, idx) => (
        <View key={idx} style={[st.banner, st.skeletonBlock, { width: Math.min(width - S.lg * 2, 640) }]} />
      ))}
    </ScrollView>
  );
}

function FeedSkeleton({ cols, cardW }: { cols: number; cardW: number }) {
  return (
    <View style={{ paddingHorizontal: S.lg, maxWidth: 1200, width: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap" }}>
      {Array.from({ length: cols * 2 }).map((_, index) => (
        <View key={index} style={{ width: cardW, marginBottom: S.md, marginRight: (index + 1) % cols === 0 ? 0 : S.md }}>
          <View style={st.feedSkeletonCard}>
            <View style={[st.feedSkeletonImage, st.skeletonBlock]} />
            <View style={[st.skeletonLine, { width: "88%", marginTop: S.sm }]} />
            <View style={[st.skeletonLine, { width: "60%" }]} />
            <View style={[st.skeletonLine, { width: "40%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, lang } = useLang();
  const { token } = useAuth();
  const [banners, setBanners] = useState<any[]>(() => _homeMem.banners || []);
  const [cats, setCats] = useState<any[]>([]);
  const [flash, setFlash] = useState<any[]>(() => _homeMem.flash || []);
  const [recs, setRecs] = useState<any[]>(() => _homeMem.recs || []);
  const [feed, setFeed] = useState<any[]>(() => _homeMem.feed || []);
  const [total, setTotal] = useState(() => _homeMem.total || 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bannersLoading, setBannersLoading] = useState(!(_homeMem.banners?.length));
  const [catsLoading, setCatsLoading] = useState(true);
  const [flashLoading, setFlashLoading] = useState(!(_homeMem.flash?.length));
  const [recsLoading, setRecsLoading] = useState(!(_homeMem.recs?.length));
  const [feedLoading, setFeedLoading] = useState(!(_homeMem.feed?.length));
  const skipRef = useRef(_homeMem.feed?.length || 0);
  const requestRef = useRef(0);

  const cols = Math.min(6, Math.max(2, Math.floor(width / 220)));
  const cardW = (Math.min(width, 1200) - S.lg * 2 - S.md * (cols - 1)) / cols;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;

    if (_homeMem.feed?.length) {
      setFeed(_homeMem.feed);
      setTotal(_homeMem.total || 0);
      skipRef.current = _homeMem.feed.length;
      setFeedLoading(false);
    } else {
      setFeedLoading(true);
    }
    if (_homeMem.banners?.length) {
      setBanners(_homeMem.banners);
      setBannersLoading(false);
    } else setBannersLoading(true);
    if (_homeMem.flash?.length) {
      setFlash(_homeMem.flash);
      setFlashLoading(false);
    } else setFlashLoading(true);
    if (_homeMem.recs?.length) {
      setRecs(_homeMem.recs);
      setRecsLoading(false);
    } else setRecsLoading(true);
    setCatsLoading(true);

    const safe = (cb: () => void) => {
      if (requestRef.current === requestId) cb();
    };

    const feedTask = api("/products?sort=mix&limit=12&skip=0")
      .then((data: FeedResponse) =>
        safe(() => {
          const items = Array.isArray(data?.items) ? data.items : [];
          setFeed(items);
          setTotal(Number(data?.total || 0));
          skipRef.current = items.length;
          _homeMem.feed = items;
          _homeMem.total = Number(data?.total || 0);
          _homeMem.at = Date.now();
        })
      )
      .catch(() =>
        safe(() => {
          if (!_homeMem.feed?.length) {
            setFeed([]);
            setTotal(0);
            skipRef.current = 0;
          }
        })
      )
      .finally(() => safe(() => setFeedLoading(false)));

    const rest = [
      api("/banners")
        .then((data) =>
          safe(() => {
            const list = Array.isArray(data) ? data : [];
            setBanners(list);
            _homeMem.banners = list;
            _homeMem.at = Date.now();
          })
        )
        .catch(() => safe(() => setBanners([])))
        .finally(() => safe(() => setBannersLoading(false))),
      fetchCategories()
        .then((data) =>
          safe(() =>
            setCats((Array.isArray(data) ? data : []).filter((x: any) => !x.parent_id))
          )
        )
        .catch(() => safe(() => setCats([])))
        .finally(() => safe(() => setCatsLoading(false))),
      api("/products/flash-sale")
        .then((data) =>
          safe(() => {
            const list = Array.isArray(data) ? data : [];
            setFlash(list);
            _homeMem.flash = list;
            _homeMem.at = Date.now();
          })
        )
        .catch(() => safe(() => setFlash([])))
        .finally(() => safe(() => setFlashLoading(false))),
      api("/products/recommendations")
        .then((data) =>
          safe(() => {
            const list = Array.isArray(data) ? data : [];
            setRecs(list);
            _homeMem.recs = list;
            _homeMem.at = Date.now();
          })
        )
        .catch(() => safe(() => setRecs([])))
        .finally(() => safe(() => setRecsLoading(false))),
    ];

    await Promise.allSettled([feedTask, ...rest]);
    safe(() => setRefreshing(false));
  }, [token]);

  useEffect(() => {
    readCachedCategories()
      .then((cached) => {
        if (!cached?.length) return;
        setCats(cached.filter((x: any) => !x.parent_id));
        setCatsLoading(false);
      })
      .catch(() => {});
    load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || feedLoading || feed.length >= total) return;
    setLoadingMore(true);
    try {
      const p = await api(`/products?sort=mix&limit=12&skip=${skipRef.current}`);
      const more = p.items || [];
      setFeed((prev) => [...prev, ...more]);
      skipRef.current += more.length;
    } catch {}
    setLoadingMore(false);
  };

  const onBanner = (b: any) => {
    if (b.link_type === "category" && b.link_id) router.push(`/category/${b.link_id}`);
    else if (b.link_type === "product" && b.link_id) router.push(`/product/${b.link_id}`);
  };

  const header = (
    <View style={{ maxWidth: 1200, width: "100%", alignSelf: "center" }}>
      {bannersLoading && banners.length === 0 ? (
        <BannerSkeletons width={width} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.md, paddingTop: S.md }}>
          {banners.map((b, i) => (
            <Animated.View key={b.id} entering={FadeInDown.delay(i * 100).springify()}>
              <Pressable testID={`banner-${i}`} onPress={() => onBanner(b)} style={[st.banner, { width: Math.min(width - S.lg * 2, 640) }]}>
                <Image source={{ uri: b.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                <LinearGradient colors={["transparent", "rgba(3,7,18,0.85)"]} style={StyleSheet.absoluteFill} />
                <Text style={st.bannerTitle}>{b.title}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <Text style={st.sectionTitle}>{t("categories")}</Text>
      {catsLoading && cats.length === 0 ? (
        <CategorySkeletons />
      ) : cats.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm }}>
          {cats.map((c) => {
            const catImg = c.preview_image || (c as any).image;
            return (
              <Pressable key={c.id} testID={`category-chip-${c.id}`} style={st.catChip} onPress={() => router.push(`/category/${c.id}`)}>
                <View style={st.catIcon}>
                  {catImg ? (
                    <Image source={{ uri: catImg }} style={st.catImage} contentFit="cover" />
                  ) : (
                    <MaterialIcons name={c.icon as any} size={20} color={C.brandDark} />
                  )}
                </View>
                <Text style={st.catTxt}>{ml(c.name, lang)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <InlineLoader label="Kategoriyalar topilmadi" />
      )}

      {flashLoading && flash.length === 0 ? (
        <InlineLoader label="Flash Sale yuklanmoqda..." />
      ) : flash.length > 0 ? (
        <View style={st.flashBlock}>
          <LinearGradient colors={["#065F46", "#030712"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={st.flashHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="flash" size={20} color="#FBBF24" />
              <Text style={st.flashTitle}>{t("flashSale")}</Text>
            </View>
            <Countdown endsAt={flash[0].flash_sale.ends_at} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.md, gap: S.md, paddingBottom: S.md }}>
            {flash.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} width={160} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {recsLoading && recs.length === 0 ? (
        <InlineLoader label="Tavsiyalar yuklanmoqda..." />
      ) : recs.length > 0 ? (
        <>
          <Text style={st.sectionTitle}>✨ {t("forYou")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.md }}>
            {recs.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} width={160} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={st.sectionTitle}>{t("allProducts")}</Text>
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <View style={st.topInner}>
          <View style={st.logoRow}>
            <Image source={zarramarketLogo} style={st.logoImg} contentFit="contain" />
            <Text style={st.logoTxt}>Zarram</Text>
          </View>
          <Pressable testID="home-search-bar" style={st.searchBar} onPress={() => router.push("/search")}>
            <Ionicons name="search" size={18} color={C.muted} />
            <Text style={st.searchTxt}>{t("search")}</Text>
          </Pressable>
          <Pressable
            testID="home-image-search-button"
            style={st.imageSearchBtn}
            onPress={() => router.push({ pathname: "/search", params: { imageMode: "1" } })}
          >
            <Ionicons name="camera-outline" size={20} color={C.brandDark} />
          </Pressable>
          <Pressable testID="home-notifications-button" style={st.iconBtn} onPress={() => router.push(token ? "/notifications" : "/auth")}>
            <Ionicons name="notifications-outline" size={22} color={C.onSurface} />
          </Pressable>
        </View>
      </View>

      <FlatList
        key={cols}
        testID="home-feed-list"
        data={feed}
        keyExtractor={(p, index) => p?.id || `feed-${index}`}
        numColumns={cols}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <View style={{ width: cardW, marginBottom: S.md, marginRight: (index + 1) % cols === 0 ? 0 : S.md }}>
            <ProductCard product={item} index={index % cols} width={cardW} />
          </View>
        )}
        columnWrapperStyle={feed.length ? { paddingHorizontal: S.lg, maxWidth: 1200, alignSelf: "center", width: "100%" } : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={feedLoading ? <FeedSkeleton cols={cols} cardW={cardW} /> : <InlineLoader label="Mahsulot topilmadi" />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={C.brand} style={{ marginVertical: S.lg }} /> : <View style={{ height: S.xl }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={C.brand}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  topBar: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: S.sm },
  topInner: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, maxWidth: 1200, width: "100%", alignSelf: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoImg: { width: 48, height: 48, borderRadius: 12 },
  logoTxt: { fontSize: 20, fontWeight: "900", color: C.onSurface, letterSpacing: -0.5 },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.tertiary, borderRadius: R.pill, paddingHorizontal: S.lg, height: 42 },
  searchTxt: { color: C.muted, fontSize: 14 },
  imageSearchBtn: {
    width: 42,
    height: 42,
    borderRadius: R.pill,
    backgroundColor: C.brandTint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.brandSoft,
  },
  iconBtn: { width: 42, height: 42, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  banner: { height: 170, borderRadius: R.lg, overflow: "hidden", justifyContent: "flex-end", padding: S.lg },
  bannerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", maxWidth: 420 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: C.onSurface, paddingHorizontal: S.lg, marginTop: S.xl, marginBottom: S.md },
  catChip: { alignItems: "center", gap: 6, width: 76, flexShrink: 0 },
  catIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.brandTint, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.brandSoft, overflow: "hidden" },
  catImage: { width: "100%", height: "100%" },
  catTxt: { fontSize: 11, color: C.onTertiary, fontWeight: "600", textAlign: "center" },
  flashBlock: { marginHorizontal: S.lg, marginTop: S.xl, borderRadius: R.lg, overflow: "hidden" },
  flashHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: S.md },
  flashTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  timer: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(220,38,38,0.9)", borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  timerTxt: { color: "#fff", fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] },
  inlineLoader: { marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.lg, alignItems: "center", gap: 8 },
  inlineLoaderTitle: { fontSize: 14, fontWeight: "900", color: C.onSurface, textAlign: "center" },
  inlineLoaderHint: { fontSize: 12, color: C.muted, textAlign: "center" },
  skeletonBlock: { backgroundColor: "#E5E7EB" },
  skeletonLine: { height: 10, borderRadius: R.pill, backgroundColor: "#E5E7EB" },
  feedSkeletonCard: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.sm, overflow: "hidden" },
  feedSkeletonImage: { width: "100%", aspectRatio: 1, borderRadius: R.md },
});