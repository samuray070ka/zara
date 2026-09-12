const BASE = "http://127.0.0.1:8000";

let _token: string | null = null;
export const setToken = (t: string | null) => {
  _token = t; 
};

/**
 * api() helper
 * - Always sends POST + X-HTTP-Method-Override header for write operations,
 *   so requests work even when hosting/proxy (nginx, Cloudflare, some
 *   shared hosts) blocks raw PUT/PATCH/DELETE methods. Backend reads the
 *   X-HTTP-Method-Override header and routes to the right handler.
 * - Accepts either a JSON body or FormData (used for image uploads).
 */
export async function api(
  path: string,
  opts: {
    method?: string;
    body?: any;
    formData?: FormData;
    signal?: AbortSignal;
  } = {}
) {
  const targetMethod = (opts.method || "GET").toUpperCase();
  const transportMethod = ["GET", "HEAD"].includes(targetMethod)
    ? targetMethod
    : "POST";

  const headers: Record<string, string> = {
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
  };

  let body: BodyInit | undefined;

  if (opts.formData) {
    // multipart/form-data — browser/Expo will set the boundary automatically
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

  // Try to parse JSON first; some endpoints may return empty
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
    throw new Error(msg);
  }
  return data;
}
