import { api } from "@/src/lib/api";

/**
 * Rasm orqali o'xshash mahsulotlarni qidirish.
 * Backend: POST /api/search/by-image  (multipart field: "image")
 * Javob: { items: Product[] } yoki Product[]
 */
export async function searchByImage(imageUri: string): Promise<any[]> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");

  const form = new FormData();

  if (imageUri.startsWith("data:")) {
    // base64 data URI (web / ImagePicker base64)
    const res = await fetch(imageUri);
    const blob = await res.blob();
    const ext = blob.type?.includes("png") ? "png" : "jpg";
    form.append("image", blob, `search.${ext}`);
  } else {
    // native file uri (file:// or content://)
    const name = imageUri.split("/").pop() || "search.jpg";
    const match = /\.(\w+)$/.exec(name);
    const ext = (match?.[1] || "jpg").toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : "image/jpeg";
    form.append("image", {
      uri: imageUri,
      name: name.includes(".") ? name : `search.${ext}`,
      type,
    } as any);
  }

  const data = await api("/search/by-image", {
    method: "POST",
    formData: form,
  });

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

/**
 * ImagePicker natijasidan qidiruv uchun URI olish (base64 afzal).
 */
export function pickerAssetToUri(asset: {
  uri?: string;
  base64?: string | null;
  mimeType?: string | null;
}): string {
  if (asset.base64) {
    const mime = asset.mimeType || "image/jpeg";
    return `data:${mime};base64,${asset.base64}`;
  }
  return asset.uri || "";
}

/** Faqat joriy sotuvchi mahsulotlari orasidan rasm qidiruv */
export async function searchOwnProductsByImage(imageUri: string): Promise<any[]> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");
  const form = new FormData();
  if (imageUri.startsWith("data:")) {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    const ext = blob.type?.includes("png") ? "png" : "jpg";
    form.append("image", blob, `search.${ext}`);
  } else {
    const name = imageUri.split("/").pop() || "search.jpg";
    const match = /\.(\w+)$/.exec(name);
    const ext = (match?.[1] || "jpg").toLowerCase();
    const type =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    form.append("image", {
      uri: imageUri,
      name: name.includes(".") ? name : `search.${ext}`,
      type,
    } as any);
  }
  const data = await api("/seller/search/by-image", {
    method: "POST",
    formData: form,
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}