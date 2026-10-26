import { api } from "@/src/lib/api";

const PAGE_SIZE = 50;
const MAX_PAGES = 6;
const MAX_COMPARE = PAGE_SIZE * MAX_PAGES;
const CONCURRENCY = 20;
const BACKEND_TIMEOUT_MS = 3500;
const RELATED_TIMEOUT_MS = 2500;
const TOTAL_LIMIT = 24;
const MAX_EXACT = 3;

const EXACT_HAM = 0.12;
const EXACT_COLOR = 0.08;
const DIST_FOR_50 = 0.28;
const MIN_PERCENT = 50;
const ANCHOR_MIN_PCT = 80;
const SIMILAR_MIN_PCT = 70;

type Feat = { color: number[]; hash: number[] };
type Scored = { d: number; ham: number; pct: number; exact: boolean; p: any };

const featCache = new Map<string, Feat | null>();

function distToPercent(dist: number): number {
  if (!Number.isFinite(dist) || dist < 0) return 0;
  if (dist <= 0.02) return 100;
  const pct = 100 - ((dist - 0.02) / (DIST_FOR_50 - 0.02)) * 50;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function distFeatures(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 1e9;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    const w = i < 3 ? 2.2 : 1;
    s += w * d * d;
  }
  return Math.sqrt(s / n);
}

function compareFeat(q: Feat, f: Feat) {
  const d = distFeatures(q.color, f.color);
  const L = Math.min(q.hash.length, f.hash.length);
  let diff = 0;
  for (let i = 0; i < L; i++) if (q.hash[i] !== f.hash[i]) diff++;
  const ham = L ? diff / L : 1;
  const exact = ham <= EXACT_HAM && d <= EXACT_COLOR;
  const pct = exact ? 100 : Math.min(94, distToPercent(d + ham * 0.15));
  return { d, ham, exact, pct };
}

function loadHtmlImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!uri.startsWith("data:") && !uri.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    const t = setTimeout(() => reject(new Error("img timeout")), 3500);
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

const SIZE = 32;

function cellGrid(gray: Float32Array, cols: number, rows: number): number[] {
  const out: number[] = [];
  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor((cy * SIZE) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * SIZE) / rows));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * SIZE) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * SIZE) / cols));
      let s = 0;
      let c = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          s += gray[y * SIZE + x];
          c++;
        }
      }
      out.push(c ? s / c : 0);
    }
  }
  return out;
}

function dHash(gray: Float32Array): number[] {
  const bits: number[] = [];
  const h = cellGrid(gray, 9, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits.push(h[y * 9 + x] > h[y * 9 + x + 1] ? 1 : 0);
  }
  const v = cellGrid(gray, 8, 9);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits.push(v[y * 8 + x] > v[(y + 1) * 8 + x] ? 1 : 0);
  }
  return bits;
}

async function extractFeatures(uri: string): Promise<Feat | null> {
  if (!uri) return null;
  if (featCache.has(uri)) return featCache.get(uri) ?? null;
  if (typeof document === "undefined") {
    featCache.set(uri, null);
    return null;
  }
  if (featCache.size > 1500) featCache.clear();
  try {
    const img = await loadHtmlImage(uri);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      featCache.set(uri, null);
      return null;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const n = SIZE * SIZE;
    const gray = new Float32Array(n);
    let ar = 0,
      ag = 0,
      ab = 0;
    for (let i = 0, k = 0; i < data.length; i += 4, k++) {
      ar += data[i];
      ag += data[i + 1];
      ab += data[i + 2];
      gray[k] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    ar /= n * 255;
    ag /= n * 255;
    ab /= n * 255;

    const g = 8;
    const step = SIZE / g;
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
            const idx = (y * SIZE + x) * 4;
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

    const feat: Feat = { color: [ar, ag, ab, ...grid, ...hist], hash: dHash(gray) };
    featCache.set(uri, feat);
    return feat;
  } catch {
    featCache.set(uri, null);
    return null;
  }
}

function pickProductImages(p: any): string[] {
  if (!p) return [];
  const out: string[] = [];
  const push = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length > 8 && !out.includes(s)) out.push(s);
  };
  const arr = Array.isArray(p.images) ? p.images : [];
  for (const x of arr) {
    if (typeof x === "string") push(x);
    else if (x && typeof x === "object") push(x.url || x.src || x.uri);
  }
  for (const k of ["image", "preview_image", "main_image", "thumbnail", "photo"]) push(p[k]);
  return out.slice(0, 3);
}

