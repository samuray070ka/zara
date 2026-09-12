import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { useCart } from "@/src/lib/cart";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLang();
  const { items, setQty, remove, subtotal } = useCart();
  const { token } = useAuth();
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState<any>(null);
  const [promoErr, setPromoErr] = useState("");

  const groups: Record<string, typeof items> = {};
  items.forEach((i) => {
    const k = i.shop_name || t("seller");
    (groups[k] = groups[k] || []).push(i);
  });

  const discount = applied ? applied.discount : 0;
  const total = subtotal - discount;

  const applyPromo = async () => {
    setPromoErr("");
    if (!token) {
      router.push("/auth");
      return;
    }
    try {
      const res = await api("/promo/validate", { method: "POST", body: { code: promo, subtotal } });
      setApplied(res);
    } catch (e: any) {
      setApplied(null);
      setPromoErr(e.message);
    }
  };

  const goCheckout = () => {
    if (!token) {
      router.push("/auth");
      return;
    }
    router.push({ pathname: "/checkout", params: { promo: applied?.code || "" } });
  };

  if (items.length === 0)
    return (
      <View style={[st.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <View style={st.emptyIcon}>
          <Ionicons name="cart-outline" size={48} color={C.brandDark} />
        </View>
        <Text style={st.emptyTitle}>{t("emptyCart")}</Text>
        <Pressable testID="cart-start-shopping-button" style={st.btn} onPress={() => router.push("/(tabs)/home")}>
          <Text style={st.btnTxt}>{t("startShopping")}</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>{t("cart")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 800, width: "100%", alignSelf: "center", paddingBottom: 220 }}>
        {Object.entries(groups).map(([shop, list], gi) => (
          <Animated.View key={shop} entering={FadeInDown.delay(gi * 80).springify()} style={st.group}>
            <View style={st.groupHeader}>
              <Ionicons name="storefront" size={16} color={C.brandDark} />
              <Text style={st.groupTitle}>{shop}</Text>
            </View>
            {list.map((i) => (
              <View key={`${i.product_id}|${i.variation}`} style={st.itemRow}>
                <Image source={{ uri: i.image }} style={st.itemImg} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={st.itemName} numberOfLines={2}>
                    {ml(i.name, lang)}
                    {i.variation ? ` • ${i.variation}` : ""}
                  </Text>
                  <Text style={st.itemPrice}>{fmt(i.price)}</Text>
                  <View style={st.qtyRow}>
                    <Pressable testID={`cart-dec-${i.product_id}`} style={st.qtyBtn} onPress={() => setQty(i.product_id, i.variation, i.qty - 1)}>
                      <Ionicons name="remove" size={16} color={C.onSurface} />
                    </Pressable>
                    <Text style={st.qtyTxt}>{i.qty}</Text>
                    <Pressable testID={`cart-inc-${i.product_id}`} style={[st.qtyBtn, i.qty >= i.stock && { opacity: 0.4 }]} onPress={() => i.qty < i.stock && setQty(i.product_id, i.variation, i.qty + 1)}>
                      <Ionicons name="add" size={16} color={C.onSurface} />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable testID={`cart-remove-${i.product_id}`} onPress={() => remove(i.product_id, i.variation)}>
                      <Ionicons name="trash-outline" size={20} color={C.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </Animated.View>
        ))}

        {/* Promo */}
        <View style={st.promoBox}>
          <TextInput
            testID="cart-promo-input"
            style={st.promoInput}
            value={promo}
            onChangeText={(v) => setPromo(v.toUpperCase())}
            placeholder={t("promoCode")}
            placeholderTextColor={C.muted}
            autoCapitalize="characters"
          />
          <Pressable testID="cart-promo-apply-button" style={st.promoBtn} onPress={applyPromo}>
            <Text style={st.promoBtnTxt}>{t("apply")}</Text>
          </Pressable>
        </View>
        {!!promoErr && <Text testID="cart-promo-error" style={st.err}>{promoErr}</Text>}
        {applied && (
          <View style={st.appliedRow} testID="cart-promo-applied">
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
            <Text style={{ color: C.success, fontWeight: "700", fontSize: 13 }}>
              {applied.code}: −{fmt(applied.discount)}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Summary */}
      <View style={[st.summary, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <View style={{ maxWidth: 800, width: "100%", alignSelf: "center" }}>
          <View style={st.sumRow}>
            <Text style={st.sumLabel}>{t("subtotal")}</Text>
            <Text style={st.sumVal}>{fmt(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={st.sumRow}>
              <Text style={st.sumLabel}>{t("discount")}</Text>
              <Text style={[st.sumVal, { color: C.success }]}>−{fmt(discount)}</Text>
            </View>
          )}
          <View style={st.sumRow}>
            <Text style={st.totalLabel}>{t("total")}</Text>
            <Text testID="cart-total" style={st.totalVal}>{fmt(total)}</Text>
          </View>
          <Pressable testID="cart-checkout-button" style={st.btn} onPress={goCheckout}>
            <Text style={st.btnTxt}>{token ? t("checkout") : t("loginToBuy")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: "900", color: C.onSurface },
  emptyIcon: { width: 96, height: 96, borderRadius: 28, backgroundColor: C.brandTint, alignItems: "center", justifyContent: "center", marginBottom: S.lg },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface, marginBottom: S.lg },
  group: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, marginBottom: S.md, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: S.md, backgroundColor: C.brandTint, borderBottomWidth: 1, borderBottomColor: C.border },
  groupTitle: { fontWeight: "800", color: C.onBrandSoft, fontSize: 14 },
  itemRow: { flexDirection: "row", gap: S.md, padding: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  itemImg: { width: 76, height: 76, borderRadius: R.sm, backgroundColor: C.tertiary },
  itemName: { fontSize: 14, fontWeight: "600", color: C.onSurface },
  itemPrice: { fontSize: 15, fontWeight: "800", color: C.onSurface, marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: S.sm },
  qtyBtn: { width: 30, height: 30, borderRadius: R.sm, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  qtyTxt: { fontSize: 15, fontWeight: "800", color: C.onSurface, minWidth: 24, textAlign: "center" },
  promoBox: { flexDirection: "row", gap: S.sm, marginTop: S.sm },
  promoInput: { flex: 1, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, height: 46, color: C.onSurface, fontWeight: "700" },
  promoBtn: { backgroundColor: C.inverse, borderRadius: R.md, paddingHorizontal: S.lg, justifyContent: "center" },
  promoBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  err: { color: C.error, fontSize: 12, marginTop: 6 },
  appliedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  summary: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, padding: S.lg },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  sumLabel: { color: C.muted, fontSize: 13 },
  sumVal: { color: C.onSurface, fontWeight: "700", fontSize: 13 },
  totalLabel: { color: C.onSurface, fontWeight: "900", fontSize: 16 },
  totalVal: { color: C.brandDark, fontWeight: "900", fontSize: 18 },
  btn: { backgroundColor: C.brandDark, borderRadius: R.md, height: 50, alignItems: "center", justifyContent: "center", marginTop: S.sm },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
