import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { useCart } from "@/src/lib/cart";

function getProductImage(p: any): string | undefined {
  if (!p) return undefined;

  const isValid = (s: any) =>
    typeof s === "string" && s.trim().length > 10; // bo‘sh yoki juda qisqa emas

  if (Array.isArray(p.images) && p.images.length > 0) {
    for (const first of p.images) {
      if (isValid(first)) return first.trim();
      if (first && typeof first === "object") {
        const url = first.url || first.image || first.src || first.uri || first.path;
        if (isValid(url)) return url.trim();
      }
    }
  }

  if (isValid(p.images)) return p.images.trim();

  const candidates = [
    p.image,
    p.preview_image,
    p.main_image,
    p.thumbnail,
    p.photo,
    p.cover,
  ];

  for (const c of candidates) {
    if (isValid(c)) return c.trim();
    if (c && typeof c === "object") {
      const url = c.url || c.src || c.image;
      if (isValid(url)) return url.trim();
    }
  }

  return undefined;
}
export default function ProductCard({
  product,
  index = 0,
  width,
}: {
  product: any;
  index?: number;
  width?: number;
}) {
  const router = useRouter();
  const { lang, t } = useLang();
  const { add, items: cartItems } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [bigModal, setBigModal] = useState(false);
  /** "piece" | "box" — faqat units_per_box > 0 bo'lganda tanlanadi */
  const [saleUnit, setSaleUnit] = useState<"piece" | "box">("piece");

  const p = product || {};
  const imgUri = getProductImage(p);
  // Shu mahsulot savatda bormi (dona yoki quti — bir xil product_id)
  const inCartQty = (cartItems || [])
    .filter((i) => i.product_id === p.id)
    .reduce((s, i) => s + (i.qty || 0), 0);
  const inCart = inCartQty > 0 || justAdded;

  const upb = Number(p.units_per_box || 0);
  const hasBox = upb > 0 && p.unit_type !== "kg" && p.sale_mode !== "kg";

  const piecePrice =
    p.piece_price ??
    p.effective_price ??
    p.seller_price ??
    p.price ??
    0;
  const boxPrice =
    p.effective_box_price ??
    p.seller_box_price ??
    p.box_price ??
    (piecePrice * upb);

  // Cardda asosiy ko'rinish — 1 dona narxi
  const salePrice = piecePrice;

  const compareOldPrice =
    p.effective_old_price ?? p.old_price ?? p.seller_old_price ?? null;

  const discount =
    compareOldPrice && compareOldPrice > salePrice
      ? Math.round((1 - salePrice / compareOldPrice) * 100)
      : p.flash_active
      ? Math.round((1 - salePrice / (compareOldPrice || salePrice || 1)) * 100)
      : 0;

  const addWithUnit = (unit: "piece" | "box") => {
    const isBox = unit === "box" && hasBox;
    const price = isBox ? boxPrice : piecePrice;
    const stockTotal = Number(p.stock_total_units ?? p.stock ?? 0);
    const stock = isBox ? Math.floor(stockTotal / upb) : stockTotal;
    const variation = isBox ? `quti (${upb} ta)` : hasBox ? "dona" : null;
    add({
      product_id: p.id,
      name: p.name,
      image: imgUri,
      price,
      stock: Math.max(stock, 1),
      seller_id: p.seller_id,
      shop_name: p.seller?.shop_name,
      variation,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const quickAdd = (e: any) => {
    e?.stopPropagation?.();
    if (p.out_of_stock) return;

    if (product?.onCardAddSkipModal) {
      addWithUnit(hasBox ? saleUnit : "piece");
    } else {
      // Quti bor bo'lsa modalda tanlash; yo'q bo'lsa oddiy modal
      setSaleUnit("piece");
      setBigModal(true);
    }
  };

  const confirmBig = () => {
    addWithUnit(hasBox ? saleUnit : "piece");
    setBigModal(false);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 60, 400)).springify()}
      style={[styles.card, width ? { width } : { flex: 1 }]}
    >
      <Pressable
        testID={`product-card-${p.id}`}
        onPress={() => router.push(`/product/${p.id}`)}
      >
        <View style={styles.imgWrap}>
          {imgUri ? (
            <Image
              source={{ uri: imgUri }}
              style={styles.img}
              contentFit="cover"
              transition={200}
              recyclingKey={String(p.id)}
            />
          ) : (
            <View style={[styles.img, styles.placeholder]}>
              <Ionicons name="image-outline" size={32} color={C.muted} />
            </View>
          )}

          {discount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>-{discount}%</Text>
            </View>
          )}

          {p.pinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="star" size={10} color={C.onBrandSoft} />
              <Text style={styles.pinTxt}>TOP</Text>
            </View>
          )}

          {p.out_of_stock && (
            <View style={styles.outOverlay}>
              <Text style={styles.outTxt}>{t("outOfStock")}</Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {ml(p.name, lang)}
          </Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={C.warning} />
            <Text style={styles.rating}>
              {p.rating || "—"} ({p.reviews_count || 0})
            </Text>
          </View>
          <Text style={styles.price}>{fmt(salePrice)}</Text>
          {(compareOldPrice || p.flash_active) && (
            <Text style={styles.oldPrice}>
              {fmt(compareOldPrice || salePrice)}
            </Text>
          )}
          {!!p.units_per_box && (
            <Text style={styles.metaSmall}>
              1 quti = {p.units_per_box} ta
              {p.effective_box_price || p.seller_box_price || p.box_price
                ? ` • quti: ${fmt(
                    p.effective_box_price ??
                      p.seller_box_price ??
                      p.box_price
                  )}`
                : ""}
            </Text>
          )}
          {(p.unit_type === "kg" || p.sale_mode === "kg") && (
            <Text style={styles.metaSmall}>1 kg narxi</Text>
          )}
        </View>
      </Pressable>

      <Pressable
        testID={`product-card-addtocart-${p.id}`}
        style={[
          styles.cartBtn,
          inCart && styles.cartBtnInCart,
          p.out_of_stock && { opacity: 0.5 },
        ]}
        onPress={quickAdd}
        disabled={p.out_of_stock}
      >
        <Ionicons
          name={inCart ? "checkmark-circle" : "cart-outline"}
          size={14}
          color={inCart ? "#fff" : C.brandDark}
        />
        <Text style={[styles.cartBtnTxt, inCart && styles.cartBtnTxtInCart]}>
          {inCart
            ? inCartQty > 0
              ? `Savatda (${inCartQty})`
              : "✓ Savatda"
            : "Savatga qo'shish"}
        </Text>
      </Pressable>

      <Modal
        visible={bigModal}
        transparent
        animationType="fade"
        onRequestClose={() => setBigModal(false)}
      >
        <Pressable
          testID="addtocart-backdrop"
          style={styles.backdrop}
          onPress={() => setBigModal(false)}
        >
          <Pressable
            style={styles.bigCard}
            onPress={(e) => e.stopPropagation()}
          >
            {imgUri ? (
              <Image
                source={{ uri: imgUri }}
                style={styles.bigImg}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.bigImg, styles.placeholder]}>
                <Ionicons name="image-outline" size={40} color={C.muted} />
              </View>
            )}

            <Text style={styles.bigTitle} numberOfLines={2}>
              {ml(p.name, lang)}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="star" size={14} color={C.warning} />
              <Text style={styles.bigRating}>
                {p.rating || "—"} ({p.reviews_count || 0})
              </Text>
            </View>

            <Text style={styles.bigPrice}>
              {fmt(hasBox && saleUnit === "box" ? boxPrice : piecePrice)}
            </Text>
            {compareOldPrice && compareOldPrice > piecePrice && saleUnit === "piece" && (
              <Text style={styles.bigOld}>{fmt(compareOldPrice)}</Text>
            )}
            {hasBox && (
              <Text style={styles.metaSmall}>1 quti = {upb} ta</Text>
            )}

            {hasBox && (
              <View style={styles.unitRow}>
                <Pressable
                  testID="unit-piece"
                  onPress={() => setSaleUnit("piece")}
                  style={[styles.unitChip, saleUnit === "piece" && styles.unitChipOn]}
                >
                  <Text style={[styles.unitChipTxt, saleUnit === "piece" && styles.unitChipTxtOn]}>
                    Dona • {fmt(piecePrice)}
                  </Text>
                </Pressable>
                <Pressable
                  testID="unit-box"
                  onPress={() => setSaleUnit("box")}
                  style={[styles.unitChip, saleUnit === "box" && styles.unitChipOn]}
                >
                  <Text style={[styles.unitChipTxt, saleUnit === "box" && styles.unitChipTxtOn]}>
                    Quti ({upb}) • {fmt(boxPrice)}
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              testID="addtocart-confirm-big"
              style={styles.bigAddBtn}
              onPress={confirmBig}
            >
              <Ionicons name="cart" size={18} color="#fff" />
              <Text style={styles.bigAddTxt}>
                {hasBox
                  ? saleUnit === "box"
                    ? "Quti savatga"
                    : "Dona savatga"
                  : "Savatga qo'shish"}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  imgWrap: {
    aspectRatio: 1,
    backgroundColor: C.tertiary,
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    backgroundColor: C.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: C.error,
    borderRadius: R.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeTxt: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  pinBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pinTxt: {
    color: C.onBrandSoft,
    fontSize: 10,
    fontWeight: "800",
  },
  outOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(249,250,251,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  outTxt: {
    backgroundColor: C.inverse,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  info: {
    padding: S.sm + 2,
  },
  name: {
    fontSize: 13,
    color: C.onCard,
    fontWeight: "600",
    minHeight: 34,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  rating: {
    fontSize: 11,
    color: C.muted,
  },
  price: {
    fontSize: 15,
    fontWeight: "800",
    color: C.onSurface,
    marginTop: 4,
  },
  oldPrice: {
    fontSize: 12,
    color: C.muted,
    textDecorationLine: "line-through",
  },
  metaSmall: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },
  cartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.brandSoft,
    margin: S.sm,
    marginTop: 0,
    paddingVertical: 8,
    borderRadius: R.sm,
  },
  cartBtnTxt: {
    color: C.brandDark,
    fontWeight: "800",
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: S.lg,
  },
  bigCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.lg,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  bigImg: {
    width: 160,
    height: 160,
    borderRadius: R.md,
    marginBottom: S.sm,
  },
  bigTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.onSurface,
    textAlign: "center",
    marginBottom: 4,
  },
  bigRating: {
    fontSize: 12,
    color: C.muted,
    fontWeight: "700",
  },
  bigPrice: {
    fontSize: 22,
    fontWeight: "900",
    color: C.brandDark,
    marginTop: 6,
  },
  bigOld: {
    fontSize: 13,
    color: C.muted,
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  bigAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.brandDark,
    borderRadius: R.md,
    paddingVertical: 14,
    paddingHorizontal: S.xl,
    marginTop: S.md,
    alignSelf: "stretch",
  },
  unitRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
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
  unitChipOn: {
    backgroundColor: C.brandDark,
    borderColor: C.brandDark,
  },
  unitChipTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: C.onSurface,
    textAlign: "center",
  },
  unitChipTxtOn: {
    color: "#fff",
  },
  bigAddTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },
});