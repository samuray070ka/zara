const BASE = "https://zara-back.onrender.com";

let _token: string | null = null;
export const setToken = (t: string | null) => {
  _token = t;
};

export async function api(
  path: string,
  opts: {
    method?: string;
    body?: any;
    formData?: FormData;
    signal?: AbortSignal;
    skipAuth?: boolean;
  } = {}
) {
  const targetMethod = (opts.method || "GET").toUpperCase();
  const transportMethod = ["GET", "HEAD"].includes(targetMethod)
    ? targetMethod
    : "POST";

  const headers: Record<string, string> = {
    ...(_token && !opts.skipAuth ? { Authorization: `Bearer ${_token}` } : {}),
  };

  let body: BodyInit | undefined;

  if (opts.formData) {
    body = opts.formData as any;
  } else if (opts.body !== undefined && transportMethod !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  if (transportMethod !== targetMethod) {
    headers["X-HTTP-Method-Override"] = targetMethod;
  }

  const res = await fetch(`${BASE}/api${path}`, {
    method: transportMethod,
    headers,
    body,
    signal: opts.signal as any,
  });

  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.message ||
      `${res.status} ${res.statusText || "Xatolik"}`;
    const err: any = new Error(
      typeof msg === "string" ? msg : JSON.stringify(msg)
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function fetchProductsSafe(opts: {
  sort?: string;
  limit?: number;
  skip?: number;
  category_id?: string;
  seller_id?: string;
  search?: string;
  signal?: AbortSignal;
} = {}): Promise<{ items: any[]; total: number }> {
  const want = Math.max(1, Math.min(50, Number(opts.limit) || 20));
  const skip0 = Math.max(0, Number(opts.skip) || 0);
  const sort = opts.sort && opts.sort !== "mix" ? opts.sort : "new";

  const unwrap = (data: any): any[] => {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.products)) return data.products;
    if (Array.isArray(data)) return data;
    return [];
  };

  const onePage = async (lim: number, skip: number, skipAuth: boolean) => {
    const q: string[] = [
      `limit=${lim}`,
      `skip=${skip}`,
      `sort=${encodeURIComponent(sort)}`,
    ];
    if (opts.category_id)
      q.push(`category_id=${encodeURIComponent(opts.category_id)}`);
    if (opts.seller_id)
      q.push(`seller_id=${encodeURIComponent(opts.seller_id)}`);
    if (opts.search) q.push(`search=${encodeURIComponent(opts.search)}`);
    const data = await api(`/products?${q.join("&")}`, {
      signal: opts.signal,
      skipAuth,
    });
    return {
      items: unwrap(data),
      total: Number(data?.total ?? 0) || 0,
    };
  };

  const tryAuthModes = async (lim: number, skip: number) => {
    try {
      const r = await onePage(lim, skip, false);
      if (r.items.length === 0 && r.total > 0) {
        throw new Error("empty_items");
      }
      return r;
    } catch (e: any) {
      const status = e?.status || 0;
      const msg = String(e?.message || "");
      if (
        status === 401 ||
        status === 403 ||
        /401|403|Unauthorized|empty_items/i.test(msg)
      ) {
        const r = await onePage(lim, skip, true);
        if (r.items.length === 0 && r.total > 0) {
          throw new Error("empty_items");
        }
        return r;
      }
      throw e;
    }
  };

  const firstLim = Math.min(want, 15);
  try {
    const r = await tryAuthModes(firstLim, skip0);
    if (r.items.length) {
      let items = r.items;
      let total = r.total || items.length;
      let skip = skip0 + items.length;
      while (items.length < want && items.length < total) {
        try {
          const more = await tryAuthModes(10, skip);
          if (!more.items.length) break;
          const seen = new Set(items.map((x) => String(x.id)));
          for (const p of more.items) {
            if (!p?.id || seen.has(String(p.id))) continue;
            seen.add(String(p.id));
            items.push(p);
            if (items.length >= want) break;
          }
          skip += more.items.length;
          if (more.total) total = more.total;
        } catch {
          break;
        }
      }
      return { items: items.slice(0, want), total };
    }
  } catch {}

  try {
    const r = await tryAuthModes(10, skip0);
    if (r.items.length)
      return { items: r.items.slice(0, want), total: r.total || r.items.length };
  } catch {}

  try {
    const r = await tryAuthModes(5, skip0);
    if (r.items.length)
      return { items: r.items.slice(0, want), total: r.total || r.items.length };
  } catch {}

  return { items: [], total: 0 };
}