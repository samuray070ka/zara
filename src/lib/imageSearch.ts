import { api } from "@/src/lib/api";

const MAX_DIST = 0.1;
const PAGE_SIZE = 50;
const MAX_PAGES = 3; // max ~150 mahsulot
const MAX_COMPARE = 80;
const CONCURRENCY = 12;
const BACKEND_TIMEOUT_MS = 2500;

/** Rasm URL → feature kesh (sessiya davomida) */
const featCache = new Map<string, number[] | null>();

function distFeatures(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 1e9;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    const w = i < 3 ? 2.5 : 1;
    s += w * d * d;
  }
  return Math.sqrt(s / n);
}

function loadHtmlImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!uri.startsWith("data:")) img.crossOrigin = "anonymous";
    const t = setTimeout(() => reject(new Error("img timeout")), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error("img fail"));
    };
    img.src = uri;
  });
}

/** Tez feature: 16x16 + 4x4 grid */
async function extractFeatures(uri: string): Promise<number[] | null> {
  if (!uri) return null;
  if (featCache.has(uri)) return featCache.get(uri) || null;
  if (typeof document === "undefined") {
    featCache.set(uri, null);
    return null;
  }
  try {
    const img = await loadHtmlImage(uri);
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      featCache.set(uri, null);
      return null;
    }
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let ar = 0,
      ag = 0,
      ab = 0,
      n = 0;
    for (let i = 0; i < data.length; i += 4) {
      ar += data[i];
      ag += data[i + 1];
      ab += data[i + 2];
      n++;
    }
    ar /= n * 255;
    ag /= n * 255;
    ab /= n * 255;

    const g = 4;
    const step = size / g;
    const grid: number[] = [];
    for (let gy = 0; gy < g; gy++) {
      for (let gx = 0; gx < g; gx++) {
        let r = 0,
          gs = 0,
          b = 0,
          c = 0;
        const x0 = (gx * step) | 0;
        const y0 = (gy * step) | 0;
        const x1 = ((gx + 1) * step) | 0;
        const y1 = ((gy + 1) * step) | 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * size + x) * 4;
            r += data[idx];
            gs += data[idx + 1];
            b += data[idx + 2];
            c++;
          }
        }
        grid.push(r / (c * 255), gs / (c * 255), b / (c * 255));
      }
    }

    const hist = new Array(12).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      hist[Math.min(3, (data[i] * 4) >> 8)]++;
      hist[4 + Math.min(3, (data[i + 1] * 4) >> 8)]++;
      hist[8 + Math.min(3, (data[i + 2] * 4) >> 8)]++;
    }
    for (let i = 0; i < 12; i++) hist[i] /= n;

    const feat = [ar, ag, ab, ...grid, ...hist];
    featCache.set(uri, feat);
    return feat;
  } catch {
    featCache.set(uri, null);
    return null;
  }
}

function pickProductImage(p: any): string {
  if (!p) return "";
  const arr = Array.isArray(p.images) ? p.images : [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim().length > 8) return x.trim();
    if (x && typeof x === "object") {
      const u = String(x.url || x.src || x.uri || "").trim();
      if (u.length > 8) return u;
    }
  }
  for (const k of ["image", "preview_image", "main_image", "thumbnail"]) {
    const v = p[k];
    if (typeof v === "string" && v.trim().length > 8) return v.trim();
  }
  return "";
}

async function loadCatalogFast(): Promise<any[]> {
  const skips = Array.from({ length: MAX_PAGES }, (_, i) => i * PAGE_SIZE);
  const pages = await Promise.all(
    skips.map((skip) =>
      api(`/products?sort=mix&limit=${PAGE_SIZE}&skip=${skip}`).catch(() => ({
        items: [],
      }))
    )
  );
  const seen = new Set<string>();
  const all: any[] = [];
  for (const r of pages) {
    const items = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
    for (const p of items) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      all.push(p);
    }
  }
  return all;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        const r = await fn(items[idx]);
        if (r != null) out.push(r);
      } catch {}
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length || 1) }, () => worker())
  );
  return out;
}

async function visualSearchLocal(
  imageUri: string,
  products: any[],
  opts?: { earlyStop?: boolean }
): Promise<any[]> {
  const queryFeat = await extractFeatures(imageUri);
  if (!queryFeat) return [];

  const withImg = products
    .map((p) => ({ p, img: pickProductImage(p) }))
    .filter((x) => !!x.img)
    .slice(0, MAX_COMPARE);

  const scored = await mapPool(withImg, CONCURRENCY, async ({ p, img }) => {
    const feat = await extractFeatures(img);
    if (!feat) return null;
    const d = distFeatures(queryFeat, feat);
    if (d > MAX_DIST) return null;
    return { d, p };
  });

  scored.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const items: any[] = [];
  for (const { d, p } of scored) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({ ...p, match_dist: Math.round(d * 10000) / 10000 });
    if (opts?.earlyStop && d < 0.04 && items.length >= 1) break;
    if (items.length >= 8) break;
  }
  return items;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function backendSearch(imageUri: string): Promise<any[] | null> {
  try {
    const form = new FormData();
    if (imageUri.startsWith("data:")) {
      const res = await fetch(imageUri);
      const blob = await res.blob();
      form.append(
        "image",
        blob,
        blob.type?.includes("png") ? "search.png" : "search.jpg"
      );
    } else {
      const name = imageUri.split("/").pop() || "search.jpg";
      const match = /\.(\w+)$/.exec(name);
      const ext = (match?.[1] || "jpg").toLowerCase();
      form.append("image", {
        uri: imageUri,
        name: name.includes(".") ? name : `search.${ext}`,
        type:
          ext === "png"
            ? "image/png"
            : ext === "webp"
            ? "image/webp"
            : "image/jpeg",
      } as any);
    }
    const data = await withTimeout(
      api("/search/by-image", { method: "POST", formData: form }),
      BACKEND_TIMEOUT_MS
    );
    if (data?.fallback === true) return [];
    if (typeof data?.best_dist === "number" && data.best_dist > MAX_DIST) {
      return [];
    }
    let items: any[] = [];
    if (Array.isArray(data)) items = data;
    else if (Array.isArray(data?.items)) items = data.items;
    else if (Array.isArray(data?.products)) items = data.products;
    else if (Array.isArray(data?.results)) items = data.results;
    items = items.filter((p) => {
      const d = p?.match_dist;
      if (typeof d === "number") return d <= MAX_DIST;
      return true;
    });
    return items;
  } catch {
    return null;
  }
}

export async function searchByImage(imageUri: string): Promise<any[]> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");

  const backendItems = await backendSearch(imageUri);
  if (backendItems && backendItems.length) {
    try {
      const refined = await visualSearchLocal(imageUri, backendItems, {
        earlyStop: true,
      });
      if (refined.length) return refined;
      return backendItems.slice(0, 2);
    } catch {
      return backendItems.slice(0, 3);
    }
  }

  try {
    const catalog = await loadCatalogFast();
    return await visualSearchLocal(imageUri, catalog, { earlyStop: true });
  } catch (e) {
    console.warn("client visual:", e);
    return [];
  }
}

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

export async function searchOwnProductsByImage(
  imageUri: string
): Promise<any[]> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");
  try {
    const r = await api("/seller/products");
    const mine = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : [];
    if (!mine.length) return [];
    return await visualSearchLocal(imageUri, mine, { earlyStop: true });
  } catch (e) {
    console.warn("seller visual:", e);
    return [];
  }
}