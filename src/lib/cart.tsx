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
  count: number;
  subtotal: number;
};

const CartContext = createContext<Ctx>({} as Ctx);

/** localStorage quota uchun: katta base64 ni saqlamaymiz */
function slimImage(img?: string | null): string {
  if (!img || typeof img !== "string") return "";
  const s = img.trim();
  if (!s) return "";
  // URL — saqlaymiz
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  // data-URI juda katta bo'lsa — tashlaymiz (quota)
  if (s.startsWith("data:") && s.length > 8000) return "";
  if (s.length > 8000) return "";
  return s;
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

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, setQty, remove, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);