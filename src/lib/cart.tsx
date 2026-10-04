import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export type CartItem = {
  product_id: string;
  name: any;
  image: string;
  price: number;
  qty: number;
  stock: number;
  seller_id: string;
  shop_name?: string;
  variation?: string | null;
};

type Ctx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (product_id: string, variation: string | null | undefined, qty: number) => void;
  remove: (product_id: string, variation?: string | null) => void;
  clear: () => void;
  updateImages: (map: Record<string, string>) => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<Ctx>({} as Ctx);

/** localStorage: URL va thumb saqlanadi */
function slimImage(img?: string | null): string {
  if (!img || typeof img !== "string") return "";
  const s = img.trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("data:") && s.length > 60000) return "";
  if (!s.startsWith("data:") && s.length > 60000) return "";
  return s;
}

export function pickProductImage(p: any): string {
  if (!p) return "";
  const list: any[] = [];
  if (Array.isArray(p.images)) list.push(...p.images);
  for (const k of ["image", "preview_image", "thumbnail", "main_image", "photo"]) {
    if (p[k]) list.push(p[k]);
  }
  for (const c of list) {
    let s = "";
    if (typeof c === "string") s = c.trim();
    else if (c && typeof c === "object") s = String(c.url || c.src || c.uri || c.path || "").trim();
    if (s.length > 8) {
      const out = slimImage(s);
      if (out) return out;
      if (s.startsWith("http")) return s;
    }
  }
  return "";
}

function slimCartItem(item: CartItem): CartItem {
  return {
    ...item,
    image: slimImage(item.image),
  };
}

function slimCart(items: CartItem[]): CartItem[] {
  return items.map(slimCartItem);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage.getItem("cart", "[]").then((v) => {
      try {
        const parsed = JSON.parse((v as string) || "[]");
        setItems(Array.isArray(parsed) ? slimCart(parsed) : []);
      } catch {
        setItems([]);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload = JSON.stringify(slimCart(items));
    storage.setItem("cart", payload).catch(async () => {
      // Quota: avval orders cache ni tozalab qayta urinish
      try {
        const keys = ["orders_cache", "categories_cache"];
        // best-effort: cart ni rasm siz saqlash
        const noImg = items.map((i) => ({ ...i, image: "" }));
        await storage.setItem("cart", JSON.stringify(noImg));
      } catch {
        // ignore
      }
    });
  }, [items, loaded]);

  const key = (id: string, v?: string | null) => `${id}|${v || ""}`;

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    const safe = { ...item, image: slimImage(item.image) };
    setItems((prev) => {
      const idx = prev.findIndex((i) => key(i.product_id, i.variation) === key(safe.product_id, safe.variation));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(next[idx].qty + qty, safe.stock) };
        return next;
      }
      return [...prev, { ...safe, qty }];
    });
  }, []);

  const setQty = useCallback((id: string, v: string | null | undefined, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => (key(i.product_id, i.variation) === key(id, v) ? { ...i, qty } : i))
        .filter((i) => i.qty > 0)
    );
  }, []);

  const remove = useCallback((id: string, v?: string | null) => {
    setItems((prev) => prev.filter((i) => key(i.product_id, i.variation) !== key(id, v)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const updateImages = useCallback((map: Record<string, string>) => {
    if (!map || !Object.keys(map).length) return;
    setItems((prev) =>
      prev.map((i) => {
        if (i.image) return i;
        const img = map[i.product_id];
        return img ? { ...i, image: slimImage(img) } : i;
      })
    );
  }, []);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, setQty, remove, clear, updateImages, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);