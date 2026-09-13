import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S, R } from "@/src/lib/theme";
import { useLang } from "@/src/lib/i18n";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";
import { homeRouteFor } from "@/src/lib/roleRoute";

export default function Auth() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLang();
  const { login } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("+998");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [exists, setExists] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressText, setAddressText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sendOtp = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await api("/auth/send-otp", { method: "POST", body: { phone } });
      setDemoCode(res.demo_code);
      setExists(res.exists);
      setStep(2);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const verify = async () => {
    setErr("");
    if (!exists && !firstName.trim()) {
      setErr(t("firstName") + "?");
      return;
    }
    setLoading(true);
    try {
      const res = await api("/auth/verify-otp", {
        method: "POST",
        body: {
          phone,
          code,
          first_name: firstName,
          last_name: lastName,
          language: lang,
          address_text: addressText.trim() || null,
        },
      });
      await login(res.token, res.user);
      const dest = homeRouteFor(res.user);
      if (dest !== "/(tabs)/home") {
        router.replace(dest as any);
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  /** Input fokusganda ScrollView ni pastga scroll qilib, input klaviatura ustida qoladi */
  const scrollToInput = (yOffset = 120) => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 100);
  };

  return (
    <View style={[st.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={st.header}>
        <Pressable testID="auth-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={st.headerTitle}>{t("login")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[st.body, { paddingBottom: 48 + Math.max(insets.bottom, 8) }]}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={st.inner}>
              <Animated.View entering={FadeInDown.springify()} style={st.iconBox}>
                <Ionicons name={step === 1 ? "call" : "chatbubble-ellipses"} size={34} color={C.brandDark} />
              </Animated.View>
              {step === 1 ? (
                <>
                  <Text style={st.title}>{t("loginTitle")}</Text>
                  <Text style={st.sub}>SMS orqali tasdiqlash kodi yuboriladi. Parol kerak emas.</Text>
                  <Pressable
                    style={{ width: "100%" }}
                    onPress={() => phoneInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={phoneInputRef}
                      testID="auth-phone-input"
                      style={st.input}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      placeholder="+998 90 123 45 67"
                      placeholderTextColor={C.muted}
                      onFocus={() => scrollToInput(80)}
                      returnKeyType="done"
                      blurOnSubmit
                      autoFocus
                      showSoftInputOnFocus
                    />
                  </Pressable>
                  {!!err && (
                    <Text testID="auth-error-text" style={st.err}>
                      {err}
                    </Text>
                  )}
                  <Pressable
                    testID="auth-send-otp-button"
                    style={[st.btn, loading && { opacity: 0.6 }]}
                    onPress={sendOtp}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t("sendCode")}</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={st.title}>{t("enterCode")}</Text>
                  <Text style={st.sub}>{phone}</Text>
                  <View style={st.demoBox}>
                    <Ionicons name="information-circle" size={18} color={C.onBrandSoft} />
                    <Text style={st.demoTxt}>
                      DEMO rejim — sizning kodingiz:{" "}
                      <Text testID="auth-demo-code" style={{ fontWeight: "900" }}>
                        {demoCode}
                      </Text>
                    </Text>
                  </View>
                  <TextInput
                    testID="auth-code-input"
                    style={[st.input, { textAlign: "center", letterSpacing: 8, fontSize: 22, fontWeight: "800" }]}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="••••••"
                    placeholderTextColor={C.muted}
                    onFocus={() => scrollToInput(160)}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                  {!exists && (
                    <>
                      <TextInput
                        testID="auth-firstname-input"
                        style={st.input}
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder={t("firstName")}
                        placeholderTextColor={C.muted}
                        onFocus={() => scrollToInput(220)}
                      />
                      <TextInput
                        testID="auth-lastname-input"
                        style={st.input}
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder={t("lastName")}
                        placeholderTextColor={C.muted}
                        onFocus={() => scrollToInput(280)}
                      />
                      <TextInput
                        testID="auth-address-input"
                        style={st.input}
                        value={addressText}
                        onChangeText={setAddressText}
                        placeholder="Ixtiyoriy: taxminiy manzil"
                        placeholderTextColor={C.muted}
                        onFocus={() => scrollToInput(340)}
                      />
                    </>
                  )}
                  {!!err && (
                    <Text testID="auth-error-text" style={st.err}>
                      {err}
                    </Text>
                  )}
                  <Pressable
                    testID="auth-verify-button"
                    style={[st.btn, loading && { opacity: 0.6 }]}
                    onPress={verify}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t("confirm")}</Text>}
                  </Pressable>
                  <Pressable testID="auth-change-phone-button" onPress={() => setStep(1)}>
                    <Text style={st.link}>Raqamni o'zgartirish</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
      </KeyboardAvoidingView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.onSurface },
  body: { flexGrow: 1, justifyContent: "center", padding: S.xl },
  inner: { width: "100%", maxWidth: 420, alignSelf: "center", alignItems: "center" },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: S.lg,
  },
  title: { fontSize: 22, fontWeight: "900", color: C.onSurface, textAlign: "center" },
  sub: { fontSize: 13, color: C.muted, marginTop: 6, marginBottom: S.xl, textAlign: "center" },
  input: {
    width: "100%",
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    fontSize: 16,
    color: C.onSurface,
    marginBottom: S.md,
  },
  btn: {
    width: "100%",
    backgroundColor: C.brandDark,
    borderRadius: R.md,
    padding: S.lg,
    alignItems: "center",
    marginTop: S.sm,
    minHeight: 52,
  },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  err: { color: C.error, fontSize: 13, marginBottom: S.sm, alignSelf: "flex-start" },
  demoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.brandSoft,
    borderRadius: R.md,
    padding: S.md,
    marginBottom: S.lg,
    width: "100%",
  },
  demoTxt: { color: C.onBrandSoft, fontSize: 14, flex: 1 },
  link: { color: C.brandDark, fontWeight: "700", marginTop: S.lg, fontSize: 14 },
});