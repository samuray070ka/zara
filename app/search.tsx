import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { storage } from "@/src/utils/storage";
import { C, S, R } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import { searchByImage, pickerAssetToUri } from "@/src/lib/imageSearch";
import ProductCard from "@/src/components/ProductCard";

const SORTS = ["mix", "cheap", "expensive", "new", "rating"];

export default function Search() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageMode?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [sort, setSort] = useState("mix");
  const [discountOnly, setDiscountOnly] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showImageSource, setShowImageSource] = useState(false);
  const [imageSearching, setImageSearching] = useState(false);
  const [imageError, setImageError] = useState("");
  const debounce = useRef<any>(null);
  const autoImageStarted = useRef(false);

  const cols = Math.min(6, Math.max(2, Math.floor(width / 220)));
  const cardW = (Math.min(width, 1200) - S.lg * 2 - S.md * (cols - 1)) / cols;

  useEffect(() => {
    storage.getItem("search_history", "[]").then((v) => {
      try {
        setHistory(JSON.parse((v as string) || "[]"));
      } catch {}
    });
    api("/search/suggest?q=")
      .then((r) => setSuggestions(r.suggestions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(() => {
      api(`/search/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => setSuggestions(r.suggestions || []))
        .catch(() => {});
    }, 300);
  }, [q]);

  const doSearch = async (term?: string) => {
    const query = term ?? q;
    if (!query.trim()) return;
    setImageUri(null);
    setImageError("");
    setLoading(true);
    setSearched(true);
    if (term) setQ(term);
    const newHist = [query, ...history.filter((h) => h !== query)].slice(0, 8);
    setHistory(newHist);
    storage.setItem("search_history", JSON.stringify(newHist));
    let url = `/products?search=${encodeURIComponent(query)}&sort=${sort}&limit=40`;
    if (discountOnly) url += "&discount=true";
    if (inStock) url += "&in_stock=true";
    if (minP) url += `&min_price=${minP}`;
    if (maxP) url += `&max_price=${maxP}`;
    try {
      const r = await api(url);
      setResults(Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (searched && !imageUri) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, discountOnly, inStock]);

  const runImageSearch = async (uri: string) => {
    if (!uri) return;
    setImageUri(uri);
    setQ("");
    setImageError("");
    setImageSearching(true);
    setLoading(true);
    setSearched(true);
    setResults([]);
    try {
      const items = await searchByImage(uri);
      setResults(items);
      if (!items.length) {
        setImageError("O'xshash mahsulot topilmadi");
      }
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/404|not found|not found/i.test(msg) || msg.includes("Not Found")) {
        setImageError(
          "Rasm orqali qidiruv backendda hali yoqilmagan. Keyinroq qayta urinib ko'ring."
        );
      } else {
        setImageError(msg || "Rasm orqali qidirishda xatolik");
      }
      setResults([]);
    } finally {
      setImageSearching(false);
      setLoading(false);
    }
  };

  const openImageSource = () => {
    if (imageSearching) return;
    setShowImageSource(true);
  };

  const pickSearchImage = async () => {
    setShowImageSource(false);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setImageError("Galereyaga ruxsat bering");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = pickerAssetToUri(res.assets[0]);
      if (!uri) {
        setImageError("Rasm o'qib bo'lmadi");
        return;
      }
      await runImageSearch(uri);
    } catch {
      setImageError("Rasm tanlashda xatolik");
    }
  };

  const takeSearchPhoto = async () => {
    setShowImageSource(false);

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setImageError("Kameraga ruxsat bering");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = pickerAssetToUri(res.assets[0]);
      if (!uri) {
        setImageError("Rasm o'qib bo'lmadi");
        return;
      }
      await runImageSearch(uri);
    } catch {
      setImageError("Kamera ochishda xatolik");
    }
  };

  // Home dan imageMode bilan kelganda darhol picker ochish
  useEffect(() => {
    if (params.imageMode === "1" && !autoImageStarted.current) {
      autoImageStarted.current = true;
      setShowImageSource(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.imageMode]);

  const clearImageSearch = () => {
    setImageUri(null);
    setImageError("");
    setResults([]);
    setSearched(false);
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="search-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <View style={st.searchBox}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput
            testID="search-input"
            style={st.searchInput}
            value={q}
            onChangeText={(v) => {
              setQ(v);
              if (imageUri) clearImageSearch();
            }}
            placeholder={t("search")}
            placeholderTextColor={C.muted}
            autoFocus={params.imageMode !== "1"}
            returnKeyType="search"
            onSubmitEditing={() => doSearch()}
          />
          {!!q && (
            <Pressable
              testID="search-clear-button"
              onPress={() => {
                setQ("");
                setSearched(false);
                setResults([]);
                setImageUri(null);
                setImageError("");
              }}
            >
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          testID="search-image-button"
          style={st.imageBtn}
          onPress={openImageSource}
          disabled={imageSearching}
        >
          <Ionicons
            name={imageSearching ? "hourglass-outline" : "camera-outline"}
            size={22}
            color={C.brandDark}
          />
        </Pressable>
      </View>

      {!!imageUri && (
        <View style={st.imagePreviewRow}>
          <Image source={{ uri: imageUri }} style={st.imagePreview} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={st.imagePreviewTitle}>{t("imageSearch")}</Text>
            <Text style={st.imagePreviewHint}>
              {imageSearching ? t("imageSearching") : t("imageSearchHint")}
            </Text>
          </View>
          <Pressable testID="search-image-clear" onPress={clearImageSearch} style={st.imageClearBtn}>
            <Ionicons name="close" size={18} color={C.onSurface} />
          </Pressable>
        </View>
      )}

      {!!imageError && (
        <Text style={st.imageError} testID="search-image-error">
          {imageError}
        </Text>
      )}

      {searched && !imageUri && (
        <>
          <View style={{ height: 56, justifyContent: "center" }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, alignItems: "center" }}
            >
              {SORTS.map((s) => (
                <Pressable
                  key={s}
                  testID={`search-sort-${s}`}
                  style={[st.chip, sort === s && st.chipActive]}
                  onPress={() => setSort(s)}
                >
                  <Text style={[st.chipTxt, sort === s && { color: "#fff" }]}>{t(`sort_${s}`)}</Text>
                </Pressable>
              ))}
              <Pressable
                testID="search-filter-discount"
                style={[st.chip, discountOnly && st.chipActive]}
                onPress={() => setDiscountOnly(!discountOnly)}
              >
                <Text style={[st.chipTxt, discountOnly && { color: "#fff" }]}>{t("discount")} %</Text>
              </Pressable>
              <Pressable
                testID="search-filter-stock"
                style={[st.chip, inStock && st.chipActive]}
                onPress={() => setInStock(!inStock)}
              >
                <Text style={[st.chipTxt, inStock && { color: "#fff" }]}>Mavjud</Text>
              </Pressable>
            </ScrollView>
          </View>
          <View style={st.priceRow}>
            <TextInput
              testID="search-min-price"
              style={st.priceInput}
              value={minP}
              onChangeText={setMinP}
              placeholder="Narx dan"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
            />
            <TextInput
              testID="search-max-price"
              style={st.priceInput}
              value={maxP}
              onChangeText={setMaxP}
              placeholder="Narx gacha"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
            />
            <Pressable testID="search-apply-price" style={st.applyBtn} onPress={() => doSearch()}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{t("apply")}</Text>
            </Pressable>
          </View>
        </>
      )}

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.brand} />
          {imageSearching && (
            <Text style={st.loadingHint}>{t("imageSearching")}</Text>
          )}
        </View>
      ) : searched ? (
        <FlatList
          key={cols}
          testID="search-results-list"
          data={results}
          keyExtractor={(p, i) => p?.id || `r-${i}`}
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
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: C.muted, marginTop: 60 }}>
              {imageUri ? t("noSimilarProducts") : "Hech narsa topilmadi"}
            </Text>
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: S.lg, maxWidth: 800, width: "100%", alignSelf: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            testID="search-image-cta"
            style={st.imageCta}
            onPress={openImageSource}
          >
            <View style={st.imageCtaIcon}>
              <Ionicons name="images-outline" size={28} color={C.brandDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.imageCtaTitle}>{t("imageSearch")}</Text>
              <Text style={st.imageCtaSub}>{t("imageSearchCta")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </Pressable>

          {suggestions.length > 0 && !!q && (
            <>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  testID={`search-suggestion-${s}`}
                  style={st.histRow}
                  onPress={() => doSearch(s)}
                >
                  <Ionicons name="search" size={16} color={C.muted} />
                  <Text style={st.histTxt}>{s}</Text>
                </Pressable>
              ))}
            </>
          )}
          {history.length > 0 && !q && (
            <>
              <Text style={st.secTitle}>Qidiruv tarixi</Text>
              {history.map((h) => (
                <Pressable
                  key={h}
                  testID={`search-history-${h}`}
                  style={st.histRow}
                  onPress={() => doSearch(h)}
                >
                  <Ionicons name="time-outline" size={16} color={C.muted} />
                  <Text style={st.histTxt}>{h}</Text>
                </Pressable>
              ))}
            </>
          )}
          {suggestions.length > 0 && !q && (
            <>
              <Text style={st.secTitle}>Ommabop so'rovlar</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    testID={`search-popular-${s}`}
                    style={st.chip}
                    onPress={() => doSearch(s)}
                  >
                    <Text style={st.chipTxt}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Modal
        visible={showImageSource}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageSource(false)}
      >
        <View style={st.sourceBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowImageSource(false)} />
          <View style={st.sourceSheet}>
            <View style={st.sourceHandle} />
            <Text style={st.sourceTitle}>Rasm orqali qidirish</Text>
            <Text style={st.sourceSub}>Galereyadan tanlang yoki kamera bilan oling</Text>
            <Pressable
              testID="search-source-gallery"
              style={st.sourceBtn}
              onPress={pickSearchImage}
            >
              <Ionicons name="images-outline" size={22} color={C.brandDark} />
              <Text style={st.sourceBtnTxt}>Galereyadan tanlash</Text>
            </Pressable>
            <Pressable
              testID="search-source-camera"
              style={st.sourceBtn}
              onPress={takeSearchPhoto}
            >
              <Ionicons name="camera-outline" size={22} color={C.brandDark} />
              <Text style={st.sourceBtnTxt}>Kamera bilan olish</Text>
            </Pressable>
            <Pressable
              style={[st.sourceBtn, st.sourceBtnCancel]}
              onPress={() => setShowImageSource(false)}
            >
              <Text style={[st.sourceBtnTxt, { color: C.onSurface }]}>Bekor qilish</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const st = StyleSheet.create({
  sourceBackdrop: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sourceSheet: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sourceHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  sourceTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  sourceSub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 4,
  },
  sourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  sourceBtnCancel: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  sourceBtnTxt: {
    fontSize: 15,
    fontWeight: "800",
    color: "#065F46",
  },
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.tertiary,
    borderRadius: R.pill,
    paddingHorizontal: S.md,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.onSurface, height: "100%" },
  imageBtn: {
    width: 42,
    height: 42,
    borderRadius: R.pill,
    backgroundColor: C.brandTint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.brandSoft,
  },
  imagePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    marginHorizontal: S.lg,
    marginTop: S.md,
    padding: S.md,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  imagePreview: { width: 56, height: 56, borderRadius: R.sm },
  imagePreviewTitle: { fontSize: 14, fontWeight: "800", color: C.onSurface },
  imagePreviewHint: { fontSize: 12, color: C.muted, marginTop: 2 },
  imageClearBtn: {
    width: 32,
    height: 32,
    borderRadius: R.pill,
    backgroundColor: C.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  imageError: {
    marginHorizontal: S.lg,
    marginTop: S.sm,
    color: C.error,
    fontSize: 13,
    fontWeight: "600",
  },
  imageCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    padding: S.md,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.brandSoft,
    marginBottom: S.lg,
  },
  imageCtaIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  imageCtaTitle: { fontSize: 15, fontWeight: "900", color: C.onSurface },
  imageCtaSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  loadingWrap: { marginTop: 60, alignItems: "center", gap: 12 },
  loadingHint: { fontSize: 13, color: C.muted },
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
  priceRow: { flexDirection: "row", gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.sm },
  priceInput: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    height: 38,
    fontSize: 13,
    color: C.onSurface,
  },
  applyBtn: {
    backgroundColor: C.brandDark,
    borderRadius: R.sm,
    paddingHorizontal: S.md,
    justifyContent: "center",
  },
  secTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: C.onSurface,
    marginTop: S.lg,
    marginBottom: S.sm,
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  histTxt: { fontSize: 14, color: C.onTertiary },
});