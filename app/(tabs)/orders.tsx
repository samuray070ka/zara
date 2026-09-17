import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { useCart } from "@/src/lib/cart";
import { fetchOrders, readCachedOrders } from "@/src/lib/orders-cache";

const STATUS_COLORS: Record<string, string> = {
  new: C.warning, confirmed: "#0F766E", packing: C.brandDark, courier: "#B45309", delivered: C.success, cancelled: C.error,
};

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLang();
  const { token } = useAuth();
  const { add } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("active");
  const [loaded, setLoaded] = useState(false);
  const [refreshingRemote, setRefreshingRemote] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!token) {
        setOrders([]);
        setLoaded(true);
        setRefreshingRemote(false);
        return () => {
          active = false;
        };
      }

      (async () => {
        const cached = await readCachedOrders(token);
        if (active && cached?.length) {
          setOrders(cached);
          setLoaded(true);
        }
        if (active) setRefreshingRemote(true);
        fetchOrders(token, true)
          .then((o) => {
            if (!active) return;
            setOrders(o);
            setLoaded(true);
          })
          .catch(() => {
            if (!active) return;
            setLoaded(true);
          })
          .finally(() => {
            if (active) setRefreshingRemote(false);
          });
      })();

      return () => {
        active = false;
      };
    }, [token])
  );

  if (!token)
    return (
      <View style={[st.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="receipt-outline" size={56} color={C.borderStrong} />
        <Text style={st.emptyTitle}>{t("loginToBuy")}</Text>
        <Pressable testID="orders-login-button" style={st.btn} onPress={() => router.push("/auth")}>
          <Text style={st.btnTxt}>{t("login")}</Text>
        </Pressable>
      </View>
    );

  const filtered = orders.filter((o) => {
    if (filter === "active") return ["new", "confirmed", "packing", "courier"].includes(o.status);
    if (filter === "done") return o.status === "delivered";
    if (filter === "cancelled") return o.status === "cancelled";
    return true;
  });

  const reorder = (o: any) => {
    o.items.forEach((i: any) => add({ product_id: i.product_id, name: i.name, image: i.image, price: i.price, stock: 99, seller_id: o.seller_id, variation: i.variation }, i.qty));
    router.push("/(tabs)/cart");
  };

  const FILTERS = [
    { k: "active", l: t("active") },
    { k: "done", l: t("done") },
    { k: "cancelled", l: t("cancelled") },
    { k: "all", l: t("all") },
  ];

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>{t("orders")}</Text>
        {refreshingRemote && loaded ? <Text style={st.syncTxt}>Yangilanmoqda...</Text> : null}
      </View>
      <View style={{ height: 56, justifyContent: "center" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, alignItems: "center" }}>
          {FILTERS.map((f) => (
            <Pressable key={f.k} testID={`orders-filter-${f.k}`} style={[st.chip, filter === f.k && st.chipActive]} onPress={() => setFilter(f.k)}>
              <Text style={[st.chipTxt, filter === f.k && st.chipTxtActive]}>{f.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <FlatList
        testID="orders-list"
        data={filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: S.lg, maxWidth: 800, width: "100%", alignSelf: "center", paddingBottom: S.xl }}
        ListEmptyComponent={loaded ? <Text style={{ textAlign: "center", color: C.muted, marginTop: 40 }}>Buyurtmalar yo'q</Text> : <Text style={{ textAlign: "center", color: C.muted, marginTop: 40 }}>Buyurtmalar yuklanmoqda...</Text>}
        renderItem={({ item: o, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
            <Pressable testID={`order-card-${o.id}`} style={st.card} onPress={() => router.push(`/order/${o.id}`)}>
              <View style={st.cardTop}>
                <Text style={st.orderNum}>{o.number}</Text>
                <View style={[st.statusBadge, { backgroundColor: STATUS_COLORS[o.status] + "22" }]}>
                  <Text style={[st.statusTxt, { color: STATUS_COLORS[o.status] }]}>{t(`st_${o.status}`)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginVertical: S.sm }}>
                {o.items.slice(0, 4).map((i: any, idx: number) => {
                  const uri = typeof i?.image === "string" && i.image.length > 8 ? i.image : null;
                  return uri ? (
                    <Image key={idx} source={{ uri }} style={st.thumb} contentFit="cover" />
                  ) : (
                    <View key={idx} style={[st.thumb, { alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="image-outline" size={18} color={C.muted} />
                    </View>
                  );
                })}
                {o.items.length > 4 && <View style={[st.thumb, { alignItems: "center", justifyContent: "center" }]}><Text style={{ fontWeight: "800", color: C.muted }}>+{o.items.length - 4}</Text></View>}
              </View>
              <View style={st.cardBottom}>
                <Text style={st.date}>{new Date(o.created_at).toLocaleDateString()}</Text>
                <Text style={st.total}>{fmt(o.total)}</Text>
              </View>
              {!!o.delivery_eta_days && o.delivery_method === "courier" && ["new","confirmed","packing","courier"].includes(o.status) && (
                <Text style={st.etaInfo}>Taxminiy yetib borish: {o.delivery_eta_days} kun</Text>
              )}
              {!!o.returned_items_count && <Text style={st.returnInfo}>Qaytgan mahsulotlar: {o.returned_items_count} ta</Text>}
              {(o.status === "delivered" || o.status === "cancelled") && (
                <Pressable testID={`order-reorder-${o.id}`} style={st.reorderBtn} onPress={() => reorder(o)}>
                  <Ionicons name="refresh" size={14} color={C.brandDark} />
                  <Text style={st.reorderTxt}>{t("reorder")}</Text>
                </Pressable>
              )}
            </Pressable>
          </Animated.View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: "900", color: C.onSurface },
  syncTxt: { marginTop: 6, color: C.muted, fontSize: 12, fontWeight: "700" },
  chip: { height: 36, paddingHorizontal: S.lg, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: C.inverse, borderColor: C.inverse },
  chipTxt: { fontSize: 13, fontWeight: "600", color: C.onTertiary },
  chipTxtActive: { color: "#fff" },
  card: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, marginBottom: S.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNum: { fontWeight: "900", fontSize: 15, color: C.onSurface },
  statusBadge: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt: { fontSize: 12, fontWeight: "800" },
  thumb: { width: 48, height: 48, borderRadius: R.sm, backgroundColor: C.tertiary },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: C.muted, fontSize: 12 },
  total: { fontWeight: "900", fontSize: 15, color: C.onSurface },
  etaInfo: { fontSize: 12, color: C.brandDark, fontWeight: "700", marginTop: 4 },
  returnInfo: { color: C.error, fontWeight: "800", fontSize: 12, marginTop: 6 },
  reorderBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: S.sm, backgroundColor: C.brandTint, borderRadius: R.sm, paddingVertical: 8 },
  reorderTxt: { color: C.brandDark, fontWeight: "800", fontSize: 13 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.muted, marginVertical: S.lg },
  btn: { backgroundColor: C.brandDark, borderRadius: R.md, paddingHorizontal: S.xl, height: 48, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#fff", fontWeight: "800" },
});