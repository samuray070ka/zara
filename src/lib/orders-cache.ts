import { api } from "./api";
import { storage } from "@/src/utils/storage";

const TTL_MS = 60 * 1000;

type OrderLite = any;
type CachePayload = { at: number; data: OrderLite[] };

const memory = new Map<string, CachePayload>();
const pending = new Map<string, Promise<OrderLite[]>>();

function slimOrders(list: any[]): any[] {
  return (list || []).map((o) => {
    if (!o || typeof o !== "object") return o;
    const items = Array.isArray(o.items)
      ? o.items.map((it: any) => {
          const img = typeof it?.image === "string" ? it.image : "";
          const keep =
            img.startsWith("http://") || img.startsWith("https://")
              ? img
              : img.startsWith("data:") && img.length > 4000
              ? ""
              : img.length > 4000
              ? ""
              : img;
          return { ...it, image: keep };
        })
      : o.items;
    return { ...o, items };
  });
}

const cacheKey = (token: string) => `orders_cache_v1_${token}`;

const isFresh = (at: number) => Date.now() - at < TTL_MS;

export async function readCachedOrders(token: string): Promise<OrderLite[] | null> {
  const mem = memory.get(token);
  if (mem?.data?.length && isFresh(mem.at)) return mem.data;

  const raw = await storage.getItem(cacheKey(token), "");
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload;
    if (!Array.isArray(parsed?.data) || !parsed.data.length || !isFresh(Number(parsed?.at || 0))) {
      return null;
    }
    memory.set(token, { at: Number(parsed.at || 0), data: parsed.data });
    return parsed.data;
  } catch {
    return null;
  }
}

export async function fetchOrders(token: string, force = false): Promise<OrderLite[]> {
  const mem = memory.get(token);
  if (!force && mem?.data?.length && isFresh(mem.at)) return mem.data;
  if (pending.has(token)) return pending.get(token)!;

  const req = api("/orders/my")
    .then(async (data) => {
      const list = slimOrders(Array.isArray(data) ? data : []);
      const payload = { at: Date.now(), data: list };
      memory.set(token, payload);
      try {
        await storage.setItem(cacheKey(token), JSON.stringify(payload));
      } catch {
        // quota — faqat xotirada qoldiramiz
      }
      return list;
    })
    .finally(() => {
      pending.delete(token);
    });

  pending.set(token, req);
  return req;
}