import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal, Platform, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import { EmptyState, SectionLoader } from "@/src/components/SectionState";
import { searchByImage, pickerAssetToUri } from "@/src/lib/imageSearch";

const SECTIONS = [
  { k: "dashboard", l: "Dashboard", icon: "speedometer" },
  { k: "orders", l: "Buyurtmalar", icon: "receipt" },
  { k: "rejected_orders", l: "Rad etilganlar", icon: "alert-circle" },
  { k: "products", l: "Mahsulotlar", icon: "cube" },
  { k: "sellers", l: "Sotuvchilar", icon: "storefront" },
  { k: "clients", l: "Mijozlar", icon: "people" },
  { k: "couriers", l: "Kuryerlar", icon: "bicycle" },
  { k: "map", l: "Xarita", icon: "map" },
  { k: "categories", l: "Kategoriyalar", icon: "grid" },
  { k: "banners", l: "Bannerlar", icon: "image" },
  { k: "promos", l: "Promokodlar", icon: "pricetag" },
  { k: "flash", l: "Flash Sale", icon: "flash" },
  { k: "reviews", l: "Sharhlar", icon: "star" },
  { k: "sms", l: "SMS jurnal", icon: "chatbox" },
  { k: "settings", l: "Sozlamalar", icon: "settings" },
];

const ORDER_STATUSES = ["new", "confirmed", "packing", "courier", "seller_rejected", "delivered", "cancelled"];
const ST_LABEL: Record<string, string> = { new: "Yangi", confirmed: "Tasdiqlandi", packing: "Yig'ilmoqda", courier: "Kuryerda", seller_rejected: "Sotuvchi rad etdi", delivered: "Yetkazildi", cancelled: "Bekor" };

function buildMapHtml(markers: any[]) {
  const data = JSON.stringify(markers || []).replace(/</g, "\\u003c");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:#e5e7eb}
.legend{position:absolute;bottom:12px;left:12px;z-index:1000;background:#fff;padding:8px 10px;border-radius:8px;font:12px/1.45 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);max-width:220px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
</style>
</head><body>
<div id="map"></div>
<div class="legend">
<div><span class="dot" style="background:#DC2626"></span>Mijoz (1 oy ichida)</div>
<div><span class="dot" style="background:#2563EB"></span>Yangi mijoz</div>
<div><span class="dot" style="background:#EC4899"></span>Buyurtma (7 kun)</div>
<div><span class="dot" style="background:#16a34a"></span>Sotuvchi</div>
<div><span class="dot" style="background:#EAB308"></span>Kuryer</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
const markers = ${data};
const map = L.map('map').setView([41.31, 69.24], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OSM'}).addTo(map);
const bounds = [];
function icon(color) {
  return L.divIcon({
    className: '',
    html: '<div style="background:'+color+';width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [16,16], iconAnchor: [8,8]
  });
}
(markers || []).forEach(function(m) {
  if (m.lat == null || m.lng == null) return;
  var marker = L.marker([m.lat, m.lng], {icon: icon(m.color || '#666')}).addTo(map);
  var title = String(m.title || '').replace(/</g,'&lt;');
  var sub = String(m.subtitle || '').replace(/</g,'&lt;');
  var role = String(m.role_label || '').replace(/</g,'&lt;');
  marker.bindPopup('<b>'+ role + '</b><br/>' + title + '<br/>' + sub);
  bounds.push([m.lat, m.lng]);
});
if (bounds.length) map.fitBounds(bounds, {padding: [30,30], maxZoom: 14});
setTimeout(function(){ map.invalidateSize(); }, 200);
<\/script>
</body></html>`;
}

/** Web da WebView ishlamaydi — iframe; native da WebView */
function AdminMapView({ markers }: { markers: any[] }) {
  const html = buildMapHtml(markers);
  if (Platform.OS === "web") {
    // @ts-ignore — web iframe
    return (
      <iframe
        title="Admin xarita"
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 12 }}
      />
    );
  }
  return (
    <WebView
      originWhitelist={["*"]}
      style={{ flex: 1, backgroundColor: "#e5e7eb" }}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
    />
  );
}


export default function Admin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useLang();
  const [sec, setSec] = useState("dashboard");
  const [dash, setDash] = useState<any>(null);
  const [lowStockItems, setLowStockItems] = useState<any[] | null>(null);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [rejectedOrders, setRejectedOrders] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [sms, setSms] = useState<any[]>([]);
  const [mapData, setMapData] = useState<any>({ markers: [], counts: {} });
  const [settings, setSettings] = useState<any>({});
const [prodFilter, setProdFilter] = useState("");
const [prodSearch, setProdSearch] = useState("");
const [prodImageSearch, setProdImageSearch] = useState(false);
const [prodImageUri, setProdImageUri] = useState<string | null>(null);
const [prodImageResults, setProdImageResults] = useState<any[] | null>(null);
const [prodImageLoading, setProdImageLoading] = useState(false);
const [prodImageError, setProdImageError] = useState("");
const [userQ, setUserQ] = useState("");
const [msg, setMsg] = useState("");

// forms
const [catForm, setCatForm] = useState({ name_uz: "", icon: "category", preview_image: "" });
const [bannerForm, setBannerForm] = useState({ image: "", title: "" });
const [promoForm, setPromoForm] = useState({ code: "", value: "", type: "percent", min_cart: "", limit: "" });
const [flashForm, setFlashForm] = useState({ product_id: "", price: "", hours: "24" });
const [courierForm, setCourierForm] = useState({ phone: "+998", first_name: "", zone: "" });
const [setForm, setSetForm] = useState({
  delivery_fee: "",
  min_order: "",
  work_hours: "",
  contact: "",
  default_markup_percent: "",
  default_delivery_eta_days: "",
});
const [resetTarget, setResetTarget] = useState<any>(null);
const [resetConfirmText, setResetConfirmText] = useState("");
const [bulkMarkup, setBulkMarkup] = useState("");
const [markupEdit, setMarkupEdit] = useState<Record<string, string>>({});
const [openCouriers, setOpenCouriers] = useState<Record<string, boolean>>({});
const [openSellers, setOpenSellers] = useState<Record<string, boolean>>({});
const [catEdit, setCatEdit] = useState<any>(null);
const [catEditForm, setCatEditForm] = useState<any>({ name_uz: "", name_ru: "", name_en: "", icon: "category", parent_id: null, order: 0, preview_image: "" });
const [bannerEdit, setBannerEdit] = useState<any>(null);
const [promoView, setPromoView] = useState<any>(null);
const [dashHistory, setDashHistory] = useState<any>(null);
const [dashHistoryLoading, setDashHistoryLoading] = useState(false);
const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({});
/** Buyurtma status tugmalari default yopiq — ko'z bosilganda ochiladi */
const [statusUnlocked, setStatusUnlocked] = useState<Record<string, boolean>>({});
const [rejectedSelections, setRejectedSelections] = useState<Record<string, Record<string, string>>>({});
  const [expandedRejectKey, setExpandedRejectKey] = useState<string | null>(null);
const [sellerBusy, setSellerBusy] = useState<string | null>(null);
const [prodBusy, setProdBusy] = useState<string | null>(null);
const [bannerEditForm, setBannerEditForm] = useState<any>({ title: "", image: "", link_type: "none", link_id: "", expires_at: "" });
const [bannerUploading, setBannerUploading] = useState(false);
const [loadingSec, setLoadingSec] = useState<string | null>("dashboard");
const [dashboardResetPanelOpen, setDashboardResetPanelOpen] = useState(false);
const [dashboardResetBusy, setDashboardResetBusy] = useState(false);
const [dashboardResetConfirmText, setDashboardResetConfirmText] = useState("");

  const loadIdRef = useRef(0);

  const load = useCallback(async (s: string, opts: { silent?: boolean } = {}) => {
    const loadId = ++loadIdRef.current;
    if (!opts.silent) setLoadingSec(s);
    setMsg("");
    const alive = () => loadIdRef.current === loadId;
    try {
      if (s === "dashboard") {
        const data = await api("/admin/dashboard");
        if (alive()) setDash(data);
      }
      if (s === "orders") {
        const data = await api("/admin/orders");
        if (alive()) setOrders(Array.isArray(data) ? data : []);
      }
      if (s === "products" || s === "flash") {
        const qs = s === "products" && prodFilter ? `?status=${encodeURIComponent(prodFilter)}` : "";
        const data = await api(`/admin/products${qs}`);
        if (alive()) setProducts(Array.isArray(data) ? data : []);
      }
      if (s === "sellers") {
        const data = await api(`/admin/users?role=seller${userQ ? `&q=${encodeURIComponent(userQ)}` : ""}`);
        if (alive()) setUsers(Array.isArray(data) ? data : []);
      }
      if (s === "clients") {
        const data = await api(`/admin/users?role=client${userQ ? `&q=${encodeURIComponent(userQ)}` : ""}`);
        if (alive()) setUsers(Array.isArray(data) ? data : []);
      }
      if (s === "couriers") {
        const data = await api("/admin/users?role=courier");
        if (alive()) setUsers(Array.isArray(data) ? data : []);
      }
      if (s === "categories") {
        const data = await api("/categories");
        if (alive()) setCats(Array.isArray(data) ? data : []);
      }
      if (s === "banners") {
        const data = await api("/banners");
        if (alive()) setBanners(Array.isArray(data) ? data : []);
      }
      if (s === "promos") {
        const data = await api("/admin/promocodes");
        if (alive()) setPromos(Array.isArray(data) ? data : []);
      }
      if (s === "rejected_orders") {
        const data = await api("/admin/rejected-orders");
        if (alive()) setRejectedOrders(Array.isArray(data) ? data : []);
      }
      if (s === "reviews") {
        const data = await api("/admin/reviews");
        if (alive()) setReviews(Array.isArray(data) ? data : []);
      }
      if (s === "sms") {
        const data = await api("/admin/sms-log");
        if (alive()) setSms(Array.isArray(data) ? data : []);
      }
      if (s === "map") {
        const data = await api("/admin/map-locations");
        if (alive()) setMapData(data || { markers: [], counts: {} });
      }
      if (s === "settings") {
  const r = await api("/admin/settings");
  if (!alive()) return;
  setSettings(r);
  setSetForm({
    delivery_fee: String(r.delivery_fee || ""),
    min_order: String(r.min_order || ""),
    work_hours: r.work_hours || "",
    contact: r.contact || "",
    default_markup_percent: String(r.default_markup_percent ?? "0"),
    default_delivery_eta_days: String(r.default_delivery_eta_days ?? ""),
  });
}

    } catch (e: any) {
      if (alive()) setMsg(e?.message || "Ma'lumotni yuklab bo'lmadi");
    } finally {
      if (!opts.silent && alive()) setLoadingSec(null);
    }
  }, [prodFilter, userQ]);


  useFocusEffect(useCallback(() => { load(sec); }, [sec, load]));
  useEffect(() => {
  load("settings", { silent: true });
}, [load]);


  useEffect(() => {
    if (sec === "products") load("products");
  }, [sec, prodFilter, load]);

  const Stat = ({ metric, label, value, icon, color }: any) => (
    <Pressable onPress={async () => {
      setDashHistoryLoading(true);
      try {
        const res = await api(`/admin/dashboard/history?metric=${metric}`);
        setDashHistory(res);
      } catch (e: any) {
        setMsg(e.message || "Tarixni yuklab bo'lmadi");
      } finally {
        setDashHistoryLoading(false);
      }
    }} style={[st.statCard, { borderLeftColor: color || C.brandDark, borderLeftWidth: 3 }]}>
      <Ionicons name={icon} size={18} color={color || C.brandDark} />
      <Text style={st.statVal}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.meta}>Tarixni ko'rish</Text>
    </Pressable>
  );

  const toggleCourier = (courierId: string) => {
    setOpenCouriers((prev) => ({ ...prev, [courierId]: !prev[courierId] }));
  };

  const toggleSeller = (sellerId: string) => {
    setOpenSellers((prev) => ({ ...prev, [sellerId]: !prev[sellerId] }));
  };

  const openCategoryEditor = (category: any) => {
    setCatEdit(category);
    setCatEditForm({
      name_uz: category?.name?.uz || "",
      name_ru: category?.name?.ru || category?.name?.uz || "",
      name_en: category?.name?.en || category?.name?.uz || "",
      icon: category?.icon || "category",
      parent_id: category?.parent_id || null,
      order: category?.order || 0,
      preview_image: category?.preview_image || category?.image || "",
    });
  };

  const closeCategoryEditor = () => {
    setCatEdit(null);
    setCatEditForm({ name_uz: "", name_ru: "", name_en: "", icon: "category", parent_id: null, order: 0, preview_image: "" });
  };

  
  const pickBannerImage = async (target: "create" | "edit") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setMsg("Rasm yuklash uchun galereyaga ruxsat bering");
      return;
    }
    setBannerUploading(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.55,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        const uri = `data:image/jpeg;base64,${res.assets[0].base64}`;
        if (target === "create") {
          setBannerForm((f) => ({ ...f, image: uri }));
        } else {
          setBannerEditForm((f: any) => ({ ...f, image: uri }));
        }
      }
    } catch {
      setMsg("Rasm tanlashda xatolik");
    }
    setBannerUploading(false);
  };

const openBannerEditor = (banner: any) => {
    setBannerEdit(banner);
    setBannerEditForm({
      title: banner?.title || "",
      image: banner?.image || "",
      link_type: banner?.link_type || "none",
      link_id: banner?.link_id || "",
      expires_at: banner?.expires_at || "",
    });
  };

  const closeBannerEditor = () => {
    setBannerEdit(null);
    setBannerEditForm({ title: "", image: "", link_type: "none", link_id: "", expires_at: "" });
  };

  const setRejectedSelection = (orderId: string, itemIndex: number, productId: string) => {
    setRejectedSelections((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [String(itemIndex)]: productId },
    }));
  };

 const saveOrderEta = async (orderId: string) => {
  const fallbackEta = parseInt(String(settings?.default_delivery_eta_days ?? "0"), 10) || 0;
  const eta_days = parseInt(etaDrafts[orderId] || String(fallbackEta), 10) || 0;
  await api(`/admin/orders/${orderId}/eta`, { method: "POST", body: { eta_days } });
  setMsg("Yetkazish muddati saqlandi ✓");
  load("orders");
};


  const openLowStock = async () => {
    setLowStockLoading(true);
    setLowStockItems(null);
    try {
      const res = await api("/admin/products/low-stock");
      setLowStockItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e: any) {
      setMsg(e?.message || "Yuklashda xatolik");
      setLowStockItems([]);
    } finally {
      setLowStockLoading(false);
    }
  };

  const resolveRejectedOrder = async (order: any) => {

  const picks = rejectedSelections[order.id] || {};
  const replacements = (order.replacement_options || []).map((entry: any) => ({
    item_index: entry.item_index,
    product_id: picks[String(entry.item_index)],
  }));
  if (replacements.some((r: any) => !r.product_id)) {
    setMsg("Har bir mahsulot uchun o'xshash variant tanlang");
    return;
  }
  const fallbackEta = parseInt(String(settings?.default_delivery_eta_days ?? "0"), 10) || 0;
  const eta_days = parseInt(etaDrafts[order.id] || String(fallbackEta), 10) || 0;
  await api(`/admin/rejected-orders/${order.id}/resolve`, {
    method: "POST",
    body: { replacements, eta_days, note: "Admin boshqa sotuvchidan mahsulot topdi" },
  });
  setMsg(`${order.number} boshqa sotuvchiga o'tkazildi ✓`);
  load("rejected_orders");
  load("orders");
};
const defaultEtaDays = parseInt(String(settings?.default_delivery_eta_days ?? "0"), 10) || 0;
const getEtaInputValue = (order: any) =>
  etaDrafts[order.id] ?? String(order.delivery_eta_days ?? (defaultEtaDays || ""));

const normalizedProdSearch = prodSearch.trim().toLowerCase();

const visibleProducts = useMemo(() => {
  if (sec === "products" && prodImageSearch && Array.isArray(prodImageResults)) {
    return prodImageResults;
  }
  const list = Array.isArray(products) ? products : [];
  if (sec !== "products" || prodFilter !== "approved" || !normalizedProdSearch) return list;

  return list.filter((p) => {
    const name = ml(p.name, lang).toLowerCase();
    const idText = String(p.id || "").toLowerCase();
    return name.includes(normalizedProdSearch) || idText.includes(normalizedProdSearch);
  });
}, [products, sec, prodFilter, normalizedProdSearch, lang, prodImageSearch, prodImageResults]);

  const runAdminImageSearch = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setProdImageError("Galereyaga ruxsat bering");
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
        setProdImageError("Rasm o'qib bo'lmadi");
        return;
      }
      setProdImageUri(uri);
      setProdImageLoading(true);
      setProdImageError("");
      setProdImageSearch(true);
      setProdImageResults([]);
      try {
        const items = await searchByImage(uri);
        setProdImageResults(items);
        if (!items.length) setProdImageError("O'xshash mahsulot topilmadi");
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (/404|not found/i.test(msg)) {
          setProdImageError("Rasm orqali qidiruv backendda hali yoqilmagan");
        } else {
          setProdImageError(msg || "Qidirishda xatolik");
        }
        setProdImageResults([]);
      }
      setProdImageLoading(false);
    } catch {
      setProdImageError("Rasm tanlashda xatolik");
      setProdImageLoading(false);
    }
  };

  const clearAdminImageSearch = () => {
    setProdImageSearch(false);
    setProdImageUri(null);
    setProdImageResults(null);
    setProdImageError("");
    setProdImageLoading(false);
  };


  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="admin-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={st.headerTitle}>Admin panel</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ height: 56, justifyContent: "center", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, alignItems: "center" }}>
          {SECTIONS.map((s) => (
            <Pressable key={s.k} testID={`admin-section-${s.k}`} style={[st.chip, sec === s.k && st.chipActive]} onPress={() => setSec(s.k)}>
              <Ionicons name={s.icon as any} size={13} color={sec === s.k ? "#fff" : C.muted} />
              <Text style={[st.chipTxt, sec === s.k && { color: "#fff" }]}>{s.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {!!msg && <Text style={st.msg}>{msg}</Text>}

      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 1000, width: "100%", alignSelf: "center", paddingBottom: S.xxl }}>
        {sec === "dashboard" && (
          loadingSec === "dashboard" && !dash ? (
            <SectionLoader label="Dashboard ma'lumotlari yuklanmoqda..." />
          ) : dash ? (
            <>
            <View style={st.statGrid}>
              <Stat metric="today_orders" label="Bugungi buyurtmalar" value={dash.today_orders} icon="today" />
              <Stat metric="today_sales" label="Bugungi savdo" value={fmt(dash.today_sales)} icon="cash" />
              <Stat metric="today_profit" label="Bugungi sof foyda" value={fmt(dash.today_profit || 0)} icon="wallet" color={C.success} />
              <Stat metric="total_orders" label="Jami buyurtmalar" value={dash.total_orders} icon="receipt" />
              <Stat metric="total_sales" label="Jami savdo" value={fmt(dash.total_sales)} icon="trending-up" />
              <Stat metric="total_profit" label="Jami sof foyda" value={fmt(dash.total_profit || 0)} icon="cash-outline" color={C.success} />
              <Stat metric="profit_margin" label="Sof foyda foizi" value={`${(dash.profit_margin || 0).toFixed(1)}%`} icon="pie-chart" color={C.brandDark} />
              <Stat metric="clients" label="Mijozlar" value={dash.clients} icon="people" />
              <Stat metric="sellers" label="Sotuvchilar" value={dash.sellers} icon="storefront" />
              <Stat metric="couriers_online" label="Onlayn kuryerlar" value={dash.couriers_online} icon="bicycle" color={C.success} />
              <Stat metric="new_orders" label="Yangi buyurtmalar" value={dash.new_orders} icon="alert-circle" color={C.warning} />
              <Stat metric="pending_products" label="Moderatsiyada mahsulot" value={dash.pending_products} icon="hourglass" color={C.warning} />
              <Stat metric="pending_sellers" label="Kutayotgan sotuvchi" value={dash.pending_sellers} icon="person-add" color={C.warning} />
              <Pressable
                style={[st.statCard, { borderLeftColor: C.brandDark, borderLeftWidth: 3 }]}
                onPress={() => setMsg(`Jami mahsulotlar: ${dash.total_products || 0}`)}
              >
                <Ionicons name="cube" size={18} color={C.brandDark} />
                <Text style={st.statVal}>{dash.total_products || 0}</Text>
                <Text style={st.statLabel}>Jami mahsulotlar</Text>
              </Pressable>
              <Pressable
                style={[st.statCard, { borderLeftColor: C.error, borderLeftWidth: 3 }]}
                onPress={openLowStock}
              >
                <Ionicons name="alert-circle" size={18} color={C.error} />
                <Text style={[st.statVal, { color: C.error }]}>{dash.low_stock_count || 0}</Text>
                <Text style={st.statLabel}>10 tadan kam qolgan</Text>
              </Pressable>
            </View>

            {(lowStockLoading || lowStockItems !== null) && (
              <View style={[st.detailBox, { marginTop: S.md }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S.sm }}>
                  <Text style={st.bold}>Kam qolgan mahsulotlar (10 dan kam)</Text>
                  <Pressable onPress={() => setLowStockItems(null)}>
                    <Ionicons name="close" size={20} color={C.muted} />
                  </Pressable>
                </View>
                {lowStockLoading && (
                  <ActivityIndicator color={C.brandDark} style={{ marginVertical: 16 }} />
                )}
                {!lowStockLoading && (lowStockItems || []).length === 0 && (
                  <Text style={st.meta}>Barcha mahsulotlarda yetarli qoldiq bor</Text>
                )}
                {!lowStockLoading && (lowStockItems || []).map((p: any) => (
                  <View key={p.id} style={{ flexDirection: "row", gap: S.sm, alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
                    {!!p.image ? (
                      <Image source={{ uri: p.image }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: C.tertiary }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={st.detailTitle} numberOfLines={2}>{ml(p.name, lang)}</Text>
                      <Text style={st.meta}>{p.seller_name}{p.seller_phone ? ` • ${p.seller_phone}` : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontWeight: "900", color: C.error, fontSize: 15 }}>{p.stock} dona</Text>
                      <Text style={st.meta}>{fmt(p.price)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
           <Pressable
  style={[st.actBtn, { backgroundColor: C.tertiary, marginTop: S.md, alignSelf: "flex-start" }]}
  onPress={() => {
    setDashboardResetPanelOpen((prev) => !prev);
    setDashboardResetConfirmText("");
  }}
>
  <Text style={[st.actTxt, { color: C.onSurface }]}>
    {dashboardResetPanelOpen ? "Reset bo'limini yopish" : "Reset bo'limini ochish"}
  </Text>
</Pressable>

{dashboardResetPanelOpen && (
  <View style={[st.detailBox, { marginTop: S.md, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }]}>
    <Text style={[st.detailTitle, { color: C.error }]}>Pul statistikani 0 qilish</Text>
    <Text style={st.detailText}>
      Faqat dashboarddagi pul bilan bog'liq ko'rsatkichlar 0 ga tushiriladi. Davom etish uchun RESET deb yozing.
    </Text>

    <View style={st.modalStatsRow}>
      <View style={st.modalStatBox}>
        <Text style={st.modalStatVal}>{fmt(dash?.today_sales || 0)}</Text>
        <Text style={st.modalStatLabel}>Bugungi savdo</Text>
      </View>
      <View style={st.modalStatBox}>
        <Text style={st.modalStatVal}>{fmt(dash?.total_sales || 0)}</Text>
        <Text style={st.modalStatLabel}>Jami savdo</Text>
      </View>
    </View>

    <TextInput
      testID="dashboard-reset-confirm-input"
      style={st.input}
      value={dashboardResetConfirmText}
      onChangeText={setDashboardResetConfirmText}
      placeholder="RESET"
      placeholderTextColor={C.muted}
      autoCapitalize="characters"
    />

    <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
      <Pressable
        style={[st.actBtn, { backgroundColor: C.tertiary, flex: 1 }]}
        onPress={() => {
          setDashboardResetPanelOpen(false);
          setDashboardResetConfirmText("");
        }}
      >
        <Text style={[st.actTxt, { color: C.onSurface }]}>Bekor qilish</Text>
      </Pressable>

      <Pressable
        disabled={dashboardResetBusy || dashboardResetConfirmText.trim().toUpperCase() !== "RESET"}
        style={[
          st.actBtn,
          { backgroundColor: dashboardResetConfirmText.trim().toUpperCase() === "RESET" ? C.error : C.tertiary, flex: 1 },
          (dashboardResetBusy || dashboardResetConfirmText.trim().toUpperCase() !== "RESET") && { opacity: 0.6 },
        ]}
        onPress={async () => {
          try {
            setDashboardResetBusy(true);
            await api("/admin/dashboard/reset-stats", { method: "POST" });
            setDashboardResetPanelOpen(false);
            setDashboardResetConfirmText("");
            setMsg("Pul statistikasi 0 ga tushirildi ✓");
            load("dashboard");
          } catch (e: any) {
            setMsg(e?.message || "Reset bajarilmadi");
          } finally {
            setDashboardResetBusy(false);
          }
        }}
      >
        <Text style={st.actTxt}>{dashboardResetBusy ? "Yuklanmoqda..." : "0 ga tushirish"}</Text>
      </Pressable>
    </View>
  </View>
)}

{!!dash.dashboard_stats_reset_at && (
  <Text style={st.meta}>Oxirgi pul reseti: {new Date(dash.dashboard_stats_reset_at).toLocaleString()}</Text>
)}

            </>
          ) : (
            <EmptyState title="Dashboard ma'lumoti topilmadi" subtitle="Sahifani qayta ochib yana urinib ko'ring." />
          )
        )}

        {sec === "orders" && (
          loadingSec === "orders" ? (
            <SectionLoader label="Buyurtmalar yuklanmoqda..." />
          ) : orders.length === 0 ? (
            <EmptyState title="Buyurtmalar topilmadi" subtitle="Yangi buyurtmalar kelganda shu yerda ko'rinadi." />
          ) : orders.map((o) => (
          <View key={o.id} style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.bold}>{o.number} • {o.client_name}</Text>
              <Text style={{ fontWeight: "900", color: C.brandDark }}>{fmt(o.total)}</Text>
            </View>
            <Text style={st.meta}>{o.client_phone} • {o.address_text}</Text>
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, alignItems: "center" }}>
              <TextInput
                testID={`admin-eta-${o.id}`}
                style={[st.input, { width: 120 }]}
                keyboardType="numeric"
                value={getEtaInputValue(o)}
                onChangeText={(v) => setEtaDrafts((prev) => ({ ...prev, [o.id]: v }))}
                placeholder={defaultEtaDays ? `Necha kun (${defaultEtaDays})` : "Necha kun"}
                placeholderTextColor={C.muted}
              />
              <Pressable style={[st.actBtn, { backgroundColor: C.inverse }]} onPress={() => saveOrderEta(o.id)}>
                <Text style={st.actTxt}>Muddatni saqlash</Text>
              </Pressable>
            </View>
            {!!o.returned_items_count && <Text style={st.returnAlert}>Qaytgan mahsulotlar: {o.returned_items_count} ta</Text>}
            {(o.seller_payment_received_at || o.seller_payment_confirmed || o.payment_received_by_seller) && (
              <Text style={{ color: C.success, fontSize: 12, fontWeight: "800", marginTop: 6 }}>
                ✓ Sotuvchi pul olganini tasdiqladi
                {o.seller_payment_received_at ? ` • ${new Date(o.seller_payment_received_at).toLocaleString()}` : ""}
              </Text>
            )}
            <View style={{ marginTop: S.sm, gap: 6 }}>
              {(o.items || []).map((item: any, idx: number) => (
                <View key={`${o.id}-${idx}`} style={st.adminItemRow}>
                  <Text style={st.adminItemTxt}>• {ml(item.name, lang)}{item.variation ? ` (${item.variation})` : ""} × {item.qty}</Text>
                  {item.delivery_status === "returned" && (
                    <View style={st.returnMiniBadge}>
                      <Text style={st.returnMiniBadgeTxt}>Qaytgan</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: S.sm }}>
              <Pressable
                testID={`admin-order-${o.id}-status-lock`}
                onPress={() =>
                  setStatusUnlocked((prev) => ({
                    ...prev,
                    [o.id]: !prev[o.id],
                  }))
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: statusUnlocked[o.id] ? C.brandSoft : C.tertiary,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: statusUnlocked[o.id] ? C.brandDark : C.border,
                }}
              >
                <Ionicons
                  name={statusUnlocked[o.id] ? "eye" : "eye-off"}
                  size={18}
                  color={statusUnlocked[o.id] ? C.brandDark : C.muted}
                />
              </Pressable>
              <Text style={{ fontSize: 11, color: C.muted, fontWeight: "700", flexShrink: 1 }}>
                {statusUnlocked[o.id] ? "Status o'zgartirish ochiq" : "Status yopiq — ko'zni bosing"}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
              {ORDER_STATUSES.map((s) => {
                const unlocked = !!statusUnlocked[o.id];
                const isCurrent = o.status === s;
                return (
                  <Pressable
                    key={s}
                    testID={`admin-order-${o.id}-status-${s}`}
                    disabled={!unlocked || isCurrent}
                    style={[
                      st.miniChip,
                      isCurrent && { backgroundColor: C.brandDark, borderColor: C.brandDark },
                      !unlocked && { opacity: 0.45 },
                    ]}
                    onPress={async () => {
                      if (!unlocked || isCurrent) return;
                      await api(`/admin/orders/${o.id}/status`, { method: "POST", body: { status: s } }).catch(() => {});
                      // O'zgartirgach yana yopib qo'yamiz — tasodifiy bosishdan himoya
                      setStatusUnlocked((prev) => ({ ...prev, [o.id]: false }));
                      load("orders");
                    }}
                  >
                    <Text style={[st.miniChipTxt, isCurrent && { color: "#fff" }]}>{ST_LABEL[s]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ))
        )}

        {sec === "rejected_orders" && (
          loadingSec === "rejected_orders" ? (
            <SectionLoader label="Rad etilgan buyurtmalar yuklanmoqda..." />
          ) : (
          <>
            {rejectedOrders.length === 0 && (
              <EmptyState title="Rad etilgan buyurtmalar topilmadi" subtitle="Sotuvchi rad etgan buyurtmalar yuklangach shu yerda ko'rinadi." />
            )}
            {rejectedOrders.map((o) => (
              <View key={o.id} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold}>{o.number}</Text>
                  <Text style={{ color: C.error, fontWeight: "900" }}>
                    {o.reject_mode === "partial" ? "Qisman rad" : "Sotuvchi rad etdi"}
                  </Text>
                </View>
                <Text style={st.meta}>Sotuvchi: {o.rejected_seller?.name || "—"} {o.rejected_seller?.phone ? `• ${o.rejected_seller.phone}` : ""}</Text>
                <Text style={st.meta}>Mijoz: {o.client_name} • {fmt(o.total)}</Text>
                {!!o.seller_rejection?.reason && <Text style={st.returnAlert}>Sabab: {o.seller_rejection.reason}</Text>}
                <View style={{ marginTop: S.sm, gap: S.md }}>
                  {(o.replacement_options || []).map((entry: any) => {
                    const rk = `${o.id}:${entry.item_index}`;
                    const open = expandedRejectKey === rk;
                    const selectedId = rejectedSelections[o.id]?.[String(entry.item_index)];
                    return (
                      <View key={rk} style={st.detailBox}>
                        <Text style={st.detailTitle}>Rad etilgan mahsulot</Text>
                        <View style={{ flexDirection: "row", gap: S.sm, marginTop: 6, alignItems: "center" }}>
                          {!!entry.original_item?.image ? (
                            <Image source={{ uri: entry.original_item.image }} style={st.rejectThumb} contentFit="cover" />
                          ) : (
                            <View style={[st.rejectThumb, { alignItems: "center", justifyContent: "center", backgroundColor: C.tertiary }]}>
                              <Text style={{ color: C.muted, fontSize: 11 }}>Rasm yo'q</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={st.adminItemTxt}>{ml(entry.original_item?.name, lang)} × {entry.original_item?.qty}</Text>
                            <Text style={st.meta}>{fmt((entry.original_item?.price || 0) * (entry.original_item?.qty || 0))}</Text>
                            {!!selectedId && <Text style={{ color: C.success, fontWeight: "800", fontSize: 12, marginTop: 4 }}>Almashtirish tanlandi ✓</Text>}
                          </View>
                        </View>
                        <Pressable
                          style={[st.actBtn, { backgroundColor: C.brandDark, marginTop: S.sm }]}
                          onPress={() => setExpandedRejectKey(open ? null : rk)}
                        >
                          <Text style={st.actTxt}>
                            {open ? "Yopish" : "O'xshash mahsulotlar / Almashtirish"}
                          </Text>
                        </Pressable>
                        {open && (
                          <View style={{ marginTop: S.sm, gap: 8 }}>
                            {(entry.similar_products || []).length === 0 && (
                              <Text style={st.meta}>O'xshash mahsulot topilmadi — boshqa sotuvchida bor-yo'qligini tekshiring</Text>
                            )}
                            {(entry.similar_products || []).map((candidate: any) => {
                              const selected = selectedId === candidate.product_id;
                              return (
                                <Pressable
                                  key={candidate.product_id}
                                  style={[st.detailBox, selected && { borderColor: C.success, borderWidth: 1.5 }]}
                                  onPress={() => setRejectedSelection(o.id, entry.item_index, candidate.product_id)}
                                >
                                  <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
                                    {!!candidate.image ? (
                                      <Image source={{ uri: candidate.image }} style={st.rejectThumb} contentFit="cover" />
                                    ) : (
                                      <View style={[st.rejectThumb, { backgroundColor: C.tertiary }]} />
                                    )}
                                    <View style={{ flex: 1 }}>
                                      <Text style={st.detailTitle}>{ml(candidate.name, lang)}</Text>
                                      <Text style={st.detailText}>{candidate.seller_name} • {fmt(candidate.price)}</Text>
                                      <Text style={st.detailText}>Qoldiq: {candidate.stock}</Text>
                                    </View>
                                    <View style={[st.miniChip, selected && { backgroundColor: C.success, borderColor: C.success }]}>
                                      <Text style={[st.miniChipTxt, selected && { color: "#fff" }]}>{selected ? "Tanlandi" : "Tanlash"}</Text>
                                    </View>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md, alignItems: "center" }}>
                  <TextInput
                    style={[st.input, { width: 120 }]}
                    keyboardType="numeric"
                    value={getEtaInputValue(o)}
                    onChangeText={(v) => setEtaDrafts((prev) => ({ ...prev, [o.id]: v }))}
                    placeholder={defaultEtaDays ? `Necha kun (${defaultEtaDays})` : "Necha kun"}
                    placeholderTextColor={C.muted}
                  />
                  <Pressable style={[st.actBtn, { backgroundColor: C.brandDark, flex: 1 }]} onPress={() => resolveRejectedOrder(o)}>
                    <Text style={st.actTxt}>Almashtirishni tasdiqlash</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
          )
        )}

        {sec === "products" && (
          <>
            <View style={{ height: 48, justifyContent: "center" }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, alignItems: "center" }}>
                {["pending", "approved", "rejected", ""].map((f) => (
                  <Pressable
                    key={f || "all"}
                    testID={`admin-prod-filter-${f || "all"}`}
                    style={[st.chip, prodFilter === f && st.chipActive]}
                    onPress={() => {
                      setProdFilter(f);
                      setProdSearch("");
                      clearAdminImageSearch();
                    }}
                  >
                    <Text style={[st.chipTxt, prodFilter === f && { color: "#fff" }]}>
                      {f === "pending" ? "Moderatsiya" : f === "approved" ? "Tasdiqlangan" : f === "rejected" ? "Rad etilgan" : "Hammasi"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md, alignItems: "center" }}>
              {(prodFilter === "approved" || prodImageSearch) && (
                <TextInput
                  testID="admin-approved-search"
                  style={[st.input, { flex: 1, backgroundColor: "#FFFFFF", borderColor: C.borderStrong || C.border, borderWidth: 1.5 }]}
                  value={prodSearch}
                  onChangeText={(v) => {
                    setProdSearch(v);
                    if (prodImageSearch) clearAdminImageSearch();
                  }}
                  placeholder="Mahsulotlarni matn orqali qidirish"
                  placeholderTextColor={C.muted}
                />
              )}
              <Pressable
                testID="admin-product-image-search"
                style={st.adminImageBtn}
                onPress={runAdminImageSearch}
                disabled={prodImageLoading}
              >
                <Ionicons
                  name={prodImageLoading ? "hourglass-outline" : "camera-outline"}
                  size={20}
                  color={C.brandDark}
                />
              </Pressable>
              {prodImageSearch && (
                <Pressable testID="admin-product-image-clear" style={st.adminImageClear} onPress={clearAdminImageSearch}>
                  <Ionicons name="close" size={18} color={C.onSurface} />
                </Pressable>
              )}
            </View>

            {!!prodImageUri && (
              <View style={st.adminImagePreview}>
                <Image source={{ uri: prodImageUri }} style={st.adminImageThumb} contentFit="cover" />
                <Text style={st.adminImageHint}>
                  {prodImageLoading ? "Rasm tahlil qilinmoqda..." : "Rasm bo'yicha o'xshash mahsulotlar"}
                </Text>
              </View>
            )}
            {!!prodImageError && <Text style={st.adminImageErr}>{prodImageError}</Text>}

            {loadingSec === "products" || prodImageLoading ? (
              <SectionLoader label="Mahsulotlar yuklanmoqda..." />
            ) : visibleProducts.length === 0 ? (
              <EmptyState
                title={
                  prodFilter === "pending"
                    ? "Moderatsiyada mahsulot topilmadi"
                    : prodFilter === "approved" && prodSearch.trim()
                    ? "Qidiruv bo'yicha mahsulot topilmadi"
                    : "Mahsulot topilmadi"
                }
                subtitle="Filtrni o'zgartirib yoki keyinroq qayta tekshirib ko'ring."
              />
            ) : visibleProducts.map((p) => (
              <View key={p.id} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold} numberOfLines={1}>{ml(p.name, lang)}</Text>
                  <Text style={{ fontWeight: "800", color: C.onSurface }}>{fmt(p.display_price ?? p.effective_price ?? p.price)}</Text>
                </View>
                <Text style={st.meta}>Qoldiq: {p.stock} dona • Status: {p.status} {p.pinned ? "• 📌 PIN" : ""}</Text>
                <View style={st.markupRow}>
                  <Ionicons name="pricetag-outline" size={14} color={C.brandDark} />
                  <Text style={st.markupInfo}>Sotuvchi narxi: {fmt(p.seller_price ?? p.price)} → Bozorda: {fmt(p.effective_price)} ({p.markup_percent ?? 0}% ustama)</Text>
                </View>
                {!!p.units_per_box && (
                  <View style={st.markupRow}>
                    <Ionicons name="cube-outline" size={14} color={C.brandDark} />
                    <Text style={st.markupInfo}>1 quti = {p.units_per_box} ta • Sotuvchi quti narxi: {fmt(p.seller_box_price ?? ((p.seller_price ?? p.price) * p.units_per_box))} → Bozorda: {fmt(p.effective_box_price ?? ((p.effective_price ?? p.price) * p.units_per_box))}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, alignItems: "center" }}>
                  <TextInput
                    testID={`admin-markup-input-${p.id}`}
                    style={[st.input, { width: 90 }]}
                    value={markupEdit[p.id] ?? String(p.markup_percent ?? 0)}
                    onChangeText={(v) => setMarkupEdit({ ...markupEdit, [p.id]: v })}
                    placeholder="Foiz %"
                    placeholderTextColor={C.muted}
                    keyboardType="numeric"
                  />
                  <Pressable
                    testID={`admin-markup-save-${p.id}`}
                    style={[st.actBtn, { backgroundColor: C.brandDark }]}
                    onPress={async () => {
                      const percent = parseFloat(markupEdit[p.id] ?? String(p.markup_percent ?? 0)) || 0;
                      await api(`/admin/products/${p.id}/markup`, { method: "POST", body: { percent } });
                      setMsg(`${ml(p.name, lang)} — foiz saqlandi ✓`);
                      load("products");
                    }}
                  >
                    <Text style={st.actTxt}>Foizni saqlash</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, flexWrap: "wrap" }}>
                  {p.status === "pending" && (
                    <>
                      <Pressable testID={`admin-approve-${p.id}`} disabled={prodBusy === `${p.id}:approve`} style={[st.actBtn, { backgroundColor: C.success }, prodBusy === `${p.id}:approve` && { opacity: 0.7 }]} onPress={async () => { setProdBusy(`${p.id}:approve`); await api(`/admin/products/${p.id}/moderate`, { method: "POST", body: { action: "approve" } }).catch(() => {}); setProdBusy(null); load("products"); }}>
                        <Text style={st.actTxt}>{prodBusy === `${p.id}:approve` ? "Yuklanmoqda..." : "Tasdiqlash"}</Text>
                      </Pressable>
                      <Pressable testID={`admin-reject-${p.id}`} disabled={prodBusy === `${p.id}:reject`} style={[st.actBtn, { backgroundColor: C.error }, prodBusy === `${p.id}:reject` && { opacity: 0.7 }]} onPress={async () => { setProdBusy(`${p.id}:reject`); await api(`/admin/products/${p.id}/moderate`, { method: "POST", body: { action: "reject", reason: "Sifatsiz kontent" } }).catch(() => {}); setProdBusy(null); load("products"); }}>
                        <Text style={st.actTxt}>{prodBusy === `${p.id}:reject` ? "Yuklanmoqda..." : "Rad etish"}</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable testID={`admin-pin-${p.id}`} style={[st.actBtn, { backgroundColor: C.inverse }]} onPress={async () => { await api(`/admin/products/${p.id}/moderate`, { method: "POST", body: { action: "pin" } }); load("products"); }}>
                    <Text style={st.actTxt}>{p.pinned ? "Pin olish" : "📌 Pin qilish"}</Text>
                  </Pressable>
                  <Pressable testID={`admin-delete-prod-${p.id}`} style={[st.actBtn, { backgroundColor: C.tertiary }]} onPress={async () => { await api(`/admin/products/${p.id}/moderate`, { method: "POST", body: { action: "delete" } }); load("products"); }}>
                    <Text style={[st.actTxt, { color: C.error }]}>O'chirish</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {sec === "sellers" && (
          loadingSec === "sellers" ? (
            <SectionLoader label="Sotuvchilar yuklanmoqda..." />
          ) : (

          <>
            <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
              <TextInput testID="admin-seller-search" style={[st.input, { flex: 1 }]} value={userQ} onChangeText={setUserQ} placeholder="Telefon yoki F.I.O. bo'yicha qidirish" placeholderTextColor={C.muted} />
              <Pressable testID="admin-seller-search-btn" style={[st.actBtn, { backgroundColor: C.brandDark }]} onPress={() => load("sellers")}>
                <Text style={st.actTxt}>Qidirish</Text>
              </Pressable>
            </View>
            {users.map((u) => {
          const si = u.seller_info || {};
          const summary = u.seller_today_summary || {};
          const expanded = !!openSellers[u.id];
          return (
            <View key={u.id} style={st.card}>
              <Pressable style={st.courierSummaryBtn} onPress={() => toggleSeller(u.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={st.bold}>{si.shop_name || "—"}</Text>
                  <Text style={st.meta}>{u.first_name} {u.last_name} • {u.phone}</Text>
                </View>
                <View style={st.courierSummaryRight}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: si.approved ? C.success : si.rejected ? C.error : C.warning }}>
                    {si.approved ? "✓ Tasdiqlangan" : si.rejected ? "Rad etilgan" : "⏳ Kutilmoqda"}
                  </Text>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={C.muted} />
                </View>
              </Pressable>
              <Text style={st.meta}>Balans: {fmt(si.balance || 0)} (sof, o'z narxi bo'yicha)</Text>
              <Text style={st.meta}>Mahsulotlarga ustama — "Mahsulotlar" bo'limida boshqariladi</Text>
              <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, flexWrap: "wrap" }}>
                {!si.approved && !si.rejected && (
                  <>
                    <Pressable testID={`admin-seller-approve-${u.id}`} style={[st.actBtn, { backgroundColor: C.success }]} onPress={async () => { await api(`/admin/sellers/${u.id}/approve`, { method: "POST" }); load("sellers"); }}>
                      <Text style={st.actTxt}>Tasdiqlash</Text>
                    </Pressable>
                    <Pressable testID={`admin-seller-reject-${u.id}`} style={[st.actBtn, { backgroundColor: C.error }]} onPress={async () => { await api(`/admin/sellers/${u.id}/reject`, { method: "POST" }); load("sellers"); }}>
                      <Text style={st.actTxt}>Rad etish</Text>
                    </Pressable>
                  </>
                )}
                <Pressable testID={`admin-seller-block-${u.id}`} style={[st.actBtn, { backgroundColor: u.blocked ? C.error : C.success }]} onPress={async () => { await api(`/admin/users/${u.id}/block`, { method: "POST", body: { blocked: !u.blocked } }); load("sellers"); }}>
                  <Text style={st.actTxt}>{u.blocked ? "Blokdan chiqarish" : "Bloklash"}</Text>
                </Pressable>
              </View>
              {expanded && (
                <View style={{ marginTop: S.sm }}>
                  <View style={st.courierStatGrid}>
                    <View style={st.courierStatBox}><Text style={st.courierStatVal}>{summary.today_orders || 0}</Text><Text style={st.courierStatLabel}>Bugungi buyurtmalar</Text></View>
                    <View style={st.courierStatBox}><Text style={st.courierStatVal}>{fmt(summary.today_amount || 0)}</Text><Text style={st.courierStatLabel}>Bugungi summa</Text></View>
                    <View style={st.courierStatBox}><Text style={st.courierStatVal}>{summary.today_returns_count || 0}</Text><Text style={st.courierStatLabel}>Qaytarilganlar</Text></View>
                    <View style={st.courierStatBox}><Text style={st.courierStatVal}>{fmt(summary.today_returns_amount || 0)}</Text><Text style={st.courierStatLabel}>Qaytgan summa</Text></View>
                  </View>
                  <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, flexWrap: "wrap" }}>
                    <Pressable style={[st.actBtn, { backgroundColor: C.warning }]} disabled={sellerBusy === u.id} onPress={async () => { setSellerBusy(u.id); await api(`/admin/sellers/${u.id}/reset-stats`, { method: "POST" }).catch(() => {}); setSellerBusy(null); load("sellers"); }}>
                      <Text style={st.actTxt}>{sellerBusy === u.id ? "Yuklanmoqda..." : "Statistikani 0 qilish"}</Text>
                    </Pressable>
                  </View>
                  {!!summary.stats_reset_at && <Text style={st.meta}>Oxirgi reset: {new Date(summary.stats_reset_at).toLocaleString()}</Text>}
                  <Text style={st.sectionMiniTitle}>Bugungi buyurtmalar tarixi</Text>
                  {(u.seller_today_orders || []).length === 0 && <Text style={st.meta}>Bugun buyurtma yo'q</Text>}
                  {(u.seller_today_orders || []).map((item: any) => (
                    <View key={item.id} style={st.detailBox}>
                      <Text style={st.detailTitle}>{item.number}</Text>
                      <Text style={st.detailText}>{item.created_at ? new Date(item.created_at).toLocaleString() : ""} • {item.status}</Text>
                      <Text style={st.detailText}>Summa: {fmt(item.amount || 0)} • Qaytganlar: {item.returned_items_count || 0}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
            })}
          </>
          )
        )}{sec === "clients" && (
          loadingSec === "clients" ? (
            <SectionLoader label="Mijozlar yuklanmoqda..." />
          ) : (

          <>
            <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
              <TextInput testID="admin-client-search" style={[st.input, { flex: 1 }]} value={userQ} onChangeText={setUserQ} placeholder="Ism yoki telefon bo'yicha qidirish" placeholderTextColor={C.muted} />
              <Pressable testID="admin-client-search-btn" style={[st.actBtn, { backgroundColor: C.brandDark }]} onPress={() => load("clients")}>
                <Text style={st.actTxt}>Qidirish</Text>
              </Pressable>
            </View>
            {users.map((u) => (
              <View key={u.id} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold}>{u.first_name} {u.last_name}</Text>
                  {u.blocked && <Text style={{ color: C.error, fontWeight: "800", fontSize: 11 }}>BLOKLANGAN</Text>}
                </View>
                <Text style={st.meta}>{u.phone} • Referal: {u.referral_code}</Text>
                <Text style={st.meta}>Manzil: {u.addresses?.[0]?.text || "—"}</Text>
                <Pressable testID={`admin-client-block-${u.id}`} style={[st.actBtn, { backgroundColor: u.blocked ? C.brandDark : C.tertiary, marginTop: S.sm, alignSelf: "flex-start" }]} onPress={async () => { await api(`/admin/users/${u.id}/block`, { method: "POST", body: { blocked: !u.blocked } }); load("clients"); }}>
                  <Text style={[st.actTxt, !u.blocked && { color: C.error }]}>{u.blocked ? "Blokdan chiqarish" : "Bloklash"}</Text>
                </Pressable>
              </View>
            ))}
          </>
          )
        )}{sec === "couriers" && (
          loadingSec === "couriers" ? (
            <SectionLoader label="Kuryerlar yuklanmoqda..." />
          ) : (

          <>
            <View style={st.form}>
              <Text style={st.formTitle}>Yangi kuryer qo'shish</Text>
              <TextInput testID="admin-courier-phone" style={st.input} value={courierForm.phone} onChangeText={(v) => setCourierForm({ ...courierForm, phone: v })} placeholder="Telefon" placeholderTextColor={C.muted} />
              <TextInput testID="admin-courier-name" style={st.input} value={courierForm.first_name} onChangeText={(v) => setCourierForm({ ...courierForm, first_name: v })} placeholder="Ism" placeholderTextColor={C.muted} />
              <TextInput testID="admin-courier-zone" style={st.input} value={courierForm.zone} onChangeText={(v) => setCourierForm({ ...courierForm, zone: v })} placeholder="Zona (masalan: Chilonzor)" placeholderTextColor={C.muted} />
              <Pressable testID="admin-courier-add" style={[st.actBtn, { backgroundColor: C.brandDark }]} onPress={async () => { try { await api("/admin/couriers", { method: "POST", body: courierForm }); setMsg("Kuryer qo'shildi"); load("couriers"); } catch (e: any) { setMsg(e.message); } }}>
                <Text style={st.actTxt}>Qo'shish</Text>
              </Pressable>
            </View>
            {users.map((u) => {
              const summary = u.courier_stats_summary || u.courier_info || {};
              const daily = u.courier_daily_history || [];
              const recent = u.courier_recent_orders || [];
              const expanded = !!openCouriers[u.id];
              return (
                <View key={u.id} style={st.card}>
                  <Pressable style={st.courierSummaryBtn} onPress={() => toggleCourier(u.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.bold}>{u.first_name} • {u.phone}</Text>
                      <Text style={st.meta}>Zona: {u.courier_info?.zone || "—"}</Text>
                    </View>
                    <View style={st.courierSummaryRight}>
                      <Text style={{ color: u.courier_info?.online ? C.success : C.muted, fontWeight: "800", fontSize: 11 }}>{u.courier_info?.online ? "● Onlayn" : "○ Offlayn"}</Text>
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={C.muted} />
                    </View>
                  </Pressable>

                  {expanded && (
                    <View style={{ marginTop: S.sm }}>
                      <View style={st.courierStatGrid}>
                        <View style={st.courierStatBox}><Text style={st.courierStatVal}>{summary.deliveries || 0}</Text><Text style={st.courierStatLabel}>Resetdan keyin yetkazishlar</Text></View>
                        <View style={st.courierStatBox}><Text style={st.courierStatVal}>{fmt(summary.earnings || 0)}</Text><Text style={st.courierStatLabel}>Resetdan keyin daromad</Text></View>
                        <View style={st.courierStatBox}><Text style={st.courierStatVal}>{summary.today_deliveries || 0}</Text><Text style={st.courierStatLabel}>Bugun yetkazildi</Text></View>
                        <View style={st.courierStatBox}><Text style={st.courierStatVal}>{summary.today_taken_count || 0}</Text><Text style={st.courierStatLabel}>Bugun qabul qildi</Text></View>
                      </View>
                      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm, flexWrap: "wrap" }}>
                        <Pressable
                          testID={`admin-reset-stats-${u.id}`}
                          style={[st.actBtn, { backgroundColor: C.warning, flex: 1, minWidth: 180, paddingHorizontal: S.lg }]}
                          onPress={() => setResetTarget(u)}
                        >
                          <Text style={st.actTxt}>Statistikani 0 qilish</Text>
                        </Pressable>
                      </View>
                      {!!summary.stats_reset_at && <Text style={st.meta}>Oxirgi reset: {new Date(summary.stats_reset_at).toLocaleString()}</Text>}

                      <Text style={st.sectionMiniTitle}>Kunlik tarix</Text>
                      {daily.length === 0 && <Text style={st.meta}>Hali tarix yo'q</Text>}
                      {daily.map((d: any) => (
                        <View key={`${u.id}-${d.date}`} style={st.detailBox}>
                          <Text style={st.detailTitle}>{d.date}</Text>
                          <Text style={st.detailText}>Buyurtmalar: {d.orders} • Yetkazilgan mahsulotlar: {d.delivered_products} • Qaytganlar: {d.returned_products}</Text>
                          <Text style={st.detailText}>Kimlarga olib bordi: {(d.recipients || []).join(", ") || "—"}</Text>
                        </View>
                      ))}

                      <Text style={st.sectionMiniTitle}>So'nggi buyurtmalar</Text>
                      {recent.length === 0 && <Text style={st.meta}>So'nggi buyurtmalar yo'q</Text>}
                      {recent.map((r: any) => (
                        <View key={r.id} style={st.detailBox}>
                          <Text style={st.detailTitle}>{r.number} • {r.client_name || r.client_phone || "Mijoz"}</Text>
                          <Text style={st.detailText}>{r.date ? new Date(r.date).toLocaleString() : ""}</Text>
                          <Text style={st.detailText}>Yetkazilgan: {r.delivered_products} • Qaytgan: {r.returned_products}</Text>
                          {(r.items || []).map((item: any, idx: number) => (
                            <View key={`${r.id}-${idx}`} style={st.adminItemRow}>
                              <Text style={st.adminItemTxt}>• {item.name} × {item.qty}</Text>
                              {item.delivery_status === "returned" && (
                                <View style={st.returnMiniBadge}>
                                  <Text style={st.returnMiniBadgeTxt}>Qaytgan</Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
          )
        )}{sec === "map" && (
          loadingSec === "map" ? (
            <SectionLoader label="Xarita yuklanmoqda..." />
          ) : (
            <View style={{ gap: S.md }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <View style={[st.chip, { backgroundColor: "#DC262622" }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#DC2626" }} />
                  <Text style={st.chipTxt}>1 oy ichida: {mapData?.counts?.client_month || 0}</Text>
                </View>
                <View style={[st.chip, { backgroundColor: "#2563EB22" }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563EB" }} />
                  <Text style={st.chipTxt}>Yangi mijoz: {mapData?.counts?.client_new || 0}</Text>
                </View>
                <View style={[st.chip, { backgroundColor: "#EC489922" }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#EC4899" }} />
                  <Text style={st.chipTxt}>7 kun buyurtma: {mapData?.counts?.order_week || 0}</Text>
                </View>
                <View style={[st.chip, { backgroundColor: "#16a34a22" }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#16a34a" }} />
                  <Text style={st.chipTxt}>Sotuvchi: {mapData?.counts?.seller || 0}</Text>
                </View>
                <View style={[st.chip, { backgroundColor: "#EAB30822" }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#EAB308" }} />
                  <Text style={st.chipTxt}>Kuryer: {mapData?.counts?.courier || 0}</Text>
                </View>
                <Pressable style={[st.actBtn, { backgroundColor: C.brandDark, flexDirection: "row", gap: 6, alignItems: "center" }]} onPress={() => load("map")}>
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Yangilash</Text>
                </Pressable>
              </View>
              <View style={{ height: Platform.OS === "web" ? 560 : 480, borderRadius: R.lg, overflow: "hidden", borderWidth: 1, borderColor: C.border || "#e5e7eb", backgroundColor: "#e5e7eb" }}>
                <AdminMapView markers={mapData?.markers || []} />
              </View>
              {(mapData?.markers || []).length === 0 && (
                <EmptyState title="Lokatsiya topilmadi" subtitle="Mijoz, sotuvchi yoki kuryer manzillari saqlanganda shu yerda ko'rinadi." />
              )}
            </View>
          )
        )}

{sec === "categories" && (
          <>
            <View style={st.form}>
              <Text style={st.formTitle}>Yangi kategoriya</Text>
              <TextInput testID="admin-cat-name" style={st.input} value={catForm.name_uz} onChangeText={(v) => setCatForm({ ...catForm, name_uz: v })} placeholder="Nomi (uz)" placeholderTextColor={C.muted} />
              <TextInput
                testID="admin-cat-image"
                style={st.input}
                value={catForm.preview_image}
                onChangeText={(v) => setCatForm({ ...catForm, preview_image: v })}
                placeholder="Rasm URL (ixtiyoriy)"
                placeholderTextColor={C.muted}
              />
              {!!catForm.preview_image.trim() && (
                <Image source={{ uri: catForm.preview_image.trim() }} style={st.miniThumb} contentFit="cover" />
              )}
              <Pressable
                testID="admin-cat-add"
                style={[st.actBtn, { backgroundColor: C.brandDark }]}
                onPress={async () => {
                  if (!catForm.name_uz) return;
                  const body: any = {
                    name_uz: catForm.name_uz,
                    icon: catForm.icon || "category",
                  };
                  if (catForm.preview_image?.trim()) {
                    body.preview_image = catForm.preview_image.trim();
                    body.image = catForm.preview_image.trim();
                  }
                  await api("/admin/categories", { method: "POST", body });
                  setCatForm({ name_uz: "", icon: "category", preview_image: "" });
                  load("categories");
                }}
              >
                <Text style={st.actTxt}>Qo'shish</Text>
              </Pressable>
            </View>
            {cats.filter((c) => !c.parent_id).map((c) => {
              const children = cats.filter((s) => s.parent_id === c.id);
              const catImg = c.preview_image || c.image;
              return (
                <View key={c.id} style={st.card}>
                  <View style={st.rowBetween}>
                    <View style={st.categoryRowInfo}>
                      {!!catImg ? (
                        <Image source={{ uri: catImg }} style={st.miniThumb} contentFit="cover" />
                      ) : null}
                      <Text style={st.bold}>{ml(c.name, lang)}</Text>
                    </View>
                    <Pressable testID={`admin-cat-edit-${c.id}`} onPress={() => openCategoryEditor(c)}>
                      <Ionicons name="create-outline" size={18} color={C.brandDark} />
                    </Pressable>
                  </View>
                  <Text style={st.meta}>{children.length ? `${children.length} ta ichki bo'lim` : "Subkategoriya yo'q"}</Text>
                  {children.map((child) => {
                    const childImg = child.preview_image || child.image;
                    return (
                      <Pressable key={child.id} style={st.subsectionCard} onPress={() => openCategoryEditor(child)}>
                        <View style={st.rowBetween}>
                          <View style={st.categoryRowInfo}>
                            {!!childImg ? (
                              <Image source={{ uri: childImg }} style={st.miniThumb} contentFit="cover" />
                            ) : null}
                            <View style={{ flex: 1 }}>
                              <Text style={st.bold}>{ml(child.name, lang)}</Text>
                              <Text style={st.meta}>Tahrirlash uchun bosing</Text>
                            </View>
                          </View>
                          <Ionicons name="create-outline" size={18} color={C.brandDark} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}

        {sec === "banners" && (
          loadingSec === "banners" ? (
            <SectionLoader label="Bannerlar yuklanmoqda..." />
          ) : (

          <>
            <View style={st.form}>
              <Text style={st.formTitle}>Yangi banner</Text>
              <TextInput testID="admin-banner-title" style={st.input} value={bannerForm.title} onChangeText={(v) => setBannerForm({ ...bannerForm, title: v })} placeholder="Sarlavha" placeholderTextColor={C.muted} />
              {bannerForm.image ? (
                <View style={{ marginBottom: S.sm }}>
                  <Image source={{ uri: bannerForm.image }} style={{ width: "100%", height: 140, borderRadius: R.sm, backgroundColor: C.tertiary }} contentFit="cover" />
                  <Pressable
                    testID="admin-banner-clear-image"
                    onPress={() => setBannerForm((f) => ({ ...f, image: "" }))}
                    style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  testID="admin-banner-pick-image"
                  onPress={() => pickBannerImage("create")}
                  disabled={bannerUploading}
                  style={{
                    height: 120,
                    borderRadius: R.sm,
                    borderWidth: 1.5,
                    borderColor: C.border,
                    borderStyle: "dashed",
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: S.sm,
                    gap: 6,
                    opacity: bannerUploading ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="image-outline" size={28} color={C.brandDark} />
                  <Text style={{ color: C.onSurface, fontWeight: "800", fontSize: 13 }}>
                    {bannerUploading ? "Yuklanmoqda..." : "Fayldan rasm tanlash"}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 11 }}>JPG / PNG</Text>
                </Pressable>
              )}
              <Pressable
                testID="admin-banner-add"
                style={[st.actBtn, { backgroundColor: C.brandDark }]}
                onPress={async () => {
                  if (!bannerForm.title.trim()) {
                    setMsg("Sarlavha kiriting");
                    return;
                  }
                  if (!bannerForm.image) {
                    setMsg("Banner rasmini fayldan tanlang");
                    return;
                  }
                  try {
                    await api("/admin/banners", {
                      method: "POST",
                      body: { title: bannerForm.title.trim(), image: bannerForm.image },
                    });
                    setBannerForm({ image: "", title: "" });
                    setMsg("Banner qo'shildi ✓");
                    load("banners");
                  } catch (e: any) {
                    setMsg(e.message || "Banner qo'shib bo'lmadi");
                  }
                }}
              >
                <Text style={st.actTxt}>Qo'shish</Text>
              </Pressable>
            </View>
            {banners.map((b) => (
              <View key={b.id} style={st.card}>
                <View style={st.rowBetween}>
                  <View style={st.categoryRowInfo}>
                    {!!b.image && <Image source={{ uri: b.image }} style={st.miniThumb} contentFit="cover" />}
                    <Text style={st.bold} numberOfLines={1}>{b.title}</Text>
                  </View>
                  <Pressable testID={`admin-banner-edit-${b.id}`} onPress={() => openBannerEditor(b)}>
                    <Ionicons name="create-outline" size={18} color={C.brandDark} />
                  </Pressable>
                </View>
              </View>
            ))}
          </>
          )
        )}{sec === "promos" && (
          loadingSec === "promos" ? (
            <SectionLoader label="Promokodlar yuklanmoqda..." />
          ) : (

          <>
            <View style={st.form}>
              <Text style={st.formTitle}>Yangi promokod</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <TextInput testID="admin-promo-code" style={[st.input, { flex: 1 }]} value={promoForm.code} onChangeText={(v) => setPromoForm({ ...promoForm, code: v.toUpperCase() })} placeholder="KOD" placeholderTextColor={C.muted} />
                <TextInput testID="admin-promo-value" style={[st.input, { flex: 1 }]} value={promoForm.value} onChangeText={(v) => setPromoForm({ ...promoForm, value: v })} placeholder="Qiymat" placeholderTextColor={C.muted} keyboardType="numeric" />
              </View>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <Pressable testID="admin-promo-type-percent" style={[st.miniChip, promoForm.type === "percent" && { backgroundColor: C.brandDark }]} onPress={() => setPromoForm({ ...promoForm, type: "percent" })}>
                  <Text style={[st.miniChipTxt, promoForm.type === "percent" && { color: "#fff" }]}>Foiz %</Text>
                </Pressable>
                <Pressable testID="admin-promo-type-amount" style={[st.miniChip, promoForm.type === "amount" && { backgroundColor: C.brandDark }]} onPress={() => setPromoForm({ ...promoForm, type: "amount" })}>
                  <Text style={[st.miniChipTxt, promoForm.type === "amount" && { color: "#fff" }]}>Summa</Text>
                </Pressable>
                <TextInput testID="admin-promo-min" style={[st.input, { flex: 1 }]} value={promoForm.min_cart} onChangeText={(v) => setPromoForm({ ...promoForm, min_cart: v })} placeholder="Min savat" placeholderTextColor={C.muted} keyboardType="numeric" />
                <TextInput testID="admin-promo-limit" style={[st.input, { flex: 1 }]} value={promoForm.limit} onChangeText={(v) => setPromoForm({ ...promoForm, limit: v })} placeholder="Limit" placeholderTextColor={C.muted} keyboardType="numeric" />
              </View>
              <Pressable testID="admin-promo-add" style={[st.actBtn, { backgroundColor: C.brandDark }]} onPress={async () => { if (!promoForm.code || !promoForm.value) return; await api("/admin/promocodes", { method: "POST", body: { code: promoForm.code, type: promoForm.type, value: parseFloat(promoForm.value), min_cart: parseFloat(promoForm.min_cart) || 0, limit: parseInt(promoForm.limit) || 100 } }); setPromoForm({ code: "", value: "", type: "percent", min_cart: "", limit: "" }); load("promos"); }}>
                <Text style={st.actTxt}>Yaratish</Text>
              </Pressable>
            </View>
            {promos.map((p) => (
              <Pressable key={p.id} style={st.card} onPress={() => setPromoView(p)}>
                <View style={st.rowBetween}>
                  <Text style={st.bold}>{p.code}</Text>
                  <Ionicons name="expand" size={18} color={C.brandDark} />
                </View>
                <Text style={st.meta}>{p.type === "percent" ? `${p.value}%` : fmt(p.value)} • Min: {fmt(p.min_cart)} • Ishlatilgan: {p.used}/{p.limit}</Text>
                <Text style={st.meta}>Ishlash tartibi: savat {fmt(p.min_cart)} ga yetsa, ushbu promokod {p.type === "percent" ? `${p.value}%` : `${fmt(p.value)} chegirma`} beradi.</Text>
              </Pressable>
            ))}
          </>
          )
        )}{sec === "flash" && (
          loadingSec === "flash" ? (
            <SectionLoader label="Flash sale yuklanmoqda..." />
          ) : (

          <>
            <Text style={st.formTitle}>Mahsulotni tanlab Flash Sale narxini belgilang</Text>
            {products.filter((p) => p.status === "approved").map((p) => (
              <View key={p.id} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold} numberOfLines={1}>{ml(p.name, lang)}</Text>
                  <Text style={st.meta}>{fmt(p.price)}</Text>
                </View>
                {p.flash_active && <Text style={{ color: C.warning, fontWeight: "800", fontSize: 12 }}>⚡ Aktiv: {fmt(p.effective_price)}</Text>}
                {flashForm.product_id === p.id ? (
                  <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                    <TextInput testID={`admin-flash-price-${p.id}`} style={[st.input, { flex: 1 }]} value={flashForm.price} onChangeText={(v) => setFlashForm({ ...flashForm, price: v })} placeholder="Flash narx" placeholderTextColor={C.muted} keyboardType="numeric" />
                    <TextInput testID={`admin-flash-hours-${p.id}`} style={[st.input, { width: 80 }]} value={flashForm.hours} onChangeText={(v) => setFlashForm({ ...flashForm, hours: v })} placeholder="Soat" placeholderTextColor={C.muted} keyboardType="numeric" />
                    <Pressable testID={`admin-flash-save-${p.id}`} style={[st.actBtn, { backgroundColor: C.warning }]} onPress={async () => { await api("/admin/flash-sale", { method: "POST", body: { product_id: p.id, price: parseFloat(flashForm.price), hours: parseInt(flashForm.hours) || 24 } }); setFlashForm({ product_id: "", price: "", hours: "24" }); load("flash"); }}>
                      <Text style={st.actTxt}>⚡ Boshlash</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable testID={`admin-flash-select-${p.id}`} style={[st.actBtn, { backgroundColor: C.tertiary, marginTop: S.sm, alignSelf: "flex-start" }]} onPress={() => setFlashForm({ ...flashForm, product_id: p.id })}>
                    <Text style={[st.actTxt, { color: C.onSurface }]}>Flash Sale qilish</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </>
          )
        )}{sec === "reviews" && (
          loadingSec === "reviews" ? (
            <SectionLoader label="Sharhlar yuklanmoqda..." />
          ) : reviews.length === 0 ? (
            <EmptyState title="Sharhlar topilmadi" subtitle="Foydalanuvchi sharhlari shu yerda ko'rinadi." />
          ) : reviews.map((r) => (
          <View key={r.id} style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.bold}>{r.client_name} • {"★".repeat(r.rating)}</Text>
              <Pressable testID={`admin-review-del-${r.id}`} onPress={async () => { await api(`/admin/reviews/${r.id}`, { method: "DELETE" }); load("reviews"); }}>
                <Ionicons name="trash-outline" size={18} color={C.error} />
              </Pressable>
            </View>
            <Text style={st.meta}>{r.text}</Text>
          </View>
        ))
        )}

        {sec === "sms" && (
          loadingSec === "sms" ? (
            <SectionLoader label="SMS jurnal yuklanmoqda..." />
          ) : sms.length === 0 ? (
            <EmptyState title="SMS yo'q" subtitle="Yuborilgan SMS lar shu yerda ko'rinadi." />
          ) : sms.map((s) => (
          <View key={s.id} style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.bold}>{s.phone}</Text>
              <Text style={{ fontSize: 10, color: C.muted }}>{new Date(s.sent_at).toLocaleString()}</Text>
            </View>
            <Text style={st.meta}>{s.text} • [{s.status}]</Text>
          </View>
        ))
        )}

        {sec === "settings" && (
          <>
            <View style={st.form}>
              <Text style={st.formTitle}>Platforma sozlamalari</Text>
              <Text style={st.meta}>Yetkazib berish narxi (so'm)</Text>
              <TextInput testID="admin-set-delivery" style={st.input} value={setForm.delivery_fee} onChangeText={(v) => setSetForm({ ...setForm, delivery_fee: v })} keyboardType="numeric" />
              <Text style={st.meta}>Minimal buyurtma (so'm)</Text>
              <TextInput testID="admin-set-minorder" style={st.input} value={setForm.min_order} onChangeText={(v) => setSetForm({ ...setForm, min_order: v })} keyboardType="numeric" />
              <Text style={st.meta}>Ish vaqti</Text>
              <TextInput testID="admin-set-hours" style={st.input} value={setForm.work_hours} onChangeText={(v) => setSetForm({ ...setForm, work_hours: v })} />
              <Text style={st.meta}>Kontakt</Text>
              <TextInput testID="admin-set-contact" style={st.input} value={setForm.contact} onChangeText={(v) => setSetForm({ ...setForm, contact: v })} />
              <Text style={st.meta}>Standart yetkazish muddati (kun)</Text>
              <TextInput
                testID="admin-set-default-eta"
                style={st.input}
                value={setForm.default_delivery_eta_days}
                onChangeText={(v) => setSetForm({ ...setForm, default_delivery_eta_days: v })}
                keyboardType="numeric"
                placeholder="Masalan: 2"
                placeholderTextColor={C.muted}
              />
              <Pressable
                testID="admin-set-save"
                style={[st.actBtn, { backgroundColor: C.brandDark }]}
                onPress={async () => {
                  const saved = await api("/admin/settings", {
                    method: "PUT",
                    body: {
                      delivery_fee: parseFloat(setForm.delivery_fee) || 15000,
                      min_order: parseFloat(setForm.min_order) || 0,
                      work_hours: setForm.work_hours,
                      contact: setForm.contact,
                      default_delivery_eta_days: parseInt(setForm.default_delivery_eta_days || "0", 10) || 0,
                    },
                  });
                  const eta = String(saved?.default_delivery_eta_days ?? setForm.default_delivery_eta_days ?? "0");
                  setSetForm((prev: any) => ({
                    ...prev,
                    delivery_fee: String(saved?.delivery_fee ?? prev.delivery_fee),
                    min_order: String(saved?.min_order ?? prev.min_order),
                    work_hours: saved?.work_hours ?? prev.work_hours,
                    contact: saved?.contact ?? prev.contact,
                    default_delivery_eta_days: eta,
                  }));
                  setSettings((prev: any) => ({
                    ...prev,
                    ...(saved || {}),
                    default_delivery_eta_days: parseInt(eta, 10) || 0,
                  }));
                  setMsg("Saqlandi ✓");
                }}
              >
                <Text style={st.actTxt}>Saqlash</Text>
              </Pressable>
            </View>

            <View style={st.form}>
              <Text style={st.formTitle}>💰 Bozor ustama foizi (barcha mahsulotlar)</Text>
              <Text style={st.meta}>
                Sotuvchi qo'ygan narx ustiga qo'shiladigan foizni belgilang. Masalan, sotuvchi mahsulotni 10 000 so'mga qo'ysa va siz 10% qo'ysangiz, xaridorga 11 000 so'm bo'lib ko'rinadi — lekin sotuvchi panelida narx hamon 10 000 so'm bo'lib qoladi.
              </Text>
              <Text style={st.meta}>Standart ustama % (yangi/belgilanmagan mahsulotlarga)</Text>
              <TextInput testID="admin-default-markup" style={st.input} value={setForm.default_markup_percent} onChangeText={(v) => setSetForm({ ...setForm, default_markup_percent: v })} keyboardType="numeric" placeholder="masalan: 10" placeholderTextColor={C.muted} />
              <Pressable testID="admin-default-markup-save" style={[st.actBtn, { backgroundColor: C.brandDark }]} onPress={async () => { await api("/admin/settings", { method: "PUT", body: { default_markup_percent: parseFloat(setForm.default_markup_percent) || 0 } }); setMsg("Standart ustama saqlandi ✓"); }}>
                <Text style={st.actTxt}>Standartni saqlash</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: C.border, marginVertical: S.sm }} />

              <Text style={st.meta}>Hozir bozordagi BARCHA mahsulotlarga darhol ustama qo'shish (%)</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <TextInput testID="admin-bulk-markup" style={[st.input, { flex: 1 }]} value={bulkMarkup} onChangeText={setBulkMarkup} keyboardType="numeric" placeholder="masalan: 15" placeholderTextColor={C.muted} />
                <Pressable
                  testID="admin-bulk-markup-apply"
                  style={[st.actBtn, { backgroundColor: C.warning }]}
                  onPress={async () => {
                    const percent = parseFloat(bulkMarkup) || 0;
                    const r = await api("/admin/products/bulk-markup", { method: "POST", body: { percent, only_without_override: false } });
                    setMsg(`${r.updated} ta mahsulotga ${percent}% ustama qo'yildi ✓`);
                  }}
                >
                  <Text style={st.actTxt}>Barchasiga qo'llash</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!catEdit} transparent animationType="fade" onRequestClose={closeCategoryEditor}>
        <Pressable style={st.modalBackdrop} onPress={closeCategoryEditor}>
          <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Kategoriyani tahrirlash</Text>
            <Text style={st.modalBody}>Nomini o'zgartirib saqlashingiz yoki butun bo'limni o'chirishingiz mumkin. Rasm ixtiyoriy.</Text>
            {catEditForm.preview_image ? (
              <Image source={{ uri: catEditForm.preview_image }} style={st.editPreview} contentFit="cover" />
            ) : (
              <View style={st.editPreviewPlaceholder}>
                <Ionicons name="image-outline" size={28} color={C.muted} />
                <Text style={st.meta}>Rasm URL kiriting (ixtiyoriy)</Text>
              </View>
            )}
            <TextInput
              testID="admin-cat-edit-name"
              style={st.input}
              value={catEditForm.name_uz}
              onChangeText={(v) => setCatEditForm({ ...catEditForm, name_uz: v, name_ru: v, name_en: v })}
              placeholder="Kategoriya nomi"
              placeholderTextColor={C.muted}
            />
            <TextInput
              testID="admin-cat-edit-image"
              style={st.input}
              value={catEditForm.preview_image || ""}
              onChangeText={(v) => setCatEditForm({ ...catEditForm, preview_image: v })}
              placeholder="Rasm URL (ixtiyoriy)"
              placeholderTextColor={C.muted}
            />
            <View style={st.modalActionRow}>
              <Pressable
                testID="admin-cat-save"
                style={[st.actBtn, st.flexBtn, { backgroundColor: C.brandDark }]}
                onPress={async () => {
                  if (!catEdit?.id || !catEditForm.name_uz.trim()) return;
                  try {
                    const img = (catEditForm.preview_image || "").trim();
                    await api(`/admin/categories/${catEdit.id}`, {
                      method: "PUT",
                      body: {
                        name_uz: catEditForm.name_uz.trim(),
                        name_ru: catEditForm.name_ru?.trim() || catEditForm.name_uz.trim(),
                        name_en: catEditForm.name_en?.trim() || catEditForm.name_uz.trim(),
                        icon: catEditForm.icon || "category",
                        parent_id: catEditForm.parent_id,
                        order: catEditForm.order || 0,
                        preview_image: img || null,
                        image: img || null,
                      },
                    });
                    setMsg("Kategoriya saqlandi ✓");
                    closeCategoryEditor();
                    load("categories");
                  } catch (e: any) {
                    setMsg(e.message || "Kategoriyani saqlab bo'lmadi");
                  }
                }}
              >
                <Text style={st.actTxt}>Saqlash</Text>
              </Pressable>
              <Pressable
                testID="admin-cat-delete"
                style={[st.actBtn, st.flexBtn, { backgroundColor: C.tertiary }]}
                onPress={async () => {
                  if (!catEdit?.id) return;
                  await api(`/admin/categories/${catEdit.id}`, { method: "DELETE" });
                  setMsg("Kategoriya o'chirildi ✓");
                  closeCategoryEditor();
                  load("categories");
                }}
              >
                <Text style={[st.actTxt, { color: C.error }]}>O'chirish</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!bannerEdit} transparent animationType="fade" onRequestClose={closeBannerEditor}>
        <Pressable style={st.modalBackdrop} onPress={closeBannerEditor}>
          <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Bannerni tahrirlash</Text>
            {bannerEditForm.image ? (
              <Image source={{ uri: bannerEditForm.image }} style={st.editPreview} contentFit="cover" />
            ) : (
              <View style={st.editPreviewPlaceholder}>
                <Ionicons name="image-outline" size={28} color={C.muted} />
                <Text style={st.meta}>Rasm tanlanmagan</Text>
              </View>
            )}
            <TextInput
              testID="admin-banner-edit-title"
              style={st.input}
              value={bannerEditForm.title}
              onChangeText={(v) => setBannerEditForm({ ...bannerEditForm, title: v })}
              placeholder="Sarlavha"
              placeholderTextColor={C.muted}
            />
            <Pressable
              testID="admin-banner-edit-pick-image"
              onPress={() => pickBannerImage("edit")}
              disabled={bannerUploading}
              style={[
                st.actBtn,
                {
                  backgroundColor: C.tertiary,
                  marginBottom: S.sm,
                  opacity: bannerUploading ? 0.6 : 1,
                  flexDirection: "row",
                  gap: 8,
                  justifyContent: "center",
                },
              ]}
            >
              <Ionicons name="folder-open-outline" size={16} color={C.onSurface} />
              <Text style={[st.actTxt, { color: C.onSurface }]}>
                {bannerUploading ? "Yuklanmoqda..." : "Fayldan rasm tanlash"}
              </Text>
            </Pressable>
            <View style={st.modalActionRow}>
              <Pressable
                testID="admin-banner-save"
                style={[st.actBtn, st.flexBtn, { backgroundColor: C.brandDark }]}
                onPress={async () => {
                  if (!bannerEdit?.id || !bannerEditForm.title.trim()) return;
                  try {
                    await api(`/admin/banners/${bannerEdit.id}`, {
                      method: "PUT",
                      body: {
                        title: bannerEditForm.title.trim(),
                        image: (bannerEditForm.image || "").trim() || bannerEdit?.image || "",
                        link_type: bannerEditForm.link_type || "none",
                        link_id: bannerEditForm.link_id || null,
                        expires_at: bannerEditForm.expires_at || null,
                      },
                    });
                    setMsg("Banner saqlandi ✓");
                    closeBannerEditor();
                    load("banners");
                  } catch (e: any) {
                    setMsg(e.message || "Bannerni saqlab bo'lmadi");
                  }
                }}
              >
                <Text style={st.actTxt}>Saqlash</Text>
              </Pressable>
              <Pressable
                testID="admin-banner-delete"
                style={[st.actBtn, st.flexBtn, { backgroundColor: C.tertiary }]}
                onPress={async () => {
                  if (!bannerEdit?.id) return;
                  await api(`/admin/banners/${bannerEdit.id}`, { method: "DELETE" });
                  setMsg("Banner o'chirildi ✓");
                  closeBannerEditor();
                  load("banners");
                }}
              >
                <Text style={[st.actTxt, { color: C.error }]}>O'chirish</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!promoView} transparent animationType="fade" onRequestClose={() => setPromoView(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setPromoView(null)}>
          <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>{promoView?.code}</Text>
            <Text style={st.modalBody}>Promokod savat summasi {fmt(promoView?.min_cart || 0)} ga yetganda ishlaydi va {promoView?.type === "percent" ? `${promoView?.value}%` : `${fmt(promoView?.value || 0)} miqdorida`} chegirma beradi.</Text>
            <Text style={st.meta}>Ishlatilgan: {promoView?.used || 0}/{promoView?.limit || 0}</Text>
            <View style={st.modalActionRow}>
              <Pressable style={[st.actBtn, st.flexBtn, { backgroundColor: C.tertiary }]} onPress={() => setPromoView(null)}>
                <Text style={[st.actTxt, { color: C.onSurface }]}>Yopish</Text>
              </Pressable>
              <Pressable testID={promoView ? `admin-promo-del-${promoView.id}` : 'admin-promo-del'} style={[st.actBtn, st.flexBtn, { backgroundColor: C.error }]} onPress={async () => { if (!promoView?.id) return; await api(`/admin/promocodes/${promoView.id}/delete`, { method: "POST" }); setPromoView(null); load("promos"); }}>
                <Text style={st.actTxt}>O'chirish</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!dashHistory || dashHistoryLoading} transparent animationType="fade" onRequestClose={() => setDashHistory(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setDashHistory(null)}>
          <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>{dashHistory?.title || "Tarix"}</Text>
            {dashHistoryLoading ? <Text style={st.meta}>Yuklanmoqda...</Text> : (
              <ScrollView style={{ maxHeight: 420 }}>
                {(dashHistory?.items || []).length === 0 && <Text style={st.meta}>Ma'lumot topilmadi</Text>}
                {(dashHistory?.items || []).map((item: any) => (
                  <View key={item.id} style={st.detailBox}>
                    <Text style={st.detailTitle}>{item.primary}</Text>
                    {!!item.secondary && <Text style={st.detailText}>{item.secondary}</Text>}
                    <Text style={st.detailText}>{item.value ? fmt(item.value) : "—"}{item.date ? ` • ${new Date(item.date).toLocaleString()}` : ""}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={[st.actBtn, { backgroundColor: C.brandDark, marginTop: S.md }]} onPress={() => setDashHistory(null)}>
              <Text style={st.actTxt}>Yopish</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!resetTarget} transparent animationType="fade" onRequestClose={() => { setResetTarget(null); setResetConfirmText(""); }}>
        <Pressable testID="reset-stats-backdrop" style={st.modalBackdrop} onPress={() => { setResetTarget(null); setResetConfirmText(""); }}>
          <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Statistikani 0 qilish</Text>
            <Text style={st.modalBody}>
              {resetTarget?.first_name} ({resetTarget?.phone}) kuryerining barcha statistikasi (yetkazishlar, daromad, bugungi hisoblar) 0 ga tushiriladi. Bu amalni qaytarib bo'lmaydi.
            </Text>
            <View style={st.modalStatsRow}>
              <View style={st.modalStatBox}>
                <Text style={st.modalStatVal}>{resetTarget?.courier_stats_summary?.deliveries || 0}</Text>
                <Text style={st.modalStatLabel}>Yetkazishlar</Text>
              </View>
              <View style={st.modalStatBox}>
                <Text style={st.modalStatVal}>{fmt(resetTarget?.courier_stats_summary?.earnings || 0)}</Text>
                <Text style={st.modalStatLabel}>Daromad</Text>
              </View>
            </View>
            <Text style={st.modalBody}>Davom etish uchun <Text style={{ fontWeight: "900" }}>RESET</Text> deb yozing:</Text>
            <TextInput
              testID="reset-stats-confirm-input"
              style={st.input}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder="RESET"
              placeholderTextColor={C.muted}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
              <Pressable testID="reset-stats-cancel" style={[st.actBtn, { backgroundColor: C.tertiary, flex: 1 }]} onPress={() => { setResetTarget(null); setResetConfirmText(""); }}>
                <Text style={[st.actTxt, { color: C.onSurface }]}>Bekor qilish</Text>
              </Pressable>
              <Pressable
                testID="reset-stats-confirm"
                disabled={resetConfirmText.trim().toUpperCase() !== "RESET"}
                style={[st.actBtn, { backgroundColor: resetConfirmText.trim().toUpperCase() === "RESET" ? C.warning : C.tertiary, flex: 1, opacity: resetConfirmText.trim().toUpperCase() === "RESET" ? 1 : 0.5 }]}
                onPress={async () => {
                  const target = resetTarget;
                  setResetTarget(null);
                  setResetConfirmText("");
                  if (!target) return;
                  await api(`/admin/couriers/${target.id}/reset-stats`, { method: "POST" });
                  setMsg(`${target.first_name} statistikasi 0 ga tushirildi ✓`);
                  load("couriers");
                }}
              >
                <Text style={st.actTxt}>Ha, 0 qilish</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.inverse },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#fff" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: S.md, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: C.inverse, borderColor: C.inverse },
  chipTxt: { fontSize: 12, fontWeight: "700", color: C.onTertiary },
  msg: { color: C.brandDark, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: S.sm },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: { flexBasis: "30%", flexGrow: 1, backgroundColor: C.card, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border, gap: 4 },
  statVal: { fontSize: 16, fontWeight: "900", color: C.onSurface },
  statLabel: { fontSize: 11, color: C.muted, fontWeight: "600" },
  card: { backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md },
  bold: { fontWeight: "800", fontSize: 14, color: C.onSurface, flex: 1 },
  meta: { fontSize: 12, color: C.muted, marginTop: 3 },
  returnAlert: { color: C.error, fontSize: 12, fontWeight: "800", marginTop: 6 },
  adminItemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  adminItemTxt: { color: C.onTertiary, fontSize: 12, flex: 1 },
  returnMiniBadge: { borderRadius: R.pill, backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 3 },
  returnMiniBadgeTxt: { color: C.error, fontSize: 10, fontWeight: "800" },
  courierStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.sm },
  courierStatBox: { flexBasis: "48%", flexGrow: 1, backgroundColor: C.surface, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, padding: S.sm },
  courierStatVal: { fontSize: 15, fontWeight: "900", color: C.onSurface },
  courierStatLabel: { fontSize: 10, color: C.muted, fontWeight: "700", marginTop: 4 },
  sectionMiniTitle: { fontSize: 13, fontWeight: "900", color: C.onSurface, marginTop: S.md, marginBottom: 6 },
  detailBox: { backgroundColor: C.surface, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, padding: S.sm, marginTop: 6 },
  detailTitle: { fontSize: 12, fontWeight: "800", color: C.onSurface },
  detailText: { fontSize: 11, color: C.muted, marginTop: 3 },
  courierSummaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  courierSummaryRight: { alignItems: "flex-end", gap: 6 },
  categoryRowInfo: { flexDirection: "row", alignItems: "center", gap: S.sm, flex: 1 },
  subsectionCard: { marginTop: S.sm, padding: S.sm, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  rejectThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.tertiary },
  miniThumb: { width: 44, height: 44, borderRadius: R.sm, backgroundColor: C.tertiary },
  editPreview: { width: "100%", height: 180, borderRadius: R.md, backgroundColor: C.surface, marginBottom: S.sm },
  editPreviewPlaceholder: { width: "100%", height: 180, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", marginBottom: S.sm },
  modalActionRow: { flexDirection: "row", gap: S.sm, marginTop: S.md },
  flexBtn: { flex: 1 },
  markupRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, backgroundColor: C.brandTint, borderRadius: R.sm, padding: 8 },
  markupInfo: { fontSize: 11, color: C.onBrandSoft, fontWeight: "700", flex: 1 },
  actBtn: { borderRadius: R.sm, paddingHorizontal: S.md, height: 36, alignItems: "center", justifyContent: "center" },
  actTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  miniChip: { borderRadius: R.pill, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 30, justifyContent: "center", backgroundColor: C.surface, flexShrink: 0 },
  miniChipTxt: { fontSize: 11, fontWeight: "700", color: C.onTertiary },
  form: { backgroundColor: C.card, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.md, gap: S.sm },
  formTitle: { fontWeight: "900", fontSize: 14, color: C.onSurface },
  input: { backgroundColor: "#FFFFFF", borderRadius: R.sm, borderWidth: 1, borderColor: C.border, padding: S.md, color: C.onSurface, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: S.lg },
  modalCard: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, width: "100%", maxWidth: 480, borderWidth: 1, borderColor: C.border },
  modalTitle: { fontSize: 18, fontWeight: "900", color: C.onSurface, marginBottom: 6 },
  modalBody: { fontSize: 13, color: C.onTertiary, lineHeight: 19, marginBottom: S.sm },
  modalStatsRow: { flexDirection: "row", gap: S.sm, marginBottom: S.md },
  modalStatBox: { flex: 1, backgroundColor: C.surface, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, padding: S.sm, alignItems: "center" },
  modalStatVal: { fontSize: 18, fontWeight: "900", color: C.warning },
  modalStatLabel: { fontSize: 11, color: C.muted, fontWeight: "700", marginTop: 4 },
  adminImageBtn: {
    width: 42,
    height: 42,
    borderRadius: R.sm,
    backgroundColor: C.brandTint,
    borderWidth: 1,
    borderColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  adminImageClear: {
    width: 36,
    height: 36,
    borderRadius: R.pill,
    backgroundColor: C.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  adminImagePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    marginBottom: S.sm,
    padding: S.sm,
    backgroundColor: C.card,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  adminImageThumb: { width: 48, height: 48, borderRadius: 8 },
  adminImageHint: { flex: 1, fontSize: 12, color: C.muted, fontWeight: "600" },
  adminImageErr: { color: C.error, fontSize: 12, fontWeight: "600", marginBottom: S.sm },
});