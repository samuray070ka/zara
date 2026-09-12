import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { useCart } from "@/src/lib/cart";
import { api } from "@/src/lib/api";
import { getCurrentLocation, reverseGeocode } from "@/src/lib/geo";

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { promo } = useLocalSearchParams<{ promo?: string }>();
  const { t } = useLang();
  const { user, refresh } = useAuth();
  const { items, subtotal, clear } = useCart();
  const [addrId, setAddrId] = useState<string | null>(null);
  const [newAddr, setNewAddr] = useState("");
  const [method, setMethod] = useState<"courier" | "pickup">("courier");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const [settings, setSettings] = useState<any>({ delivery_fee: 15000, default_delivery_eta_days: 0 });
  const [discount, setDiscount] = useState(0);
  const [gpsLoc, setGpsLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [askPrev, setAskPrev] = useState(false);
  const askedRef = React.useRef(false);

  useEffect(() => {
    api("/settings/public").then(setSettings).catch(() => {});
    if (promo) api("/promo/validate", { method: "POST", body: { code: promo, subtotal } }).then((r) => setDiscount(r.discount)).catch(() => {});
    if (user?.addresses?.length) setAddrId(user.addresses[0].id);
  }, []);

  useEffect(() => {
    if (!askedRef.current && user?.saved_location?.lat != null) {
      askedRef.current = true;
      setAskPrev(true);
    }
  }, [user]);

  const fetchLocation = async () => {
    setLocMsg("");
    setLocLoading(true);
    try {
      const loc = await getCurrentLocation();
      setGpsLoc(loc);
      await api("/users/me/location", { method: "PUT", body: loc });
      refresh();
      setLocMsg("Aniq GPS lokatsiya olindi va profilingizga saqlandi ✓");
      // Auto-fill the address text from the coordinates so the buyer doesn't
      // have to type it manually — only when they're not using a saved address.
      if (!addrId) {
        const readable = await reverseGeocode(loc.lat, loc.lng);
        if (readable) {
          setNewAddr(readable);
          setLocMsg("Aniq GPS lokatsiya olindi, manzil avtomatik aniqlandi ✓");
        }
      }
    } catch (e: any) {
      setLocMsg(e.message);
    }
    setLocLoading(false);
  };

  const usePrevLocation = async () => {
    const loc = { lat: user.saved_location.lat, lng: user.saved_location.lng };
    setGpsLoc(loc);
    setAskPrev(false);
    setLocMsg("Oldingi saqlangan lokatsiya ishlatiladi ✓");
    if (!addrId && !newAddr.trim()) {
      const readable = await reverseGeocode(loc.lat, loc.lng);
      if (readable) setNewAddr(readable);
    }
  };

  const rejectPrevLocation = () => {
    setAskPrev(false);
    setLocMsg('"Joriy lokatsiyamni olish" tugmasi orqali yangi lokatsiyani belgilang');
  };

  const deliveryFee = method === "courier" ? settings.delivery_fee : 0;
  const estimatedDays = parseInt(String(settings.default_delivery_eta_days || 0), 10) || 0;
  const total = subtotal + deliveryFee - discount;
  const selectedAddr = addrId ? user?.addresses?.find((a: any) => a.id === addrId) : null;
  const addressText = selectedAddr ? selectedAddr.text : newAddr;

  const placeOrder = async () => {
    setErr("");
    if (!addressText?.trim()) {
      setErr("Manzilni tanlang yoki kiriting");
      return;
    }
    setLoading(true);
    try {
      if (!addrId && newAddr.trim()) {
        await api("/addresses", { method: "POST", body: { label: "Yangi manzil", text: newAddr, lat: gpsLoc?.lat ?? null, lng: gpsLoc?.lng ?? null } });
        refresh();
      }
      const res = await api("/orders", {
        method: "POST",
        body: {
          items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variation: i.variation })),
          address_text: addressText,
          address_lat: gpsLoc?.lat ?? selectedAddr?.lat ?? null,
          address_lng: gpsLoc?.lng ?? selectedAddr?.lng ?? null,
          delivery_method: method,
          payment_method: "cash",
          comment,
          promo_code: promo || null,
        },
      });
      clear();
      setSuccess(res);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  if (success)
    return (
      <View style={[st.root, { alignItems: "center", justifyContent: "center", padding: S.xl }]}>
        <Animated.View entering={ZoomIn.springify()} style={st.successIcon}>
          <Ionicons name="checkmark" size={54} color="#fff" />
        </Animated.View>
        <Text testID="checkout-success-title" style={st.successTitle}>{t("orderSuccess")}</Text>
        <Text testID="checkout-order-number" style={st.successNum}>{success.number}</Text>
        <Text style={{ color: C.muted, textAlign: "center", marginTop: S.sm }}>Buyurtma holatini "Buyurtmalar" bo'limida kuzatishingiz mumkin</Text>
        <Pressable testID="checkout-go-orders-button" style={[st.btn, { marginTop: S.xl, width: 260 }]} onPress={() => router.replace("/(tabs)/orders")}>
          <Text style={st.btnTxt}>{t("orders")} →</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="checkout-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{t("checkout")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 700, width: "100%", alignSelf: "center", paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {/* Address */}
        <Text style={st.secTitle}>1. {t("address")}</Text>
        {user?.addresses?.map((a: any) => (
          <Pressable key={a.id} testID={`checkout-address-${a.id}`} style={[st.addrCard, addrId === a.id && st.addrCardSel]} onPress={() => setAddrId(a.id)}>
            <Ionicons name={addrId === a.id ? "radio-button-on" : "radio-button-off"} size={20} color={C.brandDark} />
            <View style={{ flex: 1 }}>
              <Text style={st.addrLabel}>{a.label}</Text>
              <Text style={st.addrTxt}>{a.text}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable testID="checkout-new-address-radio" style={[st.addrCard, !addrId && st.addrCardSel]} onPress={() => setAddrId(null)}>
          <Ionicons name={!addrId ? "radio-button-on" : "radio-button-off"} size={20} color={C.brandDark} />
          <Text style={st.addrLabel}>Yangi manzil kiritish</Text>
        </Pressable>
        {!addrId && (
          <TextInput testID="checkout-new-address-input" style={st.input} value={newAddr} onChangeText={setNewAddr} placeholder="Shahar, tuman, ko'cha, uy..." placeholderTextColor={C.muted} />
        )}

        {/* GPS location */}
        <Pressable testID="checkout-get-location-button" style={[st.gpsBtn, locLoading && { opacity: 0.6 }]} onPress={fetchLocation} disabled={locLoading}>
          {locLoading ? <ActivityIndicator color={C.brandDark} size="small" /> : <Ionicons name="locate" size={18} color={C.brandDark} />}
          <Text style={st.gpsBtnTxt}>Joriy lokatsiyamni olish (GPS)</Text>
        </Pressable>
        {gpsLoc && (
          <View style={st.gpsCoordsBox}>
            <Ionicons name="location" size={14} color={C.success} />
            <Text testID="checkout-location-coords" style={st.gpsCoords}>{gpsLoc.lat.toFixed(6)}, {gpsLoc.lng.toFixed(6)}</Text>
          </View>
        )}
        {!!locMsg && <Text testID="checkout-location-msg" style={st.gpsMsg}>{locMsg}</Text>}

        {/* Delivery */}
        <Text style={st.secTitle}>2. {t("delivery")}</Text>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <Pressable testID="checkout-method-courier" style={[st.methodCard, method === "courier" && st.methodSel]} onPress={() => setMethod("courier")}>
            <Ionicons name="bicycle" size={22} color={method === "courier" ? C.brandDark : C.muted} />
            <Text style={[st.methodTxt, method === "courier" && { color: C.brandDark }]}>{t("courierDelivery")}</Text>
            <Text style={st.methodFee}>{fmt(settings.delivery_fee)}</Text>
          </Pressable>
          <Pressable testID="checkout-method-pickup" style={[st.methodCard, method === "pickup" && st.methodSel]} onPress={() => setMethod("pickup")}>
            <Ionicons name="walk" size={22} color={method === "pickup" ? C.brandDark : C.muted} />
            <Text style={[st.methodTxt, method === "pickup" && { color: C.brandDark }]}>{t("pickup")}</Text>
            <Text style={st.methodFee}>0 so'm</Text>
          </Pressable>
        </View>
        {method === "courier" && estimatedDays > 0 && (
          <View style={st.etaBox}>
            <Ionicons name="time-outline" size={16} color={C.brandDark} />
            <Text style={st.etaTxt}>Taxminiy yetib borish muddati: {estimatedDays} kun</Text>
          </View>
        )}

        {/* Payment */}
        <Text style={st.secTitle}>3. To'lov usuli</Text>
        <View style={[st.addrCard, st.addrCardSel]}>
          <Ionicons name="cash" size={22} color={C.success} />
          <Text style={st.addrLabel}>{t("cash")}</Text>
          <Ionicons name="checkmark-circle" size={20} color={C.brandDark} />
        </View>
        <View style={[st.addrCard, { opacity: 0.5 }]}>
          <Ionicons name="card" size={22} color={C.muted} />
          <Text style={st.addrLabel}>Payme / Click / Uzum</Text>
          <Text style={{ fontSize: 11, color: C.muted, fontWeight: "700" }}>Tez kunda</Text>
        </View>

        {/* Comment */}
        <Text style={st.secTitle}>4. {t("comment")}</Text>
        <TextInput testID="checkout-comment-input" style={[st.input, { minHeight: 70 }]} value={comment} onChangeText={setComment} placeholder='Masalan: "domofon ishlamaydi"' placeholderTextColor={C.muted} multiline />

        {!!err && <Text testID="checkout-error" style={{ color: C.error, marginTop: S.md, fontWeight: "600" }}>{err}</Text>}
      </ScrollView>

      {/* Previous location modal */}
      {askPrev && (
        <View style={st.modalOverlay}>
          <View testID="checkout-prev-location-modal" style={st.modalBox}>
            <View style={st.modalIcon}>
              <Ionicons name="location" size={26} color={C.brandDark} />
            </View>
            <Text style={st.modalTitle}>Oldingi lokatsiyadamisiz?</Text>
            <Text style={st.modalSub}>Profilingizda oldingi buyurtmadan saqlangan GPS lokatsiya mavjud. Hozir ham o'sha yerdamisiz?</Text>
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg, width: "100%" }}>
              <Pressable testID="checkout-prev-location-yes" style={[st.modalBtn, { backgroundColor: C.brandDark }]} onPress={usePrevLocation}>
                <Text style={st.modalBtnTxt}>Ha</Text>
              </Pressable>
              <Pressable testID="checkout-prev-location-no" style={[st.modalBtn, { backgroundColor: C.tertiary }]} onPress={rejectPrevLocation}>
                <Text style={[st.modalBtnTxt, { color: C.onSurface }]}>Yo'q</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Bottom summary */}
      <View style={[st.bottom, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <View style={{ maxWidth: 700, width: "100%", alignSelf: "center" }}>
          <View style={st.sumRow}><Text style={st.sumLabel}>{t("subtotal")}</Text><Text style={st.sumVal}>{fmt(subtotal)}</Text></View>
          <View style={st.sumRow}><Text style={st.sumLabel}>{t("delivery")}</Text><Text style={st.sumVal}>{fmt(deliveryFee)}</Text></View>
          {discount > 0 && <View style={st.sumRow}><Text style={st.sumLabel}>{t("discount")}</Text><Text style={[st.sumVal, { color: C.success }]}>−{fmt(discount)}</Text></View>}
          <View style={st.sumRow}><Text style={{ fontWeight: "900", fontSize: 16, color: C.onSurface }}>{t("total")}</Text><Text testID="checkout-total" style={{ fontWeight: "900", fontSize: 18, color: C.brandDark }}>{fmt(total)}</Text></View>
          <Pressable testID="checkout-place-order-button" style={[st.btn, loading && { opacity: 0.6 }]} onPress={placeOrder} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t("placeOrder")}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.onSurface },
  secTitle: { fontSize: 15, fontWeight: "900", color: C.onSurface, marginTop: S.xl, marginBottom: S.sm },
  addrCard: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1.5, borderColor: C.border },
  addrCardSel: { borderColor: C.brandDark, backgroundColor: C.brandTint },
  addrLabel: { fontWeight: "700", fontSize: 14, color: C.onSurface, flex: 1 },
  addrTxt: { fontSize: 12, color: C.muted, marginTop: 2 },
  input: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, color: C.onSurface, fontSize: 14 },
  methodCard: { flex: 1, alignItems: "center", gap: 6, backgroundColor: C.card, borderRadius: R.md, padding: S.lg, borderWidth: 1.5, borderColor: C.border },
  methodSel: { borderColor: C.brandDark, backgroundColor: C.brandTint },
  methodTxt: { fontWeight: "800", fontSize: 13, color: C.onTertiary, textAlign: "center" },
  methodFee: { fontSize: 12, color: C.muted, fontWeight: "700" },
  etaBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: S.sm,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.brandTint,
    borderWidth: 1,
    borderColor: C.border,
  },
  etaTxt: {
    color: C.brandDark,
    fontSize: 13,
    fontWeight: "800",
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, padding: S.lg },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  sumLabel: { color: C.muted, fontSize: 13 },
  sumVal: { color: C.onSurface, fontWeight: "700", fontSize: 13 },
  btn: { backgroundColor: C.brandDark, borderRadius: R.md, height: 52, alignItems: "center", justifyContent: "center", marginTop: S.sm },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  successIcon: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.success, alignItems: "center", justifyContent: "center", marginBottom: S.xl },
  successTitle: { fontSize: 24, fontWeight: "900", color: C.onSurface },
  successNum: { fontSize: 20, fontWeight: "900", color: C.brandDark, marginTop: S.sm },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.brandTint, borderRadius: R.md, height: 46, marginTop: S.sm, borderWidth: 1.5, borderColor: C.brandDark, borderStyle: "dashed" },
  gpsBtnTxt: { color: C.brandDark, fontWeight: "800", fontSize: 13 },
  gpsCoordsBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: S.sm },
  gpsCoords: { color: C.success, fontWeight: "700", fontSize: 12 },
  gpsMsg: { color: C.onTertiary, fontSize: 12, marginTop: 6, fontWeight: "600" },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 100, padding: S.xl },
  modalBox: { backgroundColor: C.card, borderRadius: R.lg, padding: S.xl, width: "100%", maxWidth: 380, alignItems: "center" },
  modalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.brandTint, alignItems: "center", justifyContent: "center", marginBottom: S.md },
  modalTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface, textAlign: "center" },
  modalSub: { fontSize: 13, color: C.muted, textAlign: "center", marginTop: S.sm, lineHeight: 19 },
  modalBtn: { flex: 1, borderRadius: R.md, height: 46, alignItems: "center", justifyContent: "center" },
  modalBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});