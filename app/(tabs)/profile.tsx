import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang, Lang } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useLang();
  const { user, token, logout, refresh } = useAuth();
  const [shopName, setShopName] = useState("");
  const [applying, setApplying] = useState(false);
  const [showSellerForm, setShowSellerForm] = useState(false);
  const [showCourierForm, setShowCourierForm] = useState(false);
  const [courierZone, setCourierZone] = useState("");
  const [applyingCourier, setApplyingCourier] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  const applySeller = async () => {
    if (!shopName.trim()) return;
    setApplying(true);
    try {
      await api("/seller/apply", { method: "POST", body: { shop_name: shopName } });
      await refresh();
      setShowSellerForm(false);
      setMsg("Ariza yuborildi! Admin tasdiqlashini kuting.");
    } catch (e: any) {
      setMsg(e.message);
    }
    setApplying(false);
  };

  const applyCourier = async () => {
    setApplyingCourier(true);
    try {
      await api("/courier/apply", { method: "POST", body: { zone: courierZone || "Toshkent" } });
      await refresh();
      setShowCourierForm(false);
      router.replace("/courier");
    } catch (e: any) {
      setMsg(e.message);
    }
    setApplyingCourier(false);
  };

  const changeLang = async (l: Lang) => {
    setLang(l);
    if (token) await api("/auth/profile", { method: "PUT", body: { language: l } }).catch(() => {});
  };

  const DELETE_WORD = "o'chirish";
  const normalizedPhrase = deletePhrase.trim().toLowerCase().replace(/[''`´]/g, "'");
  const canConfirmDelete =
    normalizedPhrase === DELETE_WORD || normalizedPhrase === "ochirish";

  const doDelete = async () => {
    if (!canConfirmDelete || deleting) return;
    setDeleting(true);
    try {
      await api("/auth/account", { method: "DELETE" });
      await logout();
      setConfirmDelete(false);
      setDeletePhrase("");
      router.replace("/auth");
    } catch (e: any) {
      setMsg(e?.message || "O'chirishda xatolik");
    } finally {
      setDeleting(false);
    }
  };

  const MenuItem = ({ icon, label, onPress, danger, testID }: any) => (
    <Pressable testID={testID} style={st.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? C.error : C.brandDark} />
      <Text style={[st.menuTxt, danger && { color: C.error }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.borderStrong} />
    </Pressable>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.title}>{t("profile")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 800, width: "100%", alignSelf: "center", paddingBottom: S.xxl }}>
        {/* User card */}
        <View style={st.userCard}>
          <View style={st.avatar}>
            <Text style={st.avatarTxt}>{user ? user.first_name[0] : "?"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={st.userName}>{user ? `${user.first_name} ${user.last_name || ""}` : t("guest")}</Text>
            <Text style={st.userPhone}>{user?.phone || t("loginToBuy")}</Text>
          </View>
          {!token && (
            <Pressable testID="profile-login-button" style={st.loginBtn} onPress={() => router.push("/auth")}>
              <Text style={st.loginBtnTxt}>{t("login")}</Text>
            </Pressable>
          )}
        </View>

        {!!msg && <Text style={st.msg}>{msg}</Text>}

        {/* Language */}
        <Text style={st.sectionLabel}>{t("language")}</Text>
        <View style={st.langRow}>
          {(["uz", "ru", "en"] as Lang[]).map((l) => (
            <Pressable key={l} testID={`profile-lang-${l}`} style={[st.langChip, lang === l && st.langChipActive]} onPress={() => changeLang(l)}>
              <Text style={[st.langChipTxt, lang === l && { color: "#fff" }]}>{l === "uz" ? "O'zbekcha" : l === "ru" ? "Русский" : "English"}</Text>
            </Pressable>
          ))}
        </View>

        {token && (
          <>
            {/* Referral */}
            <View style={st.refCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="gift" size={20} color="#fff" />
                <Text style={st.refTitle}>{t("referral")}</Text>
              </View>
              <Text style={st.refSub}>Do'stingiz birinchi xarid qilsa — ikkalangizga ham promokod!</Text>
              <View style={st.refCodeBox}>
                <Text testID="profile-referral-code" style={st.refCode}>{user?.referral_code}</Text>
              </View>
            </View>

            <Text style={st.sectionLabel}>Mening bo'limlarim</Text>
            <View style={st.menuCard}>
              <MenuItem testID="profile-favorites" icon="heart-outline" label={t("favorites")} onPress={() => router.push("/favorites")} />
              <MenuItem testID="profile-addresses" icon="location-outline" label={t("addresses")} onPress={() => router.push("/addresses")} />
              <MenuItem testID="profile-notifications" icon="notifications-outline" label={t("notifications")} onPress={() => router.push("/notifications")} />
              <MenuItem testID="profile-support" icon="chatbubbles-outline" label={t("support") + " (Telegram)"} onPress={() => setMsg("Telegram: @uzmarket_support")} />
            </View>

            <Text style={st.sectionLabel}>Panellar</Text>
            <View style={st.menuCard}>
              {user?.seller_info?.approved && (
                <MenuItem testID="profile-seller-panel" icon="storefront-outline" label={t("sellerPanel")} onPress={() => router.push("/seller")} />
              )}
              {user?.seller_info && !user.seller_info.approved && !user.seller_info.rejected && (
                <View style={st.menuItem}>
                  <Ionicons name="hourglass-outline" size={20} color={C.warning} />
                  <Text style={st.menuTxt}>Sotuvchi arizasi ko'rib chiqilmoqda...</Text>
                </View>
              )}
              {!user?.seller_info && (
                <MenuItem testID="profile-become-seller" icon="storefront-outline" label={t("becomeSeller")} onPress={() => setShowSellerForm(!showSellerForm)} />
              )}
              {/* {user?.role === "courier" && <MenuItem testID="profile-courier-mode" icon="bicycle-outline" label={t("courierMode")} onPress={() => router.push("/courier")} />}
              {user?.role !== "courier" && user?.role !== "admin" && user?.role !== "moderator" && (
                <MenuItem testID="profile-become-courier" icon="bicycle-outline" label={t("becomeCourier")} onPress={() => setShowCourierForm(!showCourierForm)} />
              )} */}
              {(user?.role === "admin" || user?.role === "moderator") && (
                <MenuItem testID="profile-admin-panel" icon="shield-checkmark-outline" label={t("adminPanel")} onPress={() => router.push("/admin")} />
              )}
            </View>

            {showCourierForm && (
              <View style={st.sellerForm}>
                <TextInput testID="profile-courier-zone-input" style={st.input} value={courierZone} onChangeText={setCourierZone} placeholder="Zonangiz (masalan: Chilonzor)" placeholderTextColor={C.muted} />
                {/* <Pressable testID="profile-apply-courier-button" style={st.applyBtn} onPress={applyCourier} disabled={applyingCourier}>
                  {applyingCourier ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Kuryer bo'lish</Text>}
                </Pressable> */}
              </View>
            )}

            {showSellerForm && (
              <View style={st.sellerForm}>
                <TextInput testID="profile-shop-name-input" style={st.input} value={shopName} onChangeText={setShopName} placeholder="Do'kon nomi" placeholderTextColor={C.muted} />
                <Pressable testID="profile-apply-seller-button" style={st.applyBtn} onPress={applySeller} disabled={applying}>
                  {applying ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Ariza yuborish</Text>}
                </Pressable>
              </View>
            )}

            <View style={[st.menuCard, { marginTop: S.lg }]}>
              <MenuItem testID="profile-logout" icon="log-out-outline" label={t("logout")} onPress={logout} />
              <MenuItem testID="profile-delete-account" icon="trash-outline" label={t("deleteAccount")} danger onPress={() => setConfirmDelete(true)} />
            </View>

          </>
        )}
      </ScrollView>
      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmDelete(false);
          setDeletePhrase("");
        }}
      >
        <View style={st.deleteModalBackdrop}>
          <View style={st.deleteModalCard}>
            <Text style={st.deleteModalTitle}>Akkauntni o'chirish</Text>
            <Text style={st.deleteModalBody}>
              Bu amal qaytarilmaydi. Barcha ma'lumotlar o'chadi.{"\n"}Tasdiqlash uchun{" "}
              <Text style={{ fontWeight: "900", color: C.error }}>o'chirish</Text> deb yozing.
            </Text>
            <TextInput
              testID="profile-delete-phrase"
              style={st.deleteModalInput}
              value={deletePhrase}
              onChangeText={setDeletePhrase}
              placeholder="o'chirish"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
              <Pressable
                testID="profile-delete-confirm"
                style={[
                  st.applyBtn,
                  {
                    backgroundColor: canConfirmDelete ? C.error : "#FECACA",
                    flex: 1,
                    opacity: deleting ? 0.6 : 1,
                  },
                ]}
                onPress={doDelete}
                disabled={!canConfirmDelete || deleting}
              >
                <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }}>
                  {deleting ? "O'chirilmoqda..." : "O'chirish"}
                </Text>
              </Pressable>
              <Pressable
                testID="profile-delete-cancel"
                style={[st.applyBtn, { backgroundColor: C.tertiary, flex: 1 }]}
                onPress={() => {
                  setConfirmDelete(false);
                  setDeletePhrase("");
                }}
              >
                <Text style={{ color: C.onSurface, fontWeight: "800", textAlign: "center" }}>
                  {t("cancel")}
                </Text>
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
  header: { paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: "900", color: C.onSurface },
  userCard: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: C.border },
  avatar: { width: 56, height: 56, borderRadius: R.pill, backgroundColor: C.brandDark, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 22, fontWeight: "900" },
  userName: { fontSize: 17, fontWeight: "800", color: C.onSurface },
  userPhone: { fontSize: 13, color: C.muted, marginTop: 2 },
  loginBtn: { backgroundColor: C.brandDark, borderRadius: R.pill, paddingHorizontal: S.lg, paddingVertical: 10 },
  loginBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: C.muted, marginTop: S.xl, marginBottom: S.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  langRow: { flexDirection: "row", gap: S.sm },
  langChip: { flex: 1, height: 42, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  langChipActive: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  langChipTxt: { fontWeight: "700", fontSize: 13, color: C.onTertiary },
  refCard: { backgroundColor: C.inverse, borderRadius: R.lg, padding: S.lg, marginTop: S.xl },
  refTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  refSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 6 },
  refCodeBox: { backgroundColor: "rgba(16,185,129,0.15)", borderRadius: R.md, padding: S.md, marginTop: S.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.brand, alignItems: "center" },
  refCode: { color: C.brand, fontWeight: "900", fontSize: 20, letterSpacing: 3 },
  menuCard: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider, minHeight: 52 },
  menuTxt: { flex: 1, fontSize: 15, fontWeight: "600", color: C.onSurface },
  sellerForm: { marginTop: S.md, gap: S.sm },
  input: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, color: C.onSurface },
  applyBtn: { backgroundColor: C.brandDark, borderRadius: R.md, height: 46, alignItems: "center", justifyContent: "center" },

  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
  },
  deleteModalBody: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 21,
    marginBottom: 14,
  },
  deleteModalInput: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  confirmBox: { backgroundColor: "#FEF2F2", borderRadius: R.md, padding: S.lg, marginTop: S.md, borderWidth: 1, borderColor: "#FECACA" },
  msg: { color: C.brandDark, fontWeight: "700", marginTop: S.md, fontSize: 13 },
});