import { Platform } from "react-native";
import * as Location from "expo-location";

export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  // Web fallback: use the browser Geolocation API when running via `expo start --web`.
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Brauzeringiz lokatsiyani qo'llab-quvvatlamaydi"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          const msg =
            err.code === 1
              ? "Lokatsiyaga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering"
              : "Lokatsiyani aniqlab bo'lmadi. Qayta urinib ko'ring";
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  // Native (iOS/Android): use expo-location.
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("Telefoningizda lokatsiya (GPS) xizmati o'chirilgan. Uni yoqing va qayta urinib ko'ring");
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Lokatsiyaga ruxsat berilmadi. Ilova sozlamalaridan ruxsat bering");
  }

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    throw new Error("Lokatsiyani aniqlab bo'lmadi. Qayta urinib ko'ring");
  }
}

type Pt = { lat: number; lng: number };

export const directionsUrl = (from: Pt, to: Pt) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

export const pointUrl = (p: Pt) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

/**
 * Turns GPS coordinates into a human-readable address using the free
 * OpenStreetMap Nominatim reverse-geocoding API (no API key needed).
 * Best-effort only — returns null on any failure so callers can fall back
 * to showing raw coordinates instead of blocking the user.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 6000) : null;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=uz`,
      {
        headers: { "User-Agent": "UzMarket/1.0 (delivery-app)" },
        signal: controller?.signal,
      }
    );
    if (timeout) clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}
