import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const TOKEN_KEY = "tudung_token";
export const api = axios.create({ baseURL: API });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config.url.includes("/auth/login")) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(e);
  }
);

export function errMsg(e, fallback = "Terjadi kesalahan") {
  const d = e?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || fallback;
}

export const rp = (n) => new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));
export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const tgl = (s) => {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${+d} ${BULAN[+m - 1]} ${y}`;
};
export const tglS = (s) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "-");
export const ymdText = (o) => (o ? `${o.tahun} th ${o.bulan} bln ${o.hari} hr` : "-");
export const ymdLong = (o) => (o ? `${o.tahun} Tahun ${o.bulan} Bulan ${o.hari} Hari` : "-");
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const sum = (rows, fn) => rows.reduce((a, r) => a + (Number(fn(r)) || 0), 0);
export const JK = { L: "Laki-laki", P: "Perempuan" };
export const KEJADIAN = { meninggal: "Meninggal Dunia", cacat: "Cacat Total Tetap" };

export async function openPdf(url) {
  const w = window.open("", "_blank");
  const r = await api.get(url, { responseType: "blob" });
  const u = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
  if (w) w.location.href = u;
  else window.open(u, "_blank");
}

export function sortRows(rows, key, dir) {
  if (!key) return rows;
  const get = (r) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), r);
  return [...rows].sort((a, b) => {
    const x = get(a) ?? "";
    const y = get(b) ?? "";
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id");
    return dir === "asc" ? c : -c;
  });
}
