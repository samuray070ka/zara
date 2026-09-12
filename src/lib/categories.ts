import { api } from "./api";
import { storage } from "@/src/utils/storage";

const CACHE_KEY = "categories_cache_v1";
const TTL_MS = 5 * 60 * 1000;

type Category = {
  id: string;
  name: { uz?: string; ru?: string; en?: string };
  icon?: string;
  parent_id?: string | null;
  order?: number;
  preview_image?: string | null;
};

type CachePayload = { at: number; data: Category[] };

let memoryCategories: Category[] | null = null;
let memoryAt = 0;
let inFlight: Promise<Category[]> | null = null;

const normalizeCategory = (cat: any): Category | null => {
  const id = String(cat?.id || "").trim();
  if (!id) return null;
  const name = typeof cat?.name === "object" && cat?.name
    ? cat.name
    : { uz: String(cat?.name || ""), ru: "", en: "" };
  return {
    id,
    name,
    icon: typeof cat?.icon === "string" && cat.icon.trim() ? cat.icon : "category",
    parent_id: cat?.parent_id ? String(cat.parent_id) : null,
    order: Number(cat?.order || 0),
    preview_image: typeof cat?.preview_image === "string" && cat.preview_image ? cat.preview_image : null,
  };
};

const saveCache = async (data: Category[]) => {
  memoryCategories = data;
  memoryAt = Date.now();
  await storage.setItem(CACHE_KEY, JSON.stringify({ at: memoryAt, data }));
};

const isFresh = (at: number) => Date.now() - at < TTL_MS;

export async function readCachedCategories(): Promise<Category[] | null> {
  if (memoryCategories?.length && isFresh(memoryAt)) return memoryCategories;
  const raw = await storage.getItem(CACHE_KEY, "");
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload;
    const data = Array.isArray(parsed?.data)
      ? parsed.data.map(normalizeCategory).filter(Boolean) as Category[]
      : [];
    if (!data.length || !isFresh(Number(parsed?.at || 0))) return null;
    memoryCategories = data;
    memoryAt = Number(parsed.at || 0);
    return data;
  } catch {
    return null;
  }
}

export async function fetchCategories(force = false): Promise<Category[]> {
  if (!force && memoryCategories?.length && isFresh(memoryAt)) return memoryCategories;
  if (inFlight) return inFlight;
  inFlight = api("/categories")
    .then(async (raw) => {
      const data = (Array.isArray(raw) ? raw : []).map(normalizeCategory).filter(Boolean) as Category[];
      await saveCache(data);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