export function pickProductImage(p: any): string {
  return pickProductImages(p)[0] || "";
}

export function productName(p: any): string {
  const n = p?.name ?? p?.title ?? p?.name_uz;
  if (typeof n === "string") return n.trim();
  if (n && typeof n === "object") {
    return String(n.uz || n.ru || n.en || "").trim();
  }
  return "";
}

function categoryKey(p: any): string | null {
  const v =
    p?.category_id ??
    p?.categoryId ??
    p?.category?.id ??
    p?.subcategory_id ??
    null;
  return v == null || v === "" ? null : String(v);
}

function unwrapItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const k of ["items", "products", "results"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

const STOP = new Set([
  "dona",
  "ta",
  "va",
  "uchun",
  "the",
  "and",
  "for",
  "new",
  "yangi",
  "set",
  "katta",
  "kichik",
  "mini",
  "big",
  "small",
  "super",
  "bolalar",
  "oyinchoq",
  "toy",
  "toys",
  "paket",
  "komplekt",
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) return a.startsWith(b) || b.startsWith(a);
  return false;
}

function relevance(anchor: any, p: any): number {
  const at = tokens(productName(anchor));
  const pt = tokens(productName(p));
  let nameScore = 0;
  if (at.length && pt.length) {
    let hit = 0;
    for (const a of at) if (pt.some((b) => tokenMatch(a, b))) hit++;
    nameScore = hit / at.length;
  }
  if (nameScore <= 0) {
    const ac = categoryKey(anchor);
    const pc = categoryKey(p);
    return ac && pc && ac === pc ? 0.2 : 0;
  }
  const ac = categoryKey(anchor);
  const pc = categoryKey(p);
  const catScore = ac && pc && ac === pc ? 0.5 : 0;
  return nameScore + catScore;
}

async function loadCatalogFast(): Promise<any[]> {
  const skips = Array.from({ length: MAX_PAGES }, (_, i) => i * PAGE_SIZE);
  const pages = await Promise.all(
    skips.map((skip) =>
      api(`/products?sort=mix&limit=${PAGE_SIZE}&skip=${skip}`).catch(() => ({ items: [] }))
    )
  );
  const seen = new Set<string>();
  const all: any[] = [];
  for (const r of pages) {
    for (const p of unwrapItems(r)) {
      if (!p?.id || seen.has(String(p.id))) continue;
      seen.add(String(p.id));
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
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
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

async function scoreProducts(imageUri: string, products: any[]): Promise<Scored[]> {
  const q = await extractFeatures(imageUri);
  if (!q) return [];

  const withImg = products
    .map((p) => ({ p, img: pickProductImage(p) }))
    .filter((x) => !!x.img)
    .slice(0, MAX_COMPARE);

  const scored = await mapPool(withImg, CONCURRENCY, async ({ p, img }) => {
    const f = await extractFeatures(img);
    if (!f) return null;
    const c = compareFeat(q, f);
    return { d: c.d, ham: c.ham, pct: c.pct, exact: c.exact, p };
  });

  const top = scored
    .filter((s) => !s.exact && s.pct >= 60)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 15);
  await mapPool(top, CONCURRENCY, async (s) => {
    for (const u of pickProductImages(s.p).slice(1)) {
      const f = await extractFeatures(u);
      if (!f) continue;
      const c = compareFeat(q, f);
      if (c.pct > s.pct) {
        s.d = c.d;
        s.ham = c.ham;
        s.pct = c.pct;
        s.exact = c.exact;
      }
      if (s.exact) break;
    }
    return true;
  });

  return scored;
}

function betterScored(a: Scored, b: Scored): Scored {
  if (a.exact !== b.exact) return a.exact ? a : b;
  return a.pct >= b.pct ? a : b;
}

function toItem(s: Scored | undefined, p: any, section: "exact" | "similar"): any {
  const pct = s ? s.pct : section === "exact" ? 100 : 70;
  return {
    ...p,
    match_dist: s ? Math.round(s.d * 10000) / 10000 : undefined,
    match_percent: pct,
    similarity: pct,
    is_exact: section === "exact",
    section,
  };
}

async function backendSearchRaw(imageUri: string): Promise<any[] | null> {
  try {
    const form = new FormData();
    if (imageUri.startsWith("data:")) {
      const res = await fetch(imageUri);
      const blob = await res.blob();
      form.append("image", blob, blob.type?.includes("png") ? "search.png" : "search.jpg");
    } else {
      const name = imageUri.split("/").pop() || "search.jpg";
      const match = /\.(\w+)$/.exec(name);
      const ext = (match?.[1] || "jpg").toLowerCase();
      form.append("image", {
        uri: imageUri,
        name: name.includes(".") ? name : `search.${ext}`,
        type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
      } as any);
    }
    const data = await withTimeout(
      api("/search/by-image", { method: "POST", formData: form }),
      BACKEND_TIMEOUT_MS
    );
    const items = unwrapItems(data);
    if (data?.exact === true && items.length) {
      return items.map((p, i) => ({
        ...p,
        __backend_exact: i === 0,
        match_percent: i === 0 ? 100 : 94,
      }));
    }
    return items;
  } catch {
    return null;
  }
}

async function fetchRelated(anchor: any): Promise<any[]> {
  const calls: Promise<any>[] = [];
  const name = productName(anchor);
  if (name) {
    const q = name.split(/\s+/).slice(0, 4).join(" ");
    calls.push(
      withTimeout(
        api(`/products?search=${encodeURIComponent(q)}&sort=mix&limit=40`),
        RELATED_TIMEOUT_MS
      )
    );
  }
  const cat = categoryKey(anchor);
  if (cat) {
    calls.push(
      withTimeout(
        api(`/products?category_id=${encodeURIComponent(cat)}&sort=mix&limit=40`),
        RELATED_TIMEOUT_MS
      )
    );
  }
  if (!calls.length) return [];
  const res = await Promise.allSettled(calls);
  const out: any[] = [];
  for (const r of res) {
    if (r.status === "fulfilled") out.push(...unwrapItems(r.value));
  }
  return out;
}

export type ImageSearchResult = { exact: any[]; similar: any[] };

export async function searchByImageSections(imageUri: string): Promise<ImageSearchResult> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");

  const [backendItems, catalog] = await Promise.all([
    backendSearchRaw(imageUri),
    loadCatalogFast().catch(() => [] as any[]),
  ]);

  let scored: Scored[] = catalog.length ? await scoreProducts(imageUri, catalog) : [];

  if (backendItems && backendItems.length) {
    const extra = await scoreProducts(imageUri, backendItems);
    const byId = new Map<string, Scored>();
    for (const s of [...scored, ...extra]) {
      const id = String(s.p?.id || "");
      if (!id) continue;
      const prev = byId.get(id);
      byId.set(id, prev ? betterScored(prev, s) : s);
    }
    for (const p of backendItems) {
      const id = String(p?.id || "");
      if (!id) continue;
      const bExact = p.__backend_exact === true;
      const prev = byId.get(id);
      if (prev) {
        if (bExact) {
          prev.exact = true;
          prev.pct = 100;
        }
        continue;
      }
      const raw =
        typeof p.match_percent === "number"
          ? p.match_percent
          : typeof p.match_dist === "number"
          ? distToPercent(p.match_dist)
          : 70;
      const pct = bExact ? 100 : Math.min(94, raw);
      if (bExact || pct >= MIN_PERCENT) {
        byId.set(id, { d: p.match_dist ?? 0.12, ham: 0, pct, exact: bExact, p });
      }
    }
    scored = Array.from(byId.values());
  }

  const scoredById = new Map<string, Scored>();
  for (const s of scored) {
    const id = String(s.p?.id || "");
    if (id) scoredById.set(id, s);
  }

  let exactScored = scored
    .filter((s) => s.exact && s.p?.id)
    .sort((a, b) => a.ham - b.ham || a.d - b.d)
    .slice(0, MAX_EXACT);

  if (!exactScored.length) {
    const best = [...scored].sort((a, b) => b.pct - a.pct)[0];
    if (best && best.pct >= 92) {
      exactScored = [{ ...best, exact: true, pct: 100 }];
    }
  }

  const exact = exactScored.map((s) => toItem(s, s.p, "exact"));
  const used = new Set<string>(exactScored.map((s) => String(s.p.id)));
  const limit = Math.max(0, TOTAL_LIMIT - exact.length);
  const similar: any[] = [];

  let anchor: any = exactScored[0]?.p ?? null;
  if (!anchor) {
    const bestVisual = [...scored].sort((a, b) => b.pct - a.pct)[0];
    if (bestVisual && bestVisual.pct >= ANCHOR_MIN_PCT) anchor = bestVisual.p;
  }

  if (anchor) {
    const related = await fetchRelated(anchor).catch(() => [] as any[]);
    const pool = new Map<string, any>();
    for (const p of [...catalog, ...(backendItems ?? []), ...related]) {
      const id = String(p?.id || "");
      if (id && !pool.has(id)) pool.set(id, p);
    }
    const ranked = Array.from(pool.entries())
      .filter(([id]) => !used.has(id))
      .map(([id, p]) => ({ id, p, r: relevance(anchor, p), v: scoredById.get(id) }))
      .filter((x) => x.r > 0)
      .sort((a, b) => b.r - a.r || (b.v?.pct ?? 0) - (a.v?.pct ?? 0));
    for (const x of ranked) {
      if (similar.length >= limit) break;
      similar.push(toItem(x.v, x.p, "similar"));
      used.add(x.id);
    }
  }

  if (similar.length < limit) {
    const visual = scored
      .filter((s) => !s.exact && s.p?.id && s.pct >= SIMILAR_MIN_PCT)
      .sort((a, b) => b.pct - a.pct || a.d - b.d);
    for (const s of visual) {
      if (similar.length >= limit) break;
      const id = String(s.p.id);
      if (used.has(id)) continue;
      similar.push(toItem(s, s.p, "similar"));
      used.add(id);
    }
  }

  return { exact, similar };
}

export async function searchByImage(imageUri: string): Promise<any[]> {
  const { exact, similar } = await searchByImageSections(imageUri);
  return [...exact, ...similar];
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

export async function searchOwnProductsByImage(imageUri: string): Promise<any[]> {
  if (!imageUri) throw new Error("Rasm tanlanmagan");
  try {
    const r = await api("/seller/products");
    const mine = unwrapItems(r);
    if (!mine.length) return [];
    const scored = await scoreProducts(imageUri, mine);
    const ok = scored
      .filter((s) => s.exact || s.pct >= MIN_PERCENT)
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.pct - a.pct || a.d - b.d)
      .slice(0, TOTAL_LIMIT);
    return ok.map((s) => toItem(s, s.p, s.exact ? "exact" : "similar"));
  } catch (e) {
    console.warn("seller visual:", e);
    return [];
  }
}