import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, TOKEN_KEY } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState({ settings: {}, puskopdit: {}, cus: [] });

  const loadOrg = useCallback(async () => {
    const [s, p, c] = await Promise.all([api.get("/settings"), api.get("/puskopdit"), api.get("/cu")]);
    setOrg({ settings: s.data, puskopdit: p.data, cus: c.data });
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return setUser(false);
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  useEffect(() => {
    if (user) loadOrg();
  }, [user, loadOrg]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(false);
  };

  const hak = { input_iuran: true, ubah_hapus_permohonan: true, lihat_hasil_analisis: true, lihat_laporan_permohonan: true, ...(org.cus.find((c) => c.id === user?.cu_id)?.hak_akses || {}) };
  const can = (perm) => user?.role === "admin" || !!hak[perm];

  return (
    <AuthCtx.Provider value={{ user, login, logout, org, loadOrg, isAdmin: user?.role === "admin", can }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
