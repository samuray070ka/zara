import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator, useWindowDimensions, Share, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { useCart } from "@/src/lib/cart";
import { api } from "@/src/lib/api";
import ProductCard from "@/src/components/ProductCard";

export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, lang } = useLang();
  const { user, token, refresh } = useAuth();
  const { add, items } = useCart();
  const [p, setP] = useState<any>(null);
  const [similar, setSimilar] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [imgIdx, setImgIdx] = useState(0);
  const [selVar, setSelVar] = useState<Record<string, any>>({});
  const [fav, setFav] = useState(false);
  const [added, setAdded] = useState(false);
  const [saleUnit, setSaleUnit] = useState<"piece" | "box">("piece");
  const [revRating, setRevRating] = useState(5);
  const [revText, setRevText] = useState("");
  const [revMsg, setRevMsg] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  useEffect(() => {
    if (!id) return;
    api(`/products/${id}`).then(setP).catch(() => {});
    api(`/products/${id}/similar`).then(setSimilar).catch(() => {});
    api(`/products/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (user?.favorites?.includes(id)) setFav(true);
  }, [user, id]);

  if (!p)
    return (
      <View style={[st.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );

  const varDelta = Object.values(selVar).reduce((s: number, o: any) => s + (o?.price_delta || 0), 0);
  const upb = Number(p.units_per_box || 0);
  const hasBox = upb > 0 && p.unit_type !== "kg" && p.sale_mode !== "kg";
  const piecePrice = Number(p.piece_price ?? p.effective_price ?? p.price ?? 0);
  const boxPrice = Number(
    p.effective_box_price ?? p.seller_box_price ?? p.box_price ?? piecePrice * (upb || 1)
  );
  const unitPrice = hasBox && saleUnit === "box" ? boxPrice : piecePrice;
  const visiblePrice = unitPrice + varDelta;
  const variationParts = Object.values(selVar).map((o: any) => o.label).filter(Boolean);
  if (hasBox) variationParts.unshift(saleUnit === "box" ? `quti (${upb} ta)` : "dona");
  const variationLabel = variationParts.length ? variationParts.join(", ") : null;
  const compareOldPrice = p.effective_old_price ?? p.old_price ?? p.display_old_price ?? null;
  const discount = compareOldPrice && saleUnit === "piece" ? Math.round((1 - (piecePrice + varDelta) / compareOldPrice) * 100) : 0;
  const stockTotal = Number(p.stock_total_units ?? p.stock ?? 0);
  const maxStock = hasBox && saleUnit === "box" ? Math.floor(stockTotal / upb) : stockTotal;
  const inCartQty = items.find((i) => i.product_id === p.id && (i.variation || "") === (variationLabel || ""))?.qty || 0;

  const toggleFav = async () => {
    if (!token) return router.push("/auth");
    const res = await api(`/favorites/${p.id}`, { method: "POST" });
    setFav(res.favorited);
    refresh();
  };

  const addToCart = () => {
    if (p.out_of_stock) return;
    add({
      product_id: p.id,
      name: p.name,
      image: p.images?.[0],
      price: visiblePrice,
      stock: Math.max(maxStock, 1),
      seller_id: p.seller_id,
      shop_name: p.seller?.shop_name,
      variation: variationLabel,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const buyNow = () => {
    if (p.out_of_stock) return;
    if (!token) return router.push("/auth");
    addToCart();
    router.push("/(tabs)/cart");
  };

  const doShare = async () => {
    const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/product/${p.id}`;
    if (Platform.OS === "web" && navigator?.clipboard) {
      await navigator.clipboard.writeText(url);
      setShareMsg("Havola nusxalandi!");
      setTimeout(() => setShareMsg(""), 2000);
    } else {
      Share.share({ message: `${ml(p.name, lang)} — ${url}` }).catch(() => {});
    }
  };

  const sendReview = async () => {
    setRevMsg("");
    try {
      const rev = await api(`/products/${p.id}/reviews`, { method: "POST", body: { rating: revRating, text: revText } });
      setReviews([rev, ...reviews]);
      setRevText("");
      setRevMsg("Sharh qo'shildi!");
    } catch (e: any) {
      setRevMsg(e.message);
    }
  };

  return (
    <View style={st.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 900, width: "100%", alignSelf: "center" }}>
          {/* Gallery */}
          <View style={st.gallery}>
            <Image source={{ uri: p.images[imgIdx] }} style={st.mainImg} contentFit="cover" transition={200} />
            {discount > 0 && <View style={st.discBadge}><Text style={st.discTxt}>-{discount}%</Text></View>}
            {p.flash_active && (
              <View style={st.flashBadge}>
                <Ionicons name="flash" size={12} color="#fff" />
                <Text style={st.discTxt}>Flash Sale</Text>
              </View>
            )}
            <View style={[st.floatRow, { top: insets.top + S.md }]}>
              <Pressable testID="product-back-button" style={st.floatBtn} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={20} color={C.onSurface} />
              </Pressable>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <Pressable testID="product-share-button" style={st.floatBtn} onPress={doShare}>
                  <Ionicons name="share-social-outline" size={19} color={C.onSurface} />
                </Pressable>
                <Pressable testID="product-favorite-button" style={st.floatBtn} onPress={toggleFav}>
                  <Ionicons name={fav ? "heart" : "heart-outline"} size={20} color={fav ? C.error : C.onSurface} />
                </Pressable>
              </View>
            </View>
            {p.images.length > 1 && (
              <View style={st.dots}>
                {p.images.map((_: any, i: number) => (
                  <Pressable key={i} onPress={() => setImgIdx(i)} style={[st.dot, i === imgIdx && st.dotActive]} />
                ))}
              </View>
            )}
          </View>
          {!!shareMsg && <Text style={st.shareMsg}>{shareMsg}</Text>}

          <Animated.View entering={FadeInDown.springify()} style={st.sheet}>
            <Text testID="product-name" style={st.name}>{ml(p.name, lang)}</Text>
            <View style={st.ratingRow}>
              <Ionicons name="star" size={14} color={C.warning} />
              <Text style={st.ratingTxt}>{p.rating || "—"} • {p.reviews_count || 0} {t("reviews").toLowerCase()} • {p.sold || 0} sotilgan</Text>
            </View>
            <View style={st.priceRow}>
              <Text testID="product-price" style={st.price}>{fmt(visiblePrice)}</Text>
              {(compareOldPrice || p.flash_active) && <Text style={st.oldPrice}>{fmt(compareOldPrice || visiblePrice)}</Text>}
            </View>
            {hasBox && (
              <View style={st.boxInfoCard}>
                <Ionicons name="cube-outline" size={18} color={C.brandDark} />
                <View style={{ flex: 1 }}>
                  <Text style={st.boxInfoTitle}>Qanday olasiz?</Text>
                  <Text style={st.boxInfoText}>1 quti = {upb} ta</Text>
                  <View style={st.unitRow}>
                    <Pressable
                      testID="product-unit-piece"
                      onPress={() => setSaleUnit("piece")}
                      style={[st.unitChip, saleUnit === "piece" && st.unitChipOn]}
                    >
                      <Text style={[st.unitChipTxt, saleUnit === "piece" && st.unitChipTxtOn]}>
                        Dona • {fmt(piecePrice)}
                      </Text>
                    </Pressable>
                    <Pressable
                      testID="product-unit-box"
                      onPress={() => setSaleUnit("box")}
                      style={[st.unitChip, saleUnit === "box" && st.unitChipOn]}
                    >
                      <Text style={[st.unitChipTxt, saleUnit === "box" && st.unitChipTxtOn]}>
                        Quti • {fmt(boxPrice)}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* Stock */}
            {p.out_of_stock ? (
              <View style={[st.stockBadge, { backgroundColor: "#FEF2F2" }]}>
                <Text style={{ color: C.error, fontWeight: "800", fontSize: 13 }}>{t("outOfStock")}</Text>
              </View>
            ) : p.stock <= 5 ? (
              <View style={[st.stockBadge, { backgroundColor: "#FFFBEB" }]}>
                <Ionicons name="alert-circle" size={14} color={C.warning} />
                <Text style={{ color: "#B45309", fontWeight: "800", fontSize: 13 }}>Omborda {p.stock} dona qoldi</Text>
              </View>
            ) : null}

            {/* Variations */}
            {p.variations?.map((v: any) => (
              <View key={v.name} style={{ marginTop: S.lg }}>
                <Text style={st.varTitle}>{v.name}</Text>
                <View style={st.varRow}>
                  {v.options.map((o: any) => {
                    const sel = selVar[v.name]?.label === o.label;
                    return (
                      <Pressable
                        key={o.label}
                        testID={`variation-${v.name}-${o.label}`}
                        style={[st.varChip, sel && st.varChipSel]}
                        onPress={() => setSelVar({ ...selVar, [v.name]: sel ? undefined : o })}
                      >
                        <Text style={[st.varChipTxt, sel && { color: "#fff" }]}>
                          {o.label}
                          {o.price_delta ? ` +${fmt(o.price_delta)}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Seller */}
            {p.seller && (
              <Pressable testID="product-seller-card" style={st.sellerCard} onPress={() => router.push(`/category/seller-${p.seller.id}`)}>
                <View style={st.sellerIcon}>
                  <Ionicons name="storefront" size={20} color={C.brandDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.sellerName}>{p.seller.shop_name}</Text>
                  <Text style={st.sellerMeta}>★ {p.seller.rating} • {p.seller.products_count} mahsulot</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.borderStrong} />
              </Pressable>
            )}

            {/* Description */}
            <Text style={st.secTitle}>{t("description")}</Text>
            <Text style={st.desc}>{ml(p.desc, lang)}</Text>

            {/* Reviews */}
            <Text style={st.secTitle}>{t("reviews")} ({reviews.length})</Text>
            {token && (
              <View style={st.revForm}>
                <View style={{ flexDirection: "row", gap: 4, marginBottom: S.sm }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} testID={`review-star-${n}`} onPress={() => setRevRating(n)}>
                      <Ionicons name={n <= revRating ? "star" : "star-outline"} size={26} color={C.warning} />
                    </Pressable>
                  ))}
                </View>
                <TextInput testID="review-text-input" style={st.revInput} value={revText} onChangeText={setRevText} placeholder="Fikringizni yozing..." placeholderTextColor={C.muted} multiline />
                <Pressable testID="review-submit-button" style={st.revBtn} onPress={sendReview}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{t("writeReview")}</Text>
                </Pressable>
                {!!revMsg && <Text testID="review-message" style={{ color: revMsg.includes("!") ? C.success : C.error, fontSize: 12, marginTop: 6 }}>{revMsg}</Text>}
              </View>
            )}
            {reviews.map((r) => (
              <View key={r.id} style={st.revCard}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={st.revName}>{r.client_name}</Text>
                  <View style={{ flexDirection: "row" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= r.rating ? "star" : "star-outline"} size={13} color={C.warning} />
                    ))}
                  </View>
                </View>
                {r.verified && (
                  <View style={st.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={C.success} />
                    <Text style={{ color: C.success, fontSize: 11, fontWeight: "700" }}>{t("verified")}</Text>
                  </View>
                )}
                <Text style={st.revTxt}>{r.text}</Text>
              </View>
            ))}

            {/* Similar */}
            {similar.length > 0 && (
              <>
                <Text style={st.secTitle}>{t("similar")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.md }}>
                  {similar.map((sp, i) => (
                    <ProductCard key={sp.id} product={sp} index={i} width={150} />
                  ))}
                </ScrollView>
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <View style={{ flexDirection: "row", gap: S.sm, maxWidth: 900, width: "100%", alignSelf: "center" }}>
          <Pressable
            testID="product-add-to-cart-button"
            style={[st.cartBtn, (p.out_of_stock || added) && { opacity: 0.7 }]}
            onPress={addToCart}
            disabled={p.out_of_stock}
          >
            <Ionicons name={added ? "checkmark" : "cart"} size={18} color={C.brandDark} />
            <Text style={st.cartBtnTxt}>{added ? "✓ " + t("inCart") : t("addToCart")}{inCartQty > 0 && !added ? ` (${inCartQty})` : ""}</Text>
          </Pressable>
          <Pressable testID="product-buy-now-button" style={[st.buyBtn, p.out_of_stock && { opacity: 0.5 }]} onPress={buyNow} disabled={p.out_of_stock}>
            <Text style={st.buyBtnTxt}>{t("buyNow")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  gallery: { aspectRatio: 1.15, maxHeight: 480, backgroundColor: C.tertiary },
  mainImg: { width: "100%", height: "100%" },
  floatRow: { position: "absolute", left: S.lg, right: S.lg, flexDirection: "row", justifyContent: "space-between" },
  floatBtn: { width: 42, height: 42, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  discBadge: { position: "absolute", bottom: S.lg, left: S.lg, backgroundColor: C.error, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 4 },
  flashBadge: { position: "absolute", bottom: S.lg, left: 90, backgroundColor: "#B45309", borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  discTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
  dots: { position: "absolute", bottom: S.md, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.6)" },
  dotActive: { backgroundColor: C.brandDark, width: 20 },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, marginTop: -20, padding: S.lg },
  name: { fontSize: 20, fontWeight: "900", color: C.onSurface },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  ratingTxt: { color: C.muted, fontSize: 13 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: S.md, marginTop: S.md },
  price: { fontSize: 26, fontWeight: "900", color: C.brandDark },
  oldPrice: { fontSize: 16, color: C.muted, textDecorationLine: "line-through", marginBottom: 3 },
  stockBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 6, marginTop: S.md },
  boxInfoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: C.brandTint, borderRadius: R.md, padding: S.md, marginTop: S.md, borderWidth: 1, borderColor: C.brandSoft },
  boxInfoTitle: { fontSize: 13, fontWeight: "900", color: C.onSurface, marginBottom: 4 },
  unitRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  unitChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.tertiary,
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  unitChipOn: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  unitChipTxt: { fontSize: 12, fontWeight: "800", color: C.onSurface, textAlign: "center" },
  unitChipTxtOn: { color: "#fff" },
  boxInfoText: { fontSize: 13, color: C.onTertiary, lineHeight: 18 },
  varTitle: { fontSize: 14, fontWeight: "800", color: C.onSurface, marginBottom: S.sm },
  varRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  varChip: { borderRadius: R.pill, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 8, backgroundColor: C.surface },
  varChipSel: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  varChipTxt: { fontSize: 13, fontWeight: "700", color: C.onTertiary },
  sellerCard: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.brandTint, borderRadius: R.md, padding: S.md, marginTop: S.xl, borderWidth: 1, borderColor: C.brandSoft },
  sellerIcon: { width: 44, height: 44, borderRadius: R.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  sellerName: { fontWeight: "800", fontSize: 15, color: C.onSurface },
  sellerMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  secTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface, marginTop: S.xl, marginBottom: S.md },
  desc: { fontSize: 14, color: C.onTertiary, lineHeight: 22 },
  revForm: { backgroundColor: C.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.md },
  revInput: { backgroundColor: C.card, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, padding: S.md, minHeight: 60, color: C.onSurface, marginBottom: S.sm },
  revBtn: { backgroundColor: C.inverse, borderRadius: R.sm, height: 40, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: S.lg },
  revCard: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider, paddingVertical: S.md },
  revName: { fontWeight: "800", fontSize: 14, color: C.onSurface },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  revTxt: { color: C.onTertiary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.97)", borderTopWidth: 1, borderTopColor: C.border, padding: S.md },
  cartBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.brandSoft, borderRadius: R.md, height: 52 },
  cartBtnTxt: { color: C.brandDark, fontWeight: "800", fontSize: 14 },
  buyBtn: { flex: 1, backgroundColor: C.brandDark, borderRadius: R.md, height: 52, alignItems: "center", justifyContent: "center" },
  buyBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  shareMsg: { color: C.success, fontWeight: "700", fontSize: 12, textAlign: "center", marginTop: 4 },
});