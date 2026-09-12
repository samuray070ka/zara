import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";
import { getCurrentLocation, reverseGeocode } from "@/src/lib/geo";

export default function Addresses() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const { user, refresh } = useAuth();
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locMsg, setLocMsg] = useState("");

  const useMyLocation = async () => {
    setLocMsg("");
    setLocLoading(true);
    try {
      const loc = await getCurrentLocation();
      setCoords(loc);
      const readable = await reverseGeocode(loc.lat, loc.lng);
      if (readable) {
        setText(readable);
        setLocMsg("Lokatsiya aniqlandi, manzil avtomatik to'ldirildi ✓");
      } else {
        setLocMsg("Lokatsiya olindi ✓ (manzil matnini tekshiring)");
      }
    } catch (e: any) {
      setLocMsg(e.message);
    }
    setLocLoading(false);
  };

  const addAddr = async () => {
    if (!text.trim()) return;
    await api("/addresses", { method: "POST", body: { label: label || "Manzil", text, lat: coords?.lat ?? null, lng: coords?.lng ?? null } });
    setLabel("");
    setText("");
    setCoords(null);
    setLocMsg("");
    refresh();
  };

  const delAddr = async (id: string) => {
    await api(`/addresses/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="addresses-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{t("addresses")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, maxWidth: 700, width: "100%", alignSelf: "center" }}>
        {user?.addresses?.map((a: any) => (
          <View key={a.id} style={st.card}>
            <Ionicons name="location" size={20} color={C.brandDark} />
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{a.label}</Text>
              <Text style={st.txt}>{a.text}</Text>
            </View>
            <Pressable testID={`address-delete-${a.id}`} onPress={() => delAddr(a.id)}>
              <Ionicons name="trash-outline" size={20} color={C.error} />
            </Pressable>
          </View>
        ))}
        <Text style={st.secTitle}>Yangi manzil qo'shish</Text>
        <Pressable testID="address-get-location-button" style={[st.gpsBtn, locLoading && { opacity: 0.6 }]} onPress={useMyLocation} disabled={locLoading}>
          {locLoading ? <ActivityIndicator color={C.brandDark} size="small" /> : <Ionicons name="locate" size={18} color={C.brandDark} />}
          <Text style={st.gpsBtnTxt}>Joriy lokatsiyamni olish (GPS)</Text>
        </Pressable>
        {coords && (
          <View style={st.gpsCoordsBox}>
            <Ionicons name="location" size={14} color={C.success} />
            <Text testID="address-location-coords" style={st.gpsCoords}>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</Text>
          </View>
        )}
        {!!locMsg && <Text testID="address-location-msg" style={st.gpsMsg}>{locMsg}</Text>}
        <TextInput testID="address-label-input" style={st.input} value={label} onChangeText={setLabel} placeholder="Nomi (Uy, Ish...)" placeholderTextColor={C.muted} />
        <TextInput testID="address-text-input" style={st.input} value={text} onChangeText={setText} placeholder="Shahar, tuman, ko'cha, uy" placeholderTextColor={C.muted} />
        <Pressable testID="address-add-button" style={st.btn} onPress={addAddr}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Qo'shish</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: C.tertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900", color: C.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card, borderRadius: R.md, padding: S.lg, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  label: { fontWeight: "800", fontSize: 14, color: C.onSurface },
  txt: { fontSize: 12, color: C.muted, marginTop: 2 },
  secTitle: { fontSize: 15, fontWeight: "900", color: C.onSurface, marginTop: S.xl, marginBottom: S.sm },
  input: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, color: C.onSurface, marginBottom: S.sm },
  btn: { backgroundColor: C.brandDark, borderRadius: R.md, height: 48, alignItems: "center", justifyContent: "center" },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.brandTint, borderRadius: R.md, height: 46, marginBottom: S.sm, borderWidth: 1.5, borderColor: C.brandDark, borderStyle: "dashed" },
  gpsBtnTxt: { color: C.brandDark, fontWeight: "800", fontSize: 13 },
  gpsCoordsBox: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: S.sm },
  gpsCoords: { color: C.success, fontWeight: "700", fontSize: 12 },
  gpsMsg: { color: C.onTertiary, fontSize: 12, marginBottom: S.sm, fontWeight: "600" },
});
