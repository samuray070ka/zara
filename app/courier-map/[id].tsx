import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { C, S, R, fmt } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

// Builds a self-contained HTML page: OpenStreetMap tiles + Leaflet (both free,
// no API key) for the map, and the public OSRM demo routing server (also free,
// no API key) for the turn-by-turn driving route — a lightweight Yandex-Maps-
// style "point A -> point B" directions view that runs entirely inside a WebView.
function buildMapHtml(shop: { lat: number; lng: number; name: string }, dest: { lat: number; lng: number; label: string }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
    .panel { position: absolute; left: 8px; right: 8px; bottom: 8px; background: #fff; border-radius: 14px; box-shadow: 0 4px 18px rgba(0,0,0,0.18); padding: 10px 14px; z-index: 1000; max-height: 40%; overflow-y: auto; }
    .panel h4 { margin: 0 0 4px; font-size: 13px; color: #111827; }
    .metaRow { display:flex; gap: 10px; margin-bottom: 6px; }
    .pill { background:#ECFDF5; color:#065F46; font-weight:700; font-size:12px; padding: 3px 9px; border-radius: 999px; }
    .step { font-size: 12px; color:#374151; padding: 5px 0; border-bottom: 1px solid #F3F4F6; }
    .step:last-child { border-bottom: none; }
    .loading { position:absolute; top:8px; left:8px; background:#fff; padding:6px 10px; border-radius:10px; font-size:12px; color:#059669; font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,0.12); }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="loading" id="loading">Yo'nalish hisoblanmoqda...</div>
  <div class="panel" id="panel" style="display:none">
    <div class="metaRow">
      <span class="pill" id="dist"></span>
      <span class="pill" id="dur"></span>
    </div>
    <h4>Yo'nalish</h4>
    <div id="steps"></div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var shop = { lat: ${shop.lat}, lng: ${shop.lng} };
    var dest = { lat: ${dest.lat}, lng: ${dest.lng} };
    var map = L.map('map', { zoomControl: true }).setView([shop.lat, shop.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var greenIcon = L.divIcon({ className: '', html: '<div style="background:#059669;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #059669"></div>', iconSize: [16,16] });
    var redIcon = L.divIcon({ className: '', html: '<div style="background:#DC2626;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #DC2626"></div>', iconSize: [16,16] });

    L.marker([shop.lat, shop.lng], { icon: greenIcon }).addTo(map).bindPopup(${JSON.stringify(shop.name)});
    L.marker([dest.lat, dest.lng], { icon: redIcon }).addTo(map).bindPopup(${JSON.stringify(dest.label)});

    var group = L.featureGroup([
      L.marker([shop.lat, shop.lng]), L.marker([dest.lat, dest.lng])
    ]);
    map.fitBounds(group.getBounds().pad(0.3));

    var url = 'https://router.project-osrm.org/route/v1/driving/' + shop.lng + ',' + shop.lat + ';' + dest.lng + ',' + dest.lat + '?overview=full&geometries=geojson&steps=true';

    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      document.getElementById('loading').style.display = 'none';
      if (!data.routes || !data.routes.length) {
        document.getElementById('panel').style.display = 'block';
        document.getElementById('steps').innerHTML = '<div class="step">Yo\\'nalishni hisoblab bo\\'lmadi. Quyidagi tugma orqali xarita ilovasida oching.</div>';
        return;
      }
      var route = data.routes[0];
      var coords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
      var line = L.polyline(coords, { color: '#059669', weight: 5, opacity: 0.85 }).addTo(map);
      map.fitBounds(line.getBounds().pad(0.15));

      var km = (route.distance / 1000).toFixed(1);
      var min = Math.round(route.duration / 60);
      document.getElementById('dist').innerText = km + ' km';
      document.getElementById('dur').innerText = '~' + min + ' daq';

      var stepsHtml = '';
      var steps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
      steps.forEach(function(s, i) {
        var name = s.name || '';
        var type = s.maneuver && s.maneuver.type;
        var text = '';
        if (type === 'depart') text = "Yo'lga chiqing" + (name ? ' — ' + name : '');
        else if (type === 'arrive') text = 'Manzilga yetib keldingiz';
        else if (type === 'turn') text = (s.maneuver.modifier || '') + ' tomonga buriling' + (name ? ' — ' + name : '');
        else if (type === 'roundabout') text = "Aylanma yo'ldan o'ting" + (name ? ' — ' + name : '');
        else text = "Davom eting" + (name ? ' — ' + name : '');
        var dist = s.distance ? Math.round(s.distance) + ' m' : '';
        stepsHtml += '<div class="step">' + (i + 1) + '. ' + text + (dist ? ' (' + dist + ')' : '') + '</div>';
      });
      document.getElementById('steps').innerHTML = stepsHtml || '<div class="step">Yo\\'nalish tayyor.</div>';
      document.getElementById('panel').style.display = 'block';
    }).catch(function() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('panel').style.display = 'block';
      document.getElementById('steps').innerHTML = '<div class="step">Internetga ulanishda muammo. Quyidagi tugma orqali xarita ilovasida oching.</div>';
    });
  </script>
</body>
</html>`;
}

export default function CourierMap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, available] = await Promise.all([
        api("/courier/my").catch(() => []),
        api("/courier/available").catch(() => []),
      ]);
      const found = [...mine, ...available].find((o: any) => o.id === id);
      setOrder(found || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const html = useMemo(() => {
    if (!order) return "";
    return buildMapHtml(
      { lat: order.shop_lat, lng: order.shop_lng, name: `🏪 ${order.shop_name || "Do'kon"}` },
      { lat: order.address_lat, lng: order.address_lng, label: "📍 Yetkazish manzili" }
    );
  }, [order]);

  const openExternal = () => {
    if (!order) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${order.shop_lat},${order.shop_lng}&destination=${order.address_lat},${order.address_lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://yandex.com/maps/?rtext=${order.shop_lat},${order.shop_lng}~${order.address_lat},${order.address_lng}&rtt=auto`);
    });
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Pressable testID="courier-map-back-button" onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>{order?.number || "Yo'nalish"}</Text>
          <Text style={st.headerSub}>{order?.shop_name} → yetkazish manzili</Text>
        </View>
      </View>

      {loading && !order && (
        <View style={st.center}>
          <ActivityIndicator color={C.brandDark} size="large" />
        </View>
      )}

      {!loading && !order && (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color={C.muted} />
          <Text style={{ color: C.muted, marginTop: S.sm }}>Buyurtma topilmadi</Text>
        </View>
      )}

      {order && (
        <>
          {Platform.OS === "web" ? (
            React.createElement("iframe", {
              srcDoc: html,
              style: { flex: 1, border: "none", width: "100%" },
              "data-testid": "courier-map-iframe",
            })
          ) : (
            <WebView
              testID="courier-map-webview"
              source={{ html }}
              style={{ flex: 1 }}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={st.center}>
                  <ActivityIndicator color={C.brandDark} size="large" />
                </View>
              )}
            />
          )}
          <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.bottomLabel}>Yetkazish haqi</Text>
              <Text style={st.bottomValue}>{fmt(order.delivery_fee || 15000)}</Text>
            </View>
            <Pressable testID="courier-map-open-external" style={st.navBtn} onPress={openExternal}>
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={st.navBtnTxt}>Navigatorda ochish</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.inverse },
  backBtn: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bottomBar: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, padding: S.lg },
  bottomLabel: { fontSize: 11, color: C.muted, fontWeight: "600" },
  bottomValue: { fontSize: 16, fontWeight: "900", color: C.brandDark },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.brandDark, borderRadius: R.md, paddingHorizontal: S.lg, height: 46 },
  navBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
