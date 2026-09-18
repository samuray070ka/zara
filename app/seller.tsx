import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { C, S, R, fmt } from "@/src/lib/theme";
import { useLang, ml } from "@/src/lib/i18n";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { getCurrentLocation } from "@/src/lib/geo";
import { searchByImage, searchOwnProductsByImage, pickerAssetToUri } from "@/src/lib/imageSearch";

const TABS = [
  { k: "stats", l: "Statistika", icon: "stats-chart" },
  { k: "products", l: "Mahsulotlar", icon: "cube" },
  { k: "orders_today", l: "Bugungi", icon: "today" },
  { k: "orders", l: "Tarix", icon: "time" },
];

/** Bugungi kalendar kuni (UTC+05 / local) ISO sana qismi */
function localDayKey(isoStr?: string) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return localDayKey(new Date().toISOString());
}

const STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  confirmed: "Tasdiqlandi",
  packing: "Yig'ilmoqda",
  courier: "Kuryerda",
  delivered: "Yetkazildi",
  cancelled: "Bekor",
  seller_rejected: "Sotuvchi rad etdi",
};

const MAX_IMAGES = 5;

function getProductImage(p: any): string | undefined {
  if (!p) return undefined;
  if (Array.isArray(p.images) && p.images.length > 0) {
    const first = p.images[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      const url = first.url || first.image || first.src || first.uri || first.path;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  if (typeof p.images === "string" && p.images.trim()) return p.images.trim();
  const candidates = [p.image, p.preview_image, p.main_image, p.thumbnail, p.photo];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

const emptyForm = () => ({
  name_uz: "",
  name_ru: "",
  name_en: "",
  price: "",
  old_price: "",
  cost_price: "",
  box_price: "",
  units_per_box: "",
  stock: "",
  category_id: "",
  desc_uz: "",
  images: [] as string[],
  /** piece = dona/quti, kg = kilogram */
  unit_type: "piece" as "piece" | "kg",
});

export default function Seller() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { lang, t } = useLang();
  const { user, logout, refresh } = useAuth();

  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [msg, setMsg] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shopLocLoading, setShopLocLoading] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [rejectAllOrderId, setRejectAllOrderId] = useState<string | null>(null);
  const [rejectPhrase, setRejectPhrase] = useState("");

  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [similarError, setSimilarError] = useState("");
  const [ownSearchOpen, setOwnSearchOpen] = useState(false);
  const [ownSearchLoading, setOwnSearchLoading] = useState(false);
  const [ownSearchResults, setOwnSearchResults] = useState<any[]>([]);
  const [ownSearchError, setOwnSearchError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  /** orderId -> itemIndex -> { extra_qty, extra_price } */
  const [kgExtraDraft, setKgExtraDraft] = useState<Record<string, Record<number, { extra_qty: string; extra_price: string }>>>({});

  /** orderId -> { itemIndex: "accept" | "reject" } */
  const [itemDecisions, setItemDecisions] = useState<Record<string, Record<number, "accept" | "reject"> >>({});

  const getShopLocation = async () => {
    setMsg("");
    setShopLocLoading(true);
    try {
      const loc = await getCurrentLocation();
      await api("/seller/location", { method: "PUT", body: loc });
      await refresh();
      setMsg("Do'kon lokatsiyasi saqlandi ✓");
    } catch (e: any) {
      setMsg(e.message);
    }
    setShopLocLoading(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        api("/seller/stats").then((st) => st && setStats(st)).catch(() => {}),
        api("/seller/products")
          .then((pr) => setProducts(Array.isArray(pr) ? pr : []))
          .catch(() => setProducts([])),
        api("/seller/orders")
          .then((ord) => setOrders(Array.isArray(ord) ? ord : []))
          .catch(() => setOrders([])),
        api("/categories")
          .then((ct) => setCats(Array.isArray(ct) ? ct : []))
          .catch(() => {}),
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rootCats = useMemo(() => {
    const seen = new Set<string>();
    return cats
      .filter((c) => !c.parent_id)
      .filter((c) => {
        const key = `${(c?.name?.uz || "").trim().toLowerCase()}::${(c?.name?.ru || "").trim().toLowerCase()}::${(c?.name?.en || "").trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [cats]);

  // Yangi (tasdiqlanmagan) + bugungi → "Bugungi" tab
  // Tasdiqlangan / eski → "Tarix" tab
  const todayOrders = useMemo(() => {
    const day = todayKey();
    return (orders || []).filter((o) => {
      if (o.status !== "new") return false;
      // faqat bugungi yaratilgan yangi buyurtmalar
      const od = localDayKey(o.created_at);
      return !od || od === day;
    });
  }, [orders]);

  const historyOrders = useMemo(() => {
    const day = todayKey();
    return (orders || []).filter((o) => {
      // sotuvchi rad etgan buyurtmalar paneldan olib tashlansin
      if (o.status === "seller_rejected") return false;
      // tasdiqlangan va undan keyingi holatlar — tarix
      if (o.status !== "new") return true;
      // kechagi hali "new" qolganlar ham tarixda ko'rinsin (yo'qolmasin)
      const od = localDayKey(o.created_at);
      return od && od !== day;
    });
  }, [orders]);

  const isCompactForm = width < 520;
  const unitsPerBox = parseInt(form.units_per_box) || 0;
  const piecePrice = parseFloat(form.price) || 0;
  const boxPricePreview = form.box_price
    ? parseFloat(form.box_price) || 0
    : unitsPerBox > 0
    ? piecePrice * unitsPerBox
    : 0;
  const fullBoxesInStock =
    unitsPerBox > 0 ? Math.floor((parseInt(form.stock) || 0) / unitsPerBox) : 0;

  const pickImage = async () => {
    if (form.images.length >= MAX_IMAGES) {
      setMsg(`Ko'pi bilan ${MAX_IMAGES} ta rasm yuklash mumkin`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setMsg("Rasm yuklash uchun galereyaga ruxsat bering");
      return;
    }
    setUploading(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - form.images.length,
      });
      if (!res.canceled) {
        const uris = res.assets
          .filter((a) => !!a.base64)
          .map((a) => `data:image/jpeg;base64,${a.base64}`);
        setForm((f: any) => ({
          ...f,
          images: [...f.images, ...uris].slice(0, MAX_IMAGES),
        }));
      }
    } catch {
      setMsg("Rasm yuklashda xatolik");
    }
    setUploading(false);
  };

  const removeImage = (idx: number) => {
    setForm((f: any) => ({
      ...f,
      images: f.images.filter((_: any, i: number) => i !== idx),
    }));
    setSimilarProducts([]);
    setSimilarError("");
  };

  const searchOwnByImage = async () => {
    setOwnSearchError("");
    setOwnSearchResults([]);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setOwnSearchError("Galereyaga ruxsat bering");
        setOwnSearchOpen(true);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = pickerAssetToUri(res.assets[0]);
      if (!uri) {
        setOwnSearchError("Rasm o'qilmadi");
        setOwnSearchOpen(true);
        return;
      }
      setOwnSearchOpen(true);
      setOwnSearchLoading(true);
      const items = await searchOwnProductsByImage(uri);
      setOwnSearchResults(items);
      if (!items.length) setOwnSearchError("O'z mahsulotlaringiz orasidan o'xshash topilmadi");
    } catch (e: any) {
      setOwnSearchOpen(true);
      setOwnSearchError(e?.message || "Qidirishda xatolik");
    } finally {
      setOwnSearchLoading(false);
    }
  };

  const findSimilarByFormImage = async () => {

    const uri = form.images?.[0];
    if (!uri) {
      setMsg("Avval kamida bitta rasm yuklang");
      return;
    }
    setSimilarLoading(true);
    setSimilarError("");
    setSimilarProducts([]);
    try {
      const items = await searchByImage(uri);
      setSimilarProducts(items);
      if (!items.length) {
        setSimilarError("O'xshash mahsulot topilmadi");
      }
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/404|not found/i.test(msg)) {
        setSimilarError("Rasm orqali qidiruv backendda hali yoqilmagan");
      } else {
        setSimilarError(msg || "Qidirishda xatolik");
      }
    }
    setSimilarLoading(false);
  };

  const saveProduct = async () => {
    if (savingProduct) return;
    setMsg("");
    const hasPiecePrice = !!String(form.price || "").trim();
    const hasBoxPrice = !!String(form.box_price || "").trim();
    const parsedUnits = parseInt(form.units_per_box) || 0;
    const isKg = form.unit_type === "kg";

    if (!form.name_uz.trim()) {
      setMsg("Mahsulot nomini kiriting");
      return;
    }
    if (isKg) {
      if (!hasPiecePrice) {
        setMsg("1 kg narxini kiriting");
        return;
      }
    } else {
      if (!hasPiecePrice && !hasBoxPrice) {
        setMsg("Donasi narxi yoki quti narxidan kamida bittasini kiriting");
        return;
      }
      if (!hasPiecePrice && hasBoxPrice && parsedUnits <= 0) {
        setMsg("Faqat quti narxi kiritilsa, 1 qutida nechta ham ko'rsatilishi kerak");
        return;
      }
    }
    if (!editId && form.images.length === 0) {
      setMsg("Kamida bitta mahsulot rasmini yuklang");
      return;
    }

    setSavingProduct(true);
    try {
      const parsedBoxPrice = form.box_price ? parseFloat(form.box_price) : null;
      const derivedPiecePrice = form.price
        ? parseFloat(form.price) || 0
        : parsedBoxPrice != null && parsedUnits > 0
        ? parsedBoxPrice / parsedUnits
        : 0;

      const unitType = form.unit_type === "kg" ? "kg" : "piece";
      const body = {
        name_uz: form.name_uz,
        name_ru: form.name_ru,
        name_en: form.name_en,
        desc_uz: form.desc_uz,
        category_id: form.category_id || cats.find((c) => !c.parent_id)?.id,
        price: derivedPiecePrice,
        old_price: form.old_price ? parseFloat(form.old_price) : null,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        // kg rejimida quti ishlatilmaydi
        box_price: unitType === "kg" ? null : parsedBoxPrice,
        units_per_box: unitType === "kg" ? 0 : parsedUnits,
        stock: parseInt(form.stock) || 0,
        images: form.images,
        unit_type: unitType,
      };

      if (editId) {
        await api(`/seller/products/${editId}/update`, { method: "POST", body });
        setMsg("Mahsulot yangilandi ✓");
      } else {
        await api("/seller/products", { method: "POST", body });
        setMsg("Mahsulot moderatsiyaga yuborildi ✓");
      }

      setShowAddForm(false);
      setEditModal(false);
      setEditId(null);
      setForm(emptyForm());
      setSimilarProducts([]);
      setSimilarError("");
      load();
    } catch (e: any) {
      setMsg(e?.message || "Xatolik yuz berdi");
    } finally {
      setSavingProduct(false);
    }
  };

  const startEdit = (p: any) => {
    const name = p.name || {};
    const desc = p.desc || {};
    setEditId(p.id);
    setForm({
      name_uz: typeof name === "string" ? name : name.uz || "",
      name_ru: typeof name === "object" ? name.ru || "" : "",
      name_en: typeof name === "object" ? name.en || "" : "",
      price: p.price != null ? String(p.price) : "",
      old_price: p.old_price != null ? String(p.old_price) : "",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      box_price:
        p.seller_box_price != null
          ? String(p.seller_box_price)
          : p.box_price != null
          ? String(p.box_price)
          : "",
      units_per_box: p.units_per_box != null ? String(p.units_per_box) : "",
      stock: p.stock != null ? String(p.stock) : "0",
      category_id: p.category_id || "",
      desc_uz: typeof desc === "string" ? desc : desc.uz || "",
      images: Array.isArray(p.images)
        ? p.images
        : p.images
        ? [p.images]
        : [],
      unit_type: (p.unit_type === "kg" || p.sale_mode === "kg") ? "kg" : "piece",
    });
    setEditModal(true);
    setMsg("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/seller/products/${deleteTarget.id}/delete`, { method: "POST" });
      setMsg("Mahsulot o‘chirildi ✓");
      setDeleteModal(false);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      setMsg(e?.message || "O‘chirishda xatolik");
    }
  };

  const handleToggleHide = async (p: any) => {
    try {
      await api(`/seller/products/${p.id}/toggle-hide`, { method: "POST" });
      load();
    } catch (e: any) {
      setMsg(e?.message || "Yashirishda xatolik");
    }
  };

  const setItemDecision = (oid: string, idx: number, action: "accept" | "reject") => {
    setItemDecisions((prev) => ({
      ...prev,
      [oid]: { ...(prev[oid] || {}), [idx]: action },
    }));
  };

  const getItemDecision = (oid: string, idx: number, itemsLen: number): "accept" | "reject" => {
    const map = itemDecisions[oid];
    if (map && map[idx]) return map[idx];
    return "accept"; // default: qabul
  };

  const countItemDecisions = (oid: string, itemsLen: number) => {
    let accept = 0;
    let reject = 0;
    for (let i = 0; i < itemsLen; i++) {
      if (getItemDecision(oid, i, itemsLen) === "reject") reject += 1;
      else accept += 1;
    }
    return { accept, reject };
  };

  const normalizedRejectPhrase = rejectPhrase
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, "'");
  const canConfirmRejectAll =
    normalizedRejectPhrase === "rad etish" ||
    normalizedRejectPhrase === "radetish";

  const openRejectAllModal = (oid: string) => {
    setRejectAllOrderId(oid);
    setRejectPhrase("");
  };

  const confirmRejectAll = async () => {
    if (!rejectAllOrderId || !canConfirmRejectAll) return;
    const oid = rejectAllOrderId;
    setRejectAllOrderId(null);
    setRejectPhrase("");
    await orderAction(oid, "reject");
  };

  const orderAction = async (oid: string, action: string, orderItems?: any[]) => {

    const key = `${oid}:${action}`;
    if (orderBusy === key) return;
    setOrderBusy(key);
    try {
      const body: any = {
        action,
        reason: action === "reject" ? "Sotuvchi rad etdi" : "",
      };
      // Tasdiqlash: tepadagi har bir mahsulotdagi Qabul/Rad tanloviga qarab
      if (action === "accept" && Array.isArray(orderItems) && orderItems.length > 0) {
        body.items = orderItems.map((_: any, idx: number) => ({
          index: idx,
          action: getItemDecision(oid, idx, orderItems.length),
        }));
      }
      // Yig'ildi: kg mahsulotlar uchun ortiqcha og'irlik
      if (action === "packed") {
        const draft = kgExtraDraft[oid] || {};
        const itemsSrc = orderItems || (orders.find((x) => x.id === oid)?.items || []);
        const kg_extras: any[] = [];
        itemsSrc.forEach((it: any, idx: number) => {
          if (!isOrderItemKg(it)) return;
          const d = draft[idx] || { extra_qty: "", extra_price: "" };
          const eq = parseFloat(String(d.extra_qty || "").replace(",", ".")) || 0;
          const ep = parseFloat(String(d.extra_price || "").replace(",", ".")) || 0;
          if (eq > 0 || ep > 0) {
            kg_extras.push({ index: idx, extra_qty: eq, extra_price: ep });
          }
        });
        if (kg_extras.length) body.kg_extras = kg_extras;
      }
      const res = await api(`/seller/orders/${oid}/action`, { method: "POST", body });
      setItemDecisions((prev) => {
        const next = { ...prev };
        delete next[oid];
        return next;
      });
      if (action === "reject") {
        setMsg("Buyurtma to'liq rad etildi");
      } else if (res?.mode === "partial") {
        setMsg(
          `Tanlanganlar saqlandi ✓ (qabul: ${res.accepted ?? 0}, rad: ${res.rejected ?? 0})`
        );
      } else if (res?.mode === "full_reject") {
        setMsg("Barcha mahsulotlar rad etildi");
      } else {
        setMsg("Buyurtma qabul qilindi ✓");
      }
    } catch (e: any) {
      setMsg(e?.message || "Amal bajarilmadi");
    }
    setOrderBusy(null);
    load();
  };

  const confirmPaymentReceived = async (oid: string) => {
    const key = `${oid}:payment_received`;
    if (orderBusy === key) return;
    setOrderBusy(key);
    try {
      await api(`/seller/orders/${oid}/payment-received`, { method: "POST", body: {} });
      setMsg("Pul olganingiz tasdiqlandi ✓");
      load();
    } catch (e: any) {
      try {
        await api(`/seller/orders/${oid}/action`, {
          method: "POST",
          body: { action: "payment_received" },
        });
        setMsg("Pul olganingiz tasdiqlandi ✓");
        load();
      } catch (e2: any) {
        setMsg(e2?.message || e?.message || "Tasdiqlab bo'lmadi");
      }
    } finally {
      setOrderBusy(null);
    }
  };

  const isOrderItemKg = (item: any) => {
    const mode = String(item?.sale_mode || item?.unit_type || "").toLowerCase();
    if (mode === "kg") return true;
    const pid = item?.product_id;
    if (pid) {
      const prod = products.find((x) => x.id === pid);
      if (prod && (String(prod.unit_type || "").toLowerCase() === "kg" || String(prod.sale_mode || "").toLowerCase() === "kg")) {
        return true;
      }
    }
    return false;
  };

  const getOrderPayout = (o: any) => {
    const items = Array.isArray(o?.items) ? o.items : [];
    let gross = 0;
    let returnedSum = 0;
    let soldSum = 0;
    items.forEach((i: any) => {
      const unit = Number(i.earn ?? i.seller_price ?? i.price ?? 0);
      const line = unit * Number(i.qty || 0);
      gross += line;
      if (i.delivery_status === "returned") returnedSum += line;
      else soldSum += line;
    });
    const net =
      o.earn_total != null && o.status === "delivered" ? Number(o.earn_total) : soldSum;
    return { gross, returnedSum, soldSum, net };
  };

  // ——— Forma (yangi + edit modal uchun umumiy) ———
  const renderFormFields = () => (
    <>
      <Text style={st.formLabel}>{t("addImages")} *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {form.images.map((uri: string, idx: number) => (
          <View key={idx} style={st.imgThumbWrap}>
            <Image source={{ uri }} style={st.imgThumb} contentFit="cover" />
            <Pressable style={st.imgRemoveBtn} onPress={() => removeImage(idx)}>
              <Ionicons name="close" size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
        {form.images.length < MAX_IMAGES && (
          <Pressable style={st.imgAddBtn} onPress={pickImage} disabled={uploading}>
            <Ionicons
              name={uploading ? "hourglass-outline" : "camera-outline"}
              size={22}
              color={C.brandDark}
            />
            <Text style={st.imgAddTxt}>{t("addImage")}</Text>
          </Pressable>
        )}
      </ScrollView>

      {form.images.length > 0 && (
        <View style={{ marginTop: S.sm, marginBottom: S.sm }}>
          <Pressable
            testID="seller-find-similar-image"
            style={st.similarBtn}
            onPress={findSimilarByFormImage}
            disabled={similarLoading}
          >
            {similarLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="images-outline" size={16} color="#fff" />
            )}
            <Text style={st.similarBtnTxt}>
              {similarLoading ? t("imageSearching") : t("findSimilarByImage")}
            </Text>
          </Pressable>
          {!!similarError && <Text style={st.similarErr}>{similarError}</Text>}
          {similarProducts.length > 0 && (
            <View style={st.similarBox}>
              <Text style={st.similarTitle}>{t("similarFound")} ({similarProducts.length})</Text>
              {similarProducts.slice(0, 6).map((sp: any) => (
                <View key={sp.id || sp.product_id} style={st.similarRow}>
                  {!!(sp.image || sp.images?.[0]) && (
                    <Image
                      source={{ uri: typeof sp.images?.[0] === "string" ? sp.images[0] : sp.image || sp.images?.[0]?.url }}
                      style={st.similarThumb}
                      contentFit="cover"
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={st.similarName} numberOfLines={1}>
                      {ml(sp.name, lang) || sp.name_uz || "—"}
                    </Text>
                    <Text style={st.similarMeta}>
                      {fmt(sp.display_price ?? sp.effective_price ?? sp.price ?? 0)}
                      {sp.stock != null ? ` • qoldiq: ${sp.stock}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <TextInput
        style={st.input}
        value={form.name_uz}
        onChangeText={(v) => setForm({ ...form, name_uz: v })}
        placeholder="Nomi (O'zbekcha) *"
        placeholderTextColor={C.muted}
      />
      <TextInput
        style={st.input}
        value={form.name_ru}
        onChangeText={(v) => setForm({ ...form, name_ru: v })}
        placeholder="Nomi (Ruscha)"
        placeholderTextColor={C.muted}
      />
      <TextInput
        style={st.input}
        value={form.name_en}
        onChangeText={(v) => setForm({ ...form, name_en: v })}
        placeholder="Nomi (Inglizcha)"
        placeholderTextColor={C.muted}
      />
      <TextInput
        style={st.input}
        value={form.desc_uz}
        onChangeText={(v) => setForm({ ...form, desc_uz: v })}
        placeholder="Mahsulot haqida"
        placeholderTextColor={C.muted}
        multiline
      />

      <Text style={st.formLabel}>Sotish birligi *</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
        <Pressable
          style={[
            st.chip,
            form.unit_type !== "kg" && st.chipActive,
            { flex: 1, alignItems: "center", height: 40 },
          ]}
          onPress={() => setForm({ ...form, unit_type: "piece", units_per_box: form.units_per_box, box_price: form.box_price })}
        >
          <Text style={[st.chipTxt, form.unit_type !== "kg" && { color: "#fff" }]}>Dona</Text>
        </Pressable>
        <Pressable
          style={[
            st.chip,
            form.unit_type === "kg" && st.chipActive,
            { flex: 1, alignItems: "center", height: 40 },
          ]}
          onPress={() => setForm({ ...form, unit_type: "kg", units_per_box: "", box_price: "" })}
        >
          <Text style={[st.chipTxt, form.unit_type === "kg" && { color: "#fff" }]}>Kg</Text>
        </Pressable>
      </View>

      <View style={[st.formRow, isCompactForm && st.formRowStack]}>
        <TextInput
          style={[st.input, st.formInput, isCompactForm && st.formInputFull]}
          value={form.price}
          onChangeText={(v) => setForm({ ...form, price: v })}
          placeholder={form.unit_type === "kg" ? "1 kg narxi *" : "1 dona narxi *"}
          placeholderTextColor={C.muted}
          keyboardType="numeric"
        />
        {form.unit_type !== "kg" && (
          <>
            <TextInput
              style={[st.input, st.formInput, isCompactForm && st.formInputFull]}
              value={form.units_per_box}
              onChangeText={(v) => setForm({ ...form, units_per_box: v })}
              placeholder="1 qutida nechta"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
            />
            <TextInput
              style={[st.input, st.formInput, isCompactForm && st.formInputFull]}
              value={form.box_price}
              onChangeText={(v) => setForm({ ...form, box_price: v })}
              placeholder="Quti narxi"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
            />
          </>
        )}
        <TextInput
          style={[st.input, st.formInput, isCompactForm && st.formInputFull]}
          value={form.stock}
          onChangeText={(v) => setForm({ ...form, stock: v })}
          placeholder={form.unit_type === "kg" ? "Qancha kg bor *" : "Qancha dona bor *"}
          placeholderTextColor={C.muted}
          keyboardType="numeric"
        />
      </View>

      <TextInput
        style={st.input}
        value={form.old_price}
        onChangeText={(v) => setForm({ ...form, old_price: v })}
        placeholder="Eski narx"
        placeholderTextColor={C.muted}
        keyboardType="numeric"
      />

      {form.unit_type === "kg" ? (
        <View style={st.infoNote}>
          <Ionicons name="scale-outline" size={16} color={C.onBrandSoft} />
          <Text style={st.infoNoteTxt}>
            Kg rejimi: narx 1 kg uchun. Omborda {form.stock || "0"} kg. Chekda kg ko'rsatiladi.
          </Text>
        </View>
      ) : unitsPerBox > 0 ? (
        <View style={st.infoNote}>
          <Ionicons name="cube-outline" size={16} color={C.onBrandSoft} />
          <Text style={st.infoNoteTxt}>
            1 quti = {unitsPerBox} ta • donasi: {fmt(piecePrice)} • quti: {fmt(boxPricePreview)}
            {fullBoxesInStock > 0 ? ` • to'liq quti: ${fullBoxesInStock}` : ""}
          </Text>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: S.sm, paddingVertical: S.sm }}
      >
        {rootCats.map((c) => (
          <Pressable
            key={c.id}
            style={[st.chip, form.category_id === c.id && st.chipActive]}
            onPress={() => setForm({ ...form, category_id: c.id })}
          >
            <Text style={[st.chipTxt, form.category_id === c.id && { color: "#fff" }]}>
              {ml(c.name, lang)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={[C.inverse, "#064E3B"]} style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>{t("sellerPanel")}</Text>
          <Text style={st.headerSub}>{user?.seller_info?.shop_name || "Do'kon"}</Text>
        </View>
        <Pressable onPress={() => setConfirmLogout(true)} style={st.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
        </Pressable>
      </LinearGradient>

      {confirmLogout && (
        <View style={st.confirmBar}>
          <Text style={st.confirmTxt}>Hisobdan chiqmoqchimisiz?</Text>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <Pressable style={[st.miniBtn, { backgroundColor: C.error }]} onPress={logout}>
              <Text style={st.miniBtnTxt}>Ha, chiqish</Text>
            </Pressable>
            <Pressable
              style={[st.miniBtn, { backgroundColor: C.tertiary }]}
              onPress={() => setConfirmLogout(false)}
            >
              <Text style={[st.miniBtnTxt, { color: C.onSurface }]}>Bekor qilish</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={st.tabRow}>
        {TABS.map((tb) => (
          <Pressable
            key={tb.k}
            style={[st.tab, tab === tb.k && st.tabActive]}
            onPress={() => { setTab(tb.k); if (tb.k === "orders") setExpandedHistoryId(null); }}
          >
            <Ionicons
              name={tb.icon as any}
              size={16}
              color={tab === tb.k ? C.brandDark : C.muted}
            />
            <Text style={[st.tabTxt, tab === tb.k && { color: C.brandDark }]}>{tb.l}</Text>
          </Pressable>
        ))}
      </View>

      {!!msg && <Text style={st.msg}>{msg}</Text>}

      <ScrollView
        contentContainerStyle={{
          padding: S.lg,
          maxWidth: 900,
          width: "100%",
          alignSelf: "center",
          paddingBottom: 80,
        }}
      >
        {/* ——— STATS ——— */}
        {tab === "stats" && (
          <>
            <View style={st.locCard}>
              <View style={st.locIconBox}>
                <Ionicons name="location" size={20} color={C.brandDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.locTitle}>Do'kon lokatsiyasi</Text>
                <Text style={st.locSub}>
                  {user?.seller_info?.shop_lat != null
                    ? `📍 ${Number(user.seller_info.shop_lat).toFixed(6)}, ${Number(
                        user.seller_info.shop_lng
                      ).toFixed(6)}`
                    : "Kiritilmagan — kuryer marshruti uchun zarur"}
                </Text>
              </View>
              <Pressable
                style={[st.locBtn, shopLocLoading && { opacity: 0.6 }]}
                onPress={getShopLocation}
                disabled={shopLocLoading}
              >
                {shopLocLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="locate" size={14} color="#fff" />
                )}
                <Text style={st.locBtnTxt}>Joriy lokatsiyamni olish</Text>
              </Pressable>
            </View>

            {!stats && loading && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.brandDark} />
              </View>
            )}

            {stats && (
              <>
                <View style={st.statGrid}>
                  {[
                    { l: "Bugungi buyurtmalar", v: String(stats.today_orders || 0), icon: "receipt" },
                    { l: "Bugungi summa", v: fmt(stats.today_sales || 0), icon: "cash" },
                    { l: "Qaytarilgan buyurtmalar", v: String(stats.today_returns_count || 0), icon: "return-up-back" },
                    { l: "Qaytarilgan summa", v: fmt(stats.today_returns_amount || 0), icon: "refresh-circle" },
                  ].map((s, i) => (
                    <Animated.View
                      key={s.l}
                      entering={FadeInDown.delay(i * 60).springify()}
                      style={st.statCard}
                    >
                      <View style={st.statIconBox}>
                        <Ionicons name={s.icon as any} size={18} color={C.brandDark} />
                      </View>
                      <Text style={st.statVal}>{s.v}</Text>
                      <Text style={st.statLabel}>{s.l}</Text>
                    </Animated.View>
                  ))}
                </View>

                {(() => {
                  const lowList = (products || []).filter((x) => {
                    const s = Number(x.stock ?? 0);
                    return s > 0 && s < 10;
                  });
                  if (lowList.length === 0) return null;
                  return (
                    <View style={st.lowAlertCard}>
                      <View style={st.lowAlertTop}>
                        <View style={st.lowAlertIconWrap}>
                          <Ionicons name="warning" size={20} color="#C2410C" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.lowAlertTitle}>Zaxira kamayib bormoqda</Text>
                          <Text style={st.lowAlertSub}>
                            {lowList.length} ta mahsulotda 10 tadan kam qoldi
                          </Text>
                        </View>
                        <View style={st.lowAlertBadge}>
                          <Text style={st.lowAlertBadgeTxt}>{lowList.length}</Text>
                        </View>
                      </View>
                      {lowList.map((p: any) => {
                        const imgUri = getProductImage(p);
                        const stockNum = Number(p.stock ?? 0);
                        const unit =
                          p.unit_type === "kg" || p.sale_mode === "kg" ? "kg" : "dona";
                        return (
                          <View key={p.id} style={st.lowAlertItem}>
                            {imgUri ? (
                              <Image
                                source={{ uri: imgUri }}
                                style={st.lowAlertImg}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={[st.lowAlertImg, st.lowAlertImgEmpty]}>
                                <Ionicons name="cube-outline" size={18} color="#EA580C" />
                              </View>
                            )}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={st.lowAlertName} numberOfLines={1}>
                                {ml(p.name, lang)}
                              </Text>
                              <View style={st.lowAlertMetaRow}>
                                <View style={st.lowAlertStockPill}>
                                  <Text style={st.lowAlertStockTxt}>
                                    {stockNum} {unit}
                                  </Text>
                                </View>
                                <Text style={st.lowAlertHint}>10 tadan kam</Text>
                              </View>
                            </View>
                            <Pressable
                              style={st.lowAlertEdit}
                              onPress={() => startEdit(p)}
                            >
                              <Ionicons name="create-outline" size={15} color="#fff" />
                              <Text style={st.lowAlertEditTxt}>Tahrirlash</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                <Text style={st.secTitle}>Eng ko'p sotilgan</Text>
                {(stats.top_products || []).map((p: any, i: number) => (
                  <View key={i} style={st.topRow}>
                    <Text style={st.topRank}>#{i + 1}</Text>
                    <Text style={st.topName} numberOfLines={1}>{p.name}</Text>
                    <Text style={st.topMeta}>{p.sold} sotildi • {p.views} ko'rish</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ——— PRODUCTS ——— */}
        {tab === "products" && (
          <>
            <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
              <Pressable
                style={[st.addBtn, { flex: 1, marginBottom: 0 }]}
                onPress={() => {
                  setShowAddForm(!showAddForm);
                  setEditId(null);
                  setForm(emptyForm());
                  setMsg("");
                  setSimilarProducts([]);
                  setSimilarError("");
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800" }}>Mahsulot qo'shish</Text>
              </Pressable>
              <Pressable
                style={[st.addBtn, { flex: 1, marginBottom: 0, backgroundColor: C.inverse }]}
                onPress={searchOwnByImage}
                disabled={ownSearchLoading}
              >
                {ownSearchLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="images-outline" size={18} color="#fff" />
                )}
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                  {ownSearchLoading ? "Qidirilmoqda..." : "O'zimnikidan qidirish"}
                </Text>
              </Pressable>
            </View>

            {ownSearchOpen && (
              <View style={[st.form, { marginBottom: S.md }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={st.formLabel}>O'z mahsulotlarim (rasm)</Text>
                  <Pressable onPress={() => { setOwnSearchOpen(false); setOwnSearchResults([]); setOwnSearchError(""); }}>
                    <Ionicons name="close" size={20} color={C.muted} />
                  </Pressable>
                </View>
                {!!ownSearchError && <Text style={st.similarErr}>{ownSearchError}</Text>}
                {ownSearchLoading && <ActivityIndicator color={C.brandDark} style={{ marginVertical: 12 }} />}
                {ownSearchResults.map((sp: any) => (
                  <Pressable
                    key={sp.id || sp.product_id}
                    style={st.similarRow}
                    onPress={() => {
                      // mahsulotni tahrirlash uchun ochish
                      const full = products.find((x) => x.id === (sp.id || sp.product_id));
                      if (full) startEdit(full);
                      else setMsg(ml(sp.name, lang) || "Mahsulot");
                    }}
                  >
                    {!!(sp.image || sp.images?.[0]) && (
                      <Image
                        source={{ uri: typeof sp.images?.[0] === "string" ? sp.images[0] : sp.image || sp.images?.[0]?.url }}
                        style={st.similarThumb}
                        contentFit="cover"
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={st.similarName} numberOfLines={1}>{ml(sp.name, lang) || "—"}</Text>
                      <Text style={st.similarMeta}>{fmt(sp.display_price ?? sp.effective_price ?? sp.price ?? 0)} • qoldiq: {sp.stock_total_units ?? sp.stock ?? "—"}</Text>
                    </View>
                    <Ionicons name="create-outline" size={18} color={C.brandDark} />
                  </Pressable>
                ))}
              </View>
            )}

            {showAddForm && (
              <View style={st.form}>
                {renderFormFields()}
                <Pressable
                  style={[st.saveBtn, savingProduct && { opacity: 0.7 }]}
                  onPress={saveProduct}
                  disabled={savingProduct}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    {savingProduct ? "Yuklanmoqda..." : "Moderatsiyaga yuborish"}
                  </Text>
                </Pressable>
              </View>
            )}

            {loading && products.length === 0 && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.brandDark} />
              </View>
            )}
            {!loading && products.length === 0 && (
              <Text style={st.empty}>Mahsulot yo'q. Yuqoridan qo'shing.</Text>
            )}

            {products.length > 0 && (
              <TextInput
                style={[st.input, { marginBottom: S.md }]}
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Mahsulot nomi bo'yicha qidirish..."
                placeholderTextColor={C.muted}
                autoCorrect={false}
                autoCapitalize="none"
              />
            )}

            {(() => {
              const low = (products || []).filter((x) => {
                const s = Number(x.stock ?? 0);
                return s > 0 && s < 10;
              });
              if (low.length === 0) return null;
              return (
                <View style={st.lowStockBanner}>
                  <View style={st.lowStockIcon}>
                    <Ionicons name="warning" size={20} color="#B45309" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.lowStockTitle}>Zaxira kam!</Text>
                    <Text style={st.lowStockSub}>
                      {low.length} ta mahsulotda 10 tadan kam qoldi. Tezroq to'ldiring.
                    </Text>
                  </View>
                </View>
              );
            })()}

            {(() => {
              const q = productSearch.trim().toLowerCase();
              const filtered = !q
                ? products
                : products.filter((pr) => {
                    const name = ml(pr.name, lang).toLowerCase();
                    const id = String(pr.id || "").toLowerCase();
                    return name.includes(q) || id.includes(q);
                  });
              if (products.length > 0 && filtered.length === 0) {
                return <Text style={st.empty}>Qidiruv bo'yicha mahsulot topilmadi</Text>;
              }
              return filtered.map((p) => {
              const expanded = expandedProductId === p.id;
              const boxPrice =
                p.seller_box_price ?? (p.seller_price ?? p.price) * (p.units_per_box || 0);
              const imgUri = getProductImage(p);

              const stockNum = Number(p.stock ?? 0);
              const isLowStock = stockNum > 0 && stockNum < 10;
              return (
                <View
                  key={p.id}
                  style={[
                    st.prodRow,
                    isLowStock && st.prodRowLowStock,
                    stockNum <= 0 && st.prodRowEmpty,
                  ]}
                >
                  {isLowStock && (
                    <View style={st.lowStockChip}>
                      <Ionicons name="alert-circle" size={14} color="#B45309" />
                      <Text style={st.lowStockChipTxt}>
                        Faqat {stockNum} {p.unit_type === "kg" || p.sale_mode === "kg" ? "kg" : "dona"} qoldi — 10 tadan kam!
                      </Text>
                    </View>
                  )}
                  <Pressable
                    style={st.prodTopRow}
                    onPress={() => setExpandedProductId(expanded ? null : p.id)}
                  >
                    {imgUri ? (
                      <Image source={{ uri: imgUri }} style={st.prodImg} contentFit="cover" />
                    ) : (
                      <View style={[st.prodImg, { alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="image-outline" size={24} color={C.muted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={st.prodName} numberOfLines={1}>
                        {ml(p.name, lang)}
                      </Text>
                      <Text style={st.prodMeta}>
                        {p.unit_type === "kg" || p.sale_mode === "kg"
                          ? `${fmt(p.seller_price ?? p.price)} / kg • Qoldiq: ${p.stock} kg`
                          : !!p.units_per_box
                          ? `${fmt(boxPrice)} • Qoldiq: ${p.stock} dona`
                          : `${fmt(p.seller_price ?? p.price)} • Qoldiq: ${p.stock} dona`}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <View
                          style={[
                            st.badge,
                            p.status === "approved"
                              ? { backgroundColor: C.brandSoft }
                              : p.status === "pending"
                              ? { backgroundColor: "#FEF3C7" }
                              : { backgroundColor: "#FEE2E2" },
                          ]}
                        >
                          <Text
                            style={[
                              st.badgeTxt,
                              {
                                color:
                                  p.status === "approved"
                                    ? C.onBrandSoft
                                    : p.status === "pending"
                                    ? "#B45309"
                                    : C.error,
                              },
                            ]}
                          >
                            {p.status === "approved"
                              ? "Tasdiqlangan"
                              : p.status === "pending"
                              ? "Moderatsiyada"
                              : "Rad etilgan"}
                          </Text>
                        </View>
                        {p.stock <= 0 && (
                          <View style={[st.badge, { backgroundColor: C.tertiary }]}>
                            <Text style={[st.badgeTxt, { color: C.muted }]}>Tugagan</Text>
                          </View>
                        )}
                        {Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) < 10 && (
                          <View style={[st.badge, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[st.badgeTxt, { color: "#B45309" }]}>Kam qoldi</Text>
                          </View>
                        )}
                        {p.hidden && (
                          <View style={[st.badge, { backgroundColor: C.tertiary }]}>
                            <Text style={[st.badgeTxt, { color: C.muted }]}>Yashirilgan</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={C.muted}
                    />
                  </Pressable>

                  {expanded && (
                    <View style={st.prodActionsPanel}>
                      <Pressable style={st.prodActionBtn} onPress={() => startEdit(p)}>
                        <Ionicons name="create-outline" size={16} color={C.onSurface} />
                        <Text style={st.prodActionTxt}>Edit</Text>
                      </Pressable>
                      <Pressable style={st.prodActionBtn} onPress={() => handleToggleHide(p)}>
                        <Ionicons
                          name={p.hidden ? "eye" : "eye-off"}
                          size={16}
                          color={C.onSurface}
                        />
                        <Text style={st.prodActionTxt}>{p.hidden ? "Show" : "Hide"}</Text>
                      </Pressable>
                      <Pressable
                        style={[st.prodActionBtn, st.prodActionBtnDanger]}
                        onPress={() => {
                          setDeleteTarget(p);
                          setDeleteModal(true);
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={C.error} />
                        <Text style={[st.prodActionTxt, { color: C.error }]}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            });
            })()}
          </>
        )}

        {/* ——— BUGUNGI / YANGI BUYURTMALAR ——— */}
        {tab === "orders_today" && (
          <>
            <View style={st.infoNote}>
              <Ionicons name="calendar" size={16} color={C.onBrandSoft} />
              <Text style={st.infoNoteTxt}>
                Faqat bugungi yangi buyurtmalar. Qabul qilsangiz — «Tarix» bo'limiga o'tadi.
              </Text>
            </View>
            {loading && todayOrders.length === 0 && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.brandDark} />
              </View>
            )}
            {!loading && todayOrders.length === 0 && (
              <Text style={st.empty}>Bugun yangi buyurtma yo'q</Text>
            )}
            {todayOrders.map((o) => {
              return (
                <View key={o.id} style={[st.orderCard, { borderColor: C.brandDark, borderWidth: 1.5 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "900", color: C.onSurface, fontSize: 15 }}>
                      {o.number}
                    </Text>
                    <View style={[st.badge, { backgroundColor: "#FEF3C7" }]}>
                      <Text style={[st.badgeTxt, { color: "#B45309" }]}>
                        {STATUS_LABEL[o.status] || "Yangi"}
                      </Text>
                    </View>
                  </View>
                  <Text style={st.orderMeta}>
                    {o.delivery_method === "pickup"
                      ? "🏪 O'zi olib ketadi"
                      : "🛵 Kuryer"}
                    {o.created_at ? ` • ${new Date(o.created_at).toLocaleString()}` : ""}
                  </Text>
                  {(o.items || []).map((i: any, idx: number) => {
                    const decision = getItemDecision(o.id, idx, (o.items || []).length);
                    const lineSum = (i.earn ?? i.seller_price ?? i.price) * i.qty;
                    return (
                      <View
                        key={idx}
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: R.sm,
                          borderWidth: 1,
                          borderColor: decision === "reject" ? "#FECACA" : C.border,
                          backgroundColor: decision === "reject" ? "#FEF2F2" : C.surface,
                        }}
                      >
                        <Text style={st.orderItem}>
                          • {ml(i.name, lang)} × {i.qty} = {fmt(lineSum)}
                        </Text>
                        {o.status === "new" && (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                            <Pressable
                              style={{
                                flex: 1,
                                height: 34,
                                borderRadius: R.sm,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: decision === "accept" ? C.brandDark : C.tertiary,
                              }}
                              onPress={() => setItemDecision(o.id, idx, "accept")}
                            >
                              <Text
                                style={{
                                  fontWeight: "800",
                                  fontSize: 12,
                                  color: decision === "accept" ? "#fff" : C.onSurface,
                                }}
                              >
                                Qabul
                              </Text>
                            </Pressable>
                            <Pressable
                              style={{
                                flex: 1,
                                height: 34,
                                borderRadius: R.sm,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: decision === "reject" ? C.error : C.tertiary,
                              }}
                              onPress={() => setItemDecision(o.id, idx, "reject")}
                            >
                              <Text
                                style={{
                                  fontWeight: "800",
                                  fontSize: 12,
                                  color: decision === "reject" ? "#fff" : C.onSurface,
                                }}
                              >
                                Rad
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                  <Text style={{ fontWeight: "900", color: C.brandDark, marginTop: 8 }}>
                    Daromad: {fmt(o.earn_total)}
                  </Text>
                  {o.status === "new" && (() => {
                    const itemsLen = (o.items || []).length;
                    const { accept: accN, reject: rejN } = countItemDecisions(o.id, itemsLen);
                    return (
                      <>
                        <Text style={{ fontSize: 12, color: C.muted, marginTop: 6, fontWeight: "600" }}>
                          Tanlov: {accN} ta qabul • {rejN} ta rad
                        </Text>
                        <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                          <Pressable
                            style={[
                              st.actBtn,
                              { backgroundColor: C.brandDark, flex: 1.4 },
                              orderBusy === `${o.id}:accept` && { opacity: 0.7 },
                            ]}
                            onPress={() => orderAction(o.id, "accept", o.items || [])}
                            disabled={!!orderBusy}
                          >
                            <Text style={[st.actTxt, { fontSize: 12, textAlign: "center" }]}>
                              {orderBusy === `${o.id}:accept`
                                ? "..."
                                : rejN > 0
                                ? "Tanlanganlar bo'yicha tasdiqlash"
                                : "Tasdiqlash (hammasi qabul)"}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              st.actBtn,
                              { backgroundColor: C.error, flex: 1 },
                              orderBusy === `${o.id}:reject` && { opacity: 0.7 },
                            ]}
                            onPress={() => openRejectAllModal(o.id)}
                            disabled={!!orderBusy}
                          >
                            <Text style={[st.actTxt, { fontSize: 12, textAlign: "center" }]}>
                              {orderBusy === `${o.id}:reject` ? "..." : "Hammasini rad etish"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    );
                  })()}
                </View>
              );
            })}
          </>
        )}

        {/* ——— BUYURTMALAR TARIXI ——— */}
        {tab === "orders" && (
          <>
            <View style={st.infoNote}>
              <Ionicons name="shield-checkmark" size={16} color={C.onBrandSoft} />
              <Text style={st.infoNoteTxt}>
                Oldingi / tasdiqlangan buyurtmalar tarixi. Maxfiylik: xaridor ma'lumotlari ko'rsatilmaydi.
              </Text>
            </View>
            {loading && historyOrders.length === 0 && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.brandDark} />
              </View>
            )}
            {!loading && historyOrders.length === 0 && (
              <Text style={st.empty}>Tarixda buyurtma yo'q</Text>
            )}
            {historyOrders.map((o) => {
              const payout = getOrderPayout(o);
              const paymentConfirmed = !!(
                o.seller_payment_received_at ||
                o.seller_payment_confirmed ||
                o.payment_received_by_seller
              );
              const expanded = expandedHistoryId === o.id;
              return (
                <View key={o.id} style={st.orderCard}>
                  <Pressable
                    onPress={() => setExpandedHistoryId(expanded ? null : o.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontWeight: "900", color: C.onSurface, fontSize: 15 }}>
                          {o.number}
                        </Text>
                        <View style={[st.badge, { backgroundColor: C.tertiary }]}>
                          <Text style={[st.badgeTxt, { color: C.onTertiary }]}>
                            {STATUS_LABEL[o.status]}
                          </Text>
                        </View>
                      </View>
                      <Text style={st.orderMeta}>
                        {o.delivery_method === "pickup"
                          ? "🏪 O'zi olib ketadi"
                          : "🛵 Kuryer"}
                        {o.created_at ? ` • ${new Date(o.created_at).toLocaleString()}` : ""}
                      </Text>
                      {!expanded && (
                        <Text style={{ fontWeight: "800", color: C.brandDark, marginTop: 4, fontSize: 13 }}>
                          Daromad: {fmt(o.status === "delivered" ? payout.net : (o.earn_total || 0))}
                          {(o.items || []).length ? ` • ${(o.items || []).length} ta mahsulot` : ""}
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={C.muted}
                    />
                  </Pressable>

                  {expanded && (
                    <View style={{ marginTop: S.sm }}>
                      {(o.items || []).map((i: any, idx: number) => {
                        const isKg = isOrderItemKg(i);
                        const draft = (kgExtraDraft[o.id] || {})[idx] || { extra_qty: "", extra_price: "" };
                        return (
                          <View key={idx} style={{ marginBottom: 8 }}>
                            <Text style={st.orderItem}>
                              • {ml(i.name, lang)} × {i.qty}
                              {isKg ? " kg" : ""} ={" "}
                              {fmt((i.earn ?? i.seller_price ?? i.price) * i.qty)}
                              {i.extra_qty ? ` +${i.extra_qty} kg ortiqcha` : ""}
                            </Text>
                            {i.extra_client_price != null && Number(i.extra_client_price) > 0 && (
                              <Text style={{ fontSize: 11, color: C.brandDark, fontWeight: "700", marginLeft: 8 }}>
                                Ortiqcha: {fmt(i.extra_seller_price || 0)}
                                {i.extra_markup_percent
                                  ? ` + ${i.extra_markup_percent}% = ${fmt(i.extra_client_price)}`
                                  : ""}
                              </Text>
                            )}
                            {o.status === "confirmed" && isKg && (
                              <View style={st.kgExtraBox}>
                                <Text style={st.kgExtraBoxTitle}>Ortiqcha og'irlik (kg)</Text>
                                <Text style={st.kgExtraBoxHint}>
                                  Buyurtmadan ortiq chiqsa — kg va narxni yozing
                                </Text>
                                <View style={st.kgExtraRow}>
                                  <View style={{ flex: 1, minWidth: 100 }}>
                                    <Text style={st.kgExtraLabel}>Ortiqcha (kg)</Text>
                                    <TextInput
                                      style={[st.input, st.kgExtraInput]}
                                      value={draft.extra_qty}
                                      onChangeText={(v) =>
                                        setKgExtraDraft((prev) => ({
                                          ...prev,
                                          [o.id]: {
                                            ...(prev[o.id] || {}),
                                            [idx]: { ...draft, extra_qty: v },
                                          },
                                        }))
                                      }
                                      placeholder="masalan: 0.2"
                                      placeholderTextColor={C.muted}
                                      keyboardType="decimal-pad"
                                    />
                                  </View>
                                  <View style={{ flex: 1, minWidth: 100 }}>
                                    <Text style={st.kgExtraLabel}>Ortiqcha narxi (so'm)</Text>
                                    <TextInput
                                      style={[st.input, st.kgExtraInput]}
                                      value={draft.extra_price}
                                      onChangeText={(v) =>
                                        setKgExtraDraft((prev) => ({
                                          ...prev,
                                          [o.id]: {
                                            ...(prev[o.id] || {}),
                                            [idx]: { ...draft, extra_price: v },
                                          },
                                        }))
                                      }
                                      placeholder="masalan: 5000"
                                      placeholderTextColor={C.muted}
                                      keyboardType="numeric"
                                    />
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                      {o.status === "confirmed" && !(o.items || []).some((it: any) => isOrderItemKg(it)) && (
                        <Text style={{ fontSize: 12, color: C.muted, marginTop: 6, fontStyle: "italic" }}>
                          Bu buyurtmada kg mahsulot yo'q — ortiqcha kg faqat kg bilan kiritilgan mahsulotlarda.
                        </Text>
                      )}
                      {o.status !== "delivered" && (
                        <Text style={{ fontWeight: "900", color: C.brandDark, marginTop: 4 }}>
                          Daromad: {fmt(o.earn_total)}
                        </Text>
                      )}
                      {paymentConfirmed && (
                        <View style={st.paidBadge}>
                          <Ionicons name="checkmark-circle" size={14} color={C.success} />
                          <Text style={st.paidBadgeTxt}>Pul olingan</Text>
                        </View>
                      )}
                      {o.status === "delivered" && (
                        <View style={st.payoutBox}>
                          <View style={st.payoutRow}>
                            <Text style={st.payoutLabel}>Jami (sof)</Text>
                            <Text style={st.payoutVal}>{fmt(payout.gross)}</Text>
                          </View>
                          {payout.returnedSum > 0 && (
                            <View style={st.payoutRow}>
                              <Text style={[st.payoutLabel, { color: C.error }]}>Qaytgan</Text>
                              <Text style={[st.payoutVal, { color: C.error }]}>
                                −{fmt(payout.returnedSum)}
                              </Text>
                            </View>
                          )}
                          <View style={[st.payoutRow, st.payoutRowTotal]}>
                            <Text style={st.payoutTotalLabel}>Olishingiz kerak</Text>
                            <Text style={st.payoutTotalVal}>{fmt(payout.net)}</Text>
                          </View>
                          {!paymentConfirmed && (
                            <Pressable
                              style={[st.actBtn, { backgroundColor: C.success, marginTop: 8 }]}
                              onPress={() => confirmPaymentReceived(o.id)}
                            >
                              <Text style={st.actTxt}>Pulni oldim</Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                        {o.status === "new" && (
                          <>
                            <Pressable
                              style={[st.actBtn, { backgroundColor: C.brandDark }]}
                              onPress={() => orderAction(o.id, "accept")}
                            >
                              <Text style={st.actTxt}>Qabul qilish</Text>
                            </Pressable>
                            <Pressable
                              style={[st.actBtn, { backgroundColor: C.error }]}
                              onPress={() => openRejectAllModal(o.id)}
                            >
                              <Text style={st.actTxt}>Rad etish</Text>
                            </Pressable>
                          </>
                        )}
                        {o.status === "confirmed" && (
                          <Pressable
                            style={[st.actBtn, { backgroundColor: C.inverse }]}
                            onPress={() => orderAction(o.id, "packed", o.items || [])}
                          >
                            <Text style={st.actTxt}>Yig'ildi ✓</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ========== EDIT MODAL ========== */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Mahsulotni tahrirlash</Text>
              <Pressable onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color={C.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {renderFormFields()}
            </ScrollView>
            <Pressable
              style={[st.saveBtn, { marginTop: S.md }, savingProduct && { opacity: 0.7 }]}
              onPress={saveProduct}
              disabled={savingProduct}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {savingProduct ? "Saqlanmoqda..." : "Saqlash"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ========== DELETE MODAL ========== */}
      <Modal visible={deleteModal} transparent animationType="fade" onRequestClose={() => setDeleteModal(false)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxWidth: 360 }]}>
            <View style={{ alignItems: "center", marginBottom: S.md }}>
              <View style={st.deleteIconWrap}>
                <Ionicons name="trash" size={28} color={C.error} />
              </View>
              <Text style={st.modalTitle}>Rostan o‘chirmoqchimisiz?</Text>
              <Text style={st.deleteSub}>
                “{deleteTarget ? ml(deleteTarget.name, lang) : ""}” butunlay o‘chiriladi.
                Bu amalni qaytarib bo‘lmaydi.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <Pressable
                style={[st.modalBtn, { backgroundColor: C.tertiary, flex: 1 }]}
                onPress={() => {
                  setDeleteModal(false);
                  setDeleteTarget(null);
                }}
              >
                <Text style={[st.modalBtnTxt, { color: C.onSurface }]}>Bekor qilish</Text>
              </Pressable>
              <Pressable
                style={[st.modalBtn, { backgroundColor: C.error, flex: 1 }]}
                onPress={confirmDelete}
              >
                <Text style={st.modalBtnTxt}>Ha, o‘chirish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== REJECT ALL CONFIRM ========== */}
      <Modal
        visible={!!rejectAllOrderId}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRejectAllOrderId(null);
          setRejectPhrase("");
        }}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxWidth: 400 }]}>
            <Text style={st.modalTitle}>Hammasini rad etish</Text>
            <Text style={st.deleteSub}>
              Bu buyurtmadagi barcha mahsulotlar rad etiladi. Tasdiqlash uchun{" "}
              <Text style={{ fontWeight: "900", color: C.error }}>rad etish</Text> deb yozing.
            </Text>
            <TextInput
              testID="seller-reject-all-phrase"
              style={[st.input, { marginTop: S.md }]}
              value={rejectPhrase}
              onChangeText={setRejectPhrase}
              placeholder="rad etish"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
              <Pressable
                style={[
                  st.modalBtn,
                  {
                    backgroundColor: canConfirmRejectAll ? C.error : "#FECACA",
                    flex: 1,
                    opacity: orderBusy ? 0.7 : 1,
                  },
                ]}
                onPress={confirmRejectAll}
                disabled={!canConfirmRejectAll || !!orderBusy}
              >
                <Text style={st.modalBtnTxt}>
                  {orderBusy ? "..." : "Rad etish"}
                </Text>
              </Pressable>
              <Pressable
                style={[st.modalBtn, { backgroundColor: C.tertiary, flex: 1 }]}
                onPress={() => {
                  setRejectAllOrderId(null);
                  setRejectPhrase("");
                }}
              >
                <Text style={[st.modalBtnTxt, { color: C.onSurface }]}>Bekor qilish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2, fontWeight: "600" },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF2F2",
    padding: S.md,
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  confirmTxt: { color: C.onSurface, fontWeight: "700", fontSize: 13, flex: 1 },
  miniBtn: {
    borderRadius: R.sm,
    paddingHorizontal: S.md,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  tabRow: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: S.md,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.brandDark },
  tabTxt: { fontWeight: "700", fontSize: 13, color: C.muted },
  msg: {
    color: C.brandDark,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    marginTop: S.sm,
  },
  infoNote: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: S.md,
    marginTop: S.md,
    alignItems: "flex-start",
  },
  infoNoteTxt: { color: C.onBrandSoft, fontSize: 12, flex: 1, lineHeight: 17 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: {
    flexBasis: "30%",
    flexGrow: 1,
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: R.sm,
    backgroundColor: C.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  statVal: { fontSize: 16, fontWeight: "900", color: C.onSurface },
  statLabel: { fontSize: 11, color: C.muted, fontWeight: "600" },
  secTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.onSurface,
    marginTop: S.xl,
    marginBottom: S.md,
  },
  lowAlertCard: {
    marginTop: S.xl,
    backgroundColor: "#FFF7ED",
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: "#FDBA74",
    overflow: "hidden",
  },
  lowAlertTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: S.md,
    paddingVertical: 14,
    backgroundColor: "#FFEDD5",
    borderBottomWidth: 1,
    borderBottomColor: "#FED7AA",
  },
  lowAlertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: 1.5,
    borderColor: "#FB923C",
    alignItems: "center",
    justifyContent: "center",
  },
  lowAlertTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#9A3412",
  },
  lowAlertSub: {
    fontSize: 12,
    color: "#C2410C",
    fontWeight: "600",
    marginTop: 2,
  },
  lowAlertBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EA580C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  lowAlertBadgeTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  lowAlertItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FED7AA",
    backgroundColor: "#FFFBEB",
  },
  lowAlertImg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFEDD5",
  },
  lowAlertImgEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  lowAlertName: {
    fontSize: 14,
    fontWeight: "800",
    color: C.onSurface,
  },
  lowAlertMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  lowAlertStockPill: {
    backgroundColor: "#FEE2E2",
    borderRadius: R.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lowAlertStockTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: "#DC2626",
  },
  lowAlertHint: {
    fontSize: 11,
    color: "#9A3412",
    fontWeight: "600",
  },
  lowAlertEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EA580C",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
  },
  lowAlertEditTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.card,
    borderRadius: R.sm,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  topRank: { fontWeight: "900", color: C.brandDark, fontSize: 14 },
  topName: { flex: 1, fontWeight: "700", fontSize: 13, color: C.onSurface },
  topMeta: { fontSize: 11, color: C.muted },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.brandDark,
    borderRadius: R.md,
    height: 48,
    marginBottom: S.md,
  },
  form: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.md,
    gap: S.sm,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.onTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  imgThumbWrap: { width: 64, height: 64, borderRadius: R.sm, overflow: "visible" },
  imgThumb: { width: 64, height: 64, borderRadius: R.sm, backgroundColor: C.tertiary },
  imgRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.card,
  },
  imgAddBtn: {
    width: 64,
    height: 64,
    borderRadius: R.sm,
    backgroundColor: C.brandTint,
    borderWidth: 1.5,
    borderColor: C.brand,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  imgAddTxt: { fontSize: 8, color: C.brandDark, fontWeight: "800" },
  similarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.brandDark,
    borderRadius: R.sm,
    paddingVertical: 10,
    paddingHorizontal: S.md,
  },
  similarBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  similarErr: { color: C.error, fontSize: 12, fontWeight: "600", marginTop: 6 },
  similarBox: {
    marginTop: S.sm,
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.sm,
    gap: 6,
  },
  similarTitle: { fontSize: 13, fontWeight: "900", color: C.onSurface, marginBottom: 4 },
  similarRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 4 },
  similarThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.tertiary },
  similarName: { fontSize: 13, fontWeight: "700", color: C.onSurface },
  similarMeta: { fontSize: 11, color: C.muted, marginTop: 1 },
  input: {
    backgroundColor: C.surface,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    color: C.onSurface,
    fontSize: 13,
    minWidth: 0,
  },
  formRow: { flexDirection: "row", gap: S.sm },
  formRowStack: { flexDirection: "column" },
  formInput: { flex: 1, minWidth: 0 },
  formInputFull: { width: "100%", flexBasis: "100%" },
  chip: {
    height: 34,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  chipTxt: { fontSize: 12, fontWeight: "600", color: C.onTertiary },
  saveBtn: {
    backgroundColor: C.inverse,
    borderRadius: R.sm,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  prodRow: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  prodTopRow: { flexDirection: "row", gap: S.md, alignItems: "center" },
  prodImg: {
    width: 64,
    height: 64,
    borderRadius: R.md,
    backgroundColor: C.tertiary,
  },
  prodName: { fontWeight: "700", fontSize: 14, color: C.onSurface },
  prodMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  badge: { borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 10, fontWeight: "800" },
  prodActionsPanel: {
    flexDirection: "row",
    gap: S.sm,
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexWrap: "wrap",
  },
  prodActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 96,
    height: 38,
    borderRadius: R.sm,
    paddingHorizontal: S.md,
    backgroundColor: C.tertiary,
  },
  prodActionBtnDanger: { backgroundColor: "#FEF2F2" },
  prodActionTxt: { fontSize: 12, fontWeight: "800", color: C.onSurface },
  empty: { color: C.muted, fontSize: 13, marginTop: S.md, textAlign: "center" },
  orderCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  orderMeta: { fontSize: 12, color: C.onTertiary, marginTop: 4 },
  orderItem: { fontSize: 12, color: C.muted, marginTop: 3 },
  payoutBox: {
    marginTop: S.sm,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.brandTint,
    borderWidth: 1,
    borderColor: C.brandSoft,
    gap: 6,
  },
  payoutTitle: { fontSize: 12, fontWeight: "900", color: C.onBrandSoft },
  payoutRow: { flexDirection: "row", justifyContent: "space-between" },
  payoutRowTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  payoutLabel: { fontSize: 12, color: C.onTertiary, fontWeight: "600" },
  payoutVal: { fontSize: 12, color: C.onSurface, fontWeight: "800" },
  payoutTotalLabel: { fontSize: 13, color: C.onSurface, fontWeight: "900" },
  payoutTotalVal: { fontSize: 15, color: C.brandDark, fontWeight: "900" },
  actBtn: {
    flex: 1,
    borderRadius: R.sm,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  locCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    borderWidth: 1.5,
    borderColor: C.brand,
    marginBottom: S.md,
    flexWrap: "wrap",
  },
  locIconBox: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  locTitle: { fontWeight: "900", fontSize: 14, color: C.onSurface },
  locSub: { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: "600" },
  locBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.brandDark,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    height: 40,
  },
  locBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: S.lg,
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.lg,
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: S.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.onSurface,
    textAlign: "center",
  },
  deleteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: S.sm,
  },
  deleteSub: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  modalBtn: {
    height: 44,
    borderRadius: R.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});