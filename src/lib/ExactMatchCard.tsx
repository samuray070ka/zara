import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { C, S, R, fmt } from "@/src/lib/theme";
import { pickProductImage, productName } from "@/src/lib/imageSearch";

type Props = {
  item: any;
  onPress?: (item: any) => void;
  onAddToCart?: (item: any) => void;
};

export default function ExactMatchCard({ item, onPress, onAddToCart }: Props) {
  const img = pickProductImage(item);
  const price = Number(item?.display_price ?? item?.effective_price ?? item?.price ?? 0);

  return (
    <Pressable onPress={() => onPress?.(item)} style={s.card}>
      <View style={s.badge}>
        <Text style={s.badgeText}>✓ 100% MOS</Text>
      </View>

      <View style={s.imgBox}>
        {img ? (
          <Image source={{ uri: img }} style={s.img} contentFit="contain" />
        ) : (
          <View style={[s.img, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="image-outline" size={40} color="#9CA3AF" />
          </View>
        )}
      </View>

      <View style={s.info}>
        <Text style={s.label}>Siz qidirgan mahsulot</Text>
        <Text style={s.name} numberOfLines={3}>
          {productName(item)}
        </Text>
        {price > 0 ? <Text style={s.price}>{fmt(price)}</Text> : null}
        {onAddToCart ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onAddToCart(item);
            }}
            style={s.btn}
          >
            <Text style={s.btnText}>Savatga qo'shish</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    marginTop: 22,
    marginBottom: 12,
    marginHorizontal: S.lg,
    padding: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#16a34a",
    backgroundColor: "#f0fdf4",
  },
  badge: {
    position: "absolute",
    top: -13,
    left: 18,
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 2,
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  imgBox: {
    width: 130,
    height: 130,
    borderRadius: 14,
    backgroundColor: "#fff",
    overflow: "hidden",
    marginRight: 16,
  },
  img: { width: "100%", height: "100%" },
  info: { flex: 1 },
  label: { fontSize: 12, color: "#15803d", fontWeight: "700", marginBottom: 4 },
  name: { fontSize: 17, fontWeight: "800", color: "#111827" },
  price: { fontSize: 18, fontWeight: "900", color: "#111827", marginTop: 8 },
  btn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#16a34a",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});