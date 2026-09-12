import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import zarramarketLogo from "../assets/images/zarramarket-logo.png";
import { storage } from "@/src/utils/storage";
import { C, S, R } from "@/src/lib/theme";
import { useLang, Lang } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { homeRouteFor } from "@/src/lib/roleRoute";

const LANGS: { code: Lang; label: string; sub: string; flag: string }[] = [
  { code: "uz", label: "O'zbekcha", sub: "O'zbek tili (lotin)", flag: "🇺🇿" },
  { code: "ru", label: "Русский", sub: "Русский язык", flag: "🇷🇺" },
  { code: "en", label: "English", sub: "English language", flag: "🇬🇧" },
];

export default function Index() {
  const router = useRouter();
  const { setLang, ready } = useLang();
  const { ready: authReady, user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || !authReady) return;
    storage.getItem("lang_chosen", "").then((v) => {
      if (v) router.replace(homeRouteFor(user) as any);
      else setShow(true);
    });
  }, [ready, authReady, user]);

  if (!show)
    return (
      <View style={[st.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );

  const choose = async (l: Lang) => {
    setLang(l);
    await storage.setItem("lang_chosen", "1");
    router.replace(homeRouteFor(user) as any);
  };

  return (
    <View style={st.root}>
      <LinearGradient colors={[C.inverse, "#064E3B"]} style={StyleSheet.absoluteFill} />
      <View style={st.center}>
        <Animated.View entering={FadeInUp.springify()} style={st.logoWrap}>
          <View style={st.logoBox}>
            <Image source={zarramarketLogo} style={st.logoImage} contentFit="contain" />
          </View>
          <Text style={st.logo}>ZarraMarket</Text>
          <Text style={st.tagline}>Onlayn marketplace • Онлайн маркетплейс • Online marketplace</Text>
        </Animated.View>
        <Text style={st.title}>Tilni tanlang / Выберите язык / Choose language</Text>
        {LANGS.map((l, i) => (
          <Animated.View key={l.code} entering={FadeInDown.delay(200 + i * 120).springify()} style={{ width: "100%", maxWidth: 420 }}>
            <Pressable testID={`lang-${l.code}-button`} style={st.langBtn} onPress={() => choose(l.code)}>
              <Text style={st.flag}>{l.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.langLabel}>{l.label}</Text>
                <Text style={st.langSub}>{l.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.brand} />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.inverse },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: S.xl },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoBox: { width: 88, height: 88, borderRadius: 24, backgroundColor: "rgba(16,185,129,0.15)", alignItems: "center", justifyContent: "center", marginBottom: S.lg, borderWidth: 1, borderColor: "rgba(16,185,129,0.4)", overflow: "hidden" },
  logoImage: { width: 72, height: 72 },
  logo: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  tagline: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 6, textAlign: "center" },
  title: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600", marginBottom: S.lg, textAlign: "center" },
  langBtn: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  flag: { fontSize: 28 },
  langLabel: { color: "#fff", fontSize: 17, fontWeight: "700" },
  langSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
});
