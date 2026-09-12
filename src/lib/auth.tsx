import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, setToken } from "./api";

type User = any;
type Ctx = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await storage.getItem("token", "");
      if (t) {
        setToken(t as string);
        setTok(t as string);
        try {
          const u = await api("/auth/me");
          setUser(u);
        } catch {
          setToken(null);
          setTok(null);
          await storage.removeItem("token");
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (t: string, u: User) => {
    setToken(t);
    setTok(t);
    setUser(u);
    await storage.setItem("token", t);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setTok(null);
    setUser(null);
    await storage.removeItem("token");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await api("/auth/me");
      setUser(u);
    } catch {}
  }, []);

  return <AuthContext.Provider value={{ user, token, ready, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
