import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";

const FLOW = ["new", "confirmed", "packing", "courier", "delivered"];

function PulseDot() {
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withRepeat(withTiming(1.5, { duration: 700 }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[st.pulse, style]} />;
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLang();
  const [o, setO] = useState<any>(null);

  const load = useCallback(() => {
    api(`/orders/${id}`).then(setO).catch(() => {});
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const iv = setInterval(load, 10000);
      return () => clearInterval(iv);
    }, [load])
  );

  if (!o) return <View style={st.root} />;

  const cancelled = o.status === "cancelled";
  const currentIdx = FLOW.indexOf(o.status);

  const cancel = async () => {
    await api(`/orders/${o.id}/cancel`, { method: "POST" }).catch(() => {});
    load();
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="order-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{o.number}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 700, width: "100%", alignSelf: "center", paddingBottom: S.xxl }}>
        {/* Timeline */}
        <View style={st.card}>
          <Text style={st.secTitle}>Buyurtma holati</Text>
          {cancelled ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
              <View style={[st.node, { backgroundColor: C.error }]}>
                <Ionicons name="close" size={16} color="#fff" />
              </View>
              <Text style={[st.nodeTxt, { color: C.error }]}>{t("st_cancelled")}</Text>
            </View>
          ) : (
            FLOW.map((s, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              const hist = o.status_history?.find((h: any) => h.status === s);
              return (
                <View key={s} style={st.timelineRow}>
                  <View style={{ alignItems: "center" }}>
                    <View style={[st.node, done && { backgroundColor: C.success }, active && { backgroundColor: C.brandDark }]}>
                      {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : active ? <PulseDot /> : null}
                    </View>
                    {i < FLOW.length - 1 && <View style={[st.line, done && { backgroundColor: C.success }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < FLOW.length - 1 ? S.lg : 0 }}>
                    <Text style={[st.nodeTxt, (done || active) && { color: C.onSurface, fontWeight: "800" }]}>{t(`st_${s}`)}</Text>
                    {hist && <Text style={st.nodeDate}>{new Date(hist.at).toLocaleString()}</Text>}
                  </View>
                </View>
              );
            })
          )}
          {o.courier && o.status === "courier" && (
            <View style={st.courierCard} testID="order-courier-info">
              <Ionicons name="bicycle" size={20} color={C.brandDark} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", color: C.onSurface }}>{o.courier.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{o.courier.phone}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={st.card}>
          <Text style={st.secTitle}>Mahsulotlar</Text>
          {o.items.map((i: any, idx: number) => (
            <View key={idx} style={st.itemRow}>
              <Image source={{ uri: i.image }} style={st.itemImg} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={st.itemName}>{ml(i.name, lang)}{i.variation ? ` • ${i.variation}` : ""}</Text>
                <Text style={st.itemMeta}>{i.qty} × {fmt(i.price)}</Text>
              </View>
              {i.delivery_status === "returned" && (
                <View style={st.returnBadge}>
                  <Text style={st.returnBadgeTxt}>Qaytgan</Text>
                </View>
              )}
            </View>
          ))}
          {!!o.returned_items_count && <Text style={st.returnInfo}>Qaytgan mahsulotlar: {o.returned_items_count} ta</Text>}
        </View>

        {/* Details */}
        <View style={st.card}>
          <View style={st.dRow}><Text style={st.dLabel}>{t("address")}</Text><Text style={st.dVal}>{o.address_text}</Text></View>
          <View style={st.dRow}><Text style={st.dLabel}>{t("delivery")}</Text><Text style={st.dVal}>{o.delivery_method === "courier" ? t("courierDelivery") : t("pickup")}</Text></View>
          <View style={st.dRow}><Text style={st.dLabel}>To'lov</Text><Text style={st.dVal}>{t("cash")}</Text></View>
          {!!o.comment && <View style={st.dRow}><Text style={st.dLabel}>{t("comment")}</Text><Text style={st.dVal}>{o.comment}</Text></View>}
          {!!o.original_subtotal && o.original_subtotal !== o.subtotal && <View style={st.dRow}><Text style={st.dLabel}>Asl subtotal</Text><Text style={st.dVal}>{fmt(o.original_subtotal)}</Text></View>}
          <View style={st.dRow}><Text style={st.dLabel}>{t("subtotal")}</Text><Text style={st.dVal}>{fmt(o.subtotal)}</Text></View>
          {!!o.returned_subtotal && <View style={st.dRow}><Text style={st.dLabel}>Qaytgan mahsulotlar</Text><Text style={[st.dVal, { color: C.error }]}>−{fmt(o.returned_subtotal)}</Text></View>}
          <View style={st.dRow}><Text style={st.dLabel}>{t("delivery")}</Text><Text style={st.dVal}>{fmt(o.delivery_fee)}</Text></View>
          {o.discount > 0 && <View style={st.dRow}><Text style={st.dLabel}>{t("discount")}</Text><Text style={[st.dVal, { color: C.success }]}>−{fmt(o.discount)}</Text></View>}
          <View style={st.dRow}><Text style={[st.dLabel, { fontWeight: "900", color: C.onSurface }]}>{t("total")}</Text><Text style={{ fontWeight: "900", fontSize: 16, color: C.brandDark }}>{fmt(o.total)}</Text></View>
        </View>

        {["new", "confirmed"].includes(o.status) && (
          <Pressable testID="order-cancel-button" style={st.cancelBtn} onPress={cancel}>
            <Text style={{ color: C.error, fontWeight: "800" }}>{t("cancel")}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface },
  card: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.lg, marginBottom: S.md },
  secTitle: { fontSize: 16, fontWeight: "900", color: C.onSurface, marginBottom: S.md },
  timelineRow: { flexDirection: "row", gap: S.md },
  node: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" },
  line: { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 2 },
  nodeTxt: { fontSize: 14, color: C.muted, fontWeight: "600", marginTop: 3 },
  nodeDate: { fontSize: 11, color: C.borderStrong, marginTop: 2 },
  courierCard: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.brandTint, borderRadius: R.md, padding: S.md, marginTop: S.md },
  itemRow: { flexDirection: "row", gap: S.md, alignItems: "center", marginBottom: S.md },
  itemImg: { width: 52, height: 52, borderRadius: R.sm, backgroundColor: C.tertiary },
  itemName: { fontSize: 13, fontWeight: "700", color: C.onSurface },
  itemMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  returnBadge: { borderRadius: R.pill, backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4 },
  returnBadgeTxt: { color: C.error, fontSize: 10, fontWeight: "800" },
  returnInfo: { fontSize: 12, color: C.error, fontWeight: "800", marginTop: 4 },
  dRow: { flexDirection: "row", justifyContent: "space-between", gap: S.lg, marginBottom: S.sm },
  dLabel: { color: C.muted, fontSize: 13 },
  dVal: { color: C.onSurface, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  cancelBtn: { alignItems: "center", padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
});
