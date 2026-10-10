import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileStack, ScanSearch, HandCoins, CheckCircle2, FilePlus2, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/Common";
import { CuSelect } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, rp, tgl, BULAN } from "@/lib/api";

const bln = (k) => `${BULAN[Number(k.slice(5, 7)) - 1].slice(0, 3)} ${k.slice(2, 4)}`;

const Defisit = ({ d }) =>
  d.items.length ? (
    <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-5" data-testid="dash-defisit">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-red-800"><AlertTriangle className="h-4 w-4" /> Peringatan: Pencairan melebihi Iuran (Tahun {d.tahun})</p>
        <Link to="/laporan/perbandingan" className="text-xs font-semibold text-red-700 hover:underline" data-testid="dash-defisit-link">Lihat perbandingan</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {d.items.map((c) => (
          <div key={c.cu_id} className="rounded-md border border-red-200 bg-white px-4 py-3" data-testid={`dash-defisit-${c.cu_id}`}>
            <p className="text-sm font-semibold text-red-800">{c.kode} — {c.nama}</p>
            <p className="mt-1 text-xs text-stone-600">Iuran Rp {rp(c.iuran)} • Pencairan Rp {rp(c.cair)}</p>
            <p className="font-mono text-sm font-bold text-red-700">Selisih Rp {rp(c.selisih)}</p>
          </div>
        ))}
      </div>
    </div>
  ) : null;

const Tren = ({ initial }) => {
  const { isAdmin } = useAuth();
  const [cu, setCu] = useState("");
  const [data, setData] = useState(initial);
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/dashboard/tren", { params: cu ? { cu_id: cu } : {} }).then((r) => setData(r.data));
  }, [cu, isAdmin]);
  return (
  <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm" data-testid="dash-tren">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#155e46]"><TrendingUp className="h-4 w-4" /> Tren Iuran & Pencairan 12 Bulan Terakhir</p>
      <div className="flex items-center gap-3">
        {isAdmin && <div className="w-64"><CuSelect value={cu} onChange={setCu} allowAll testid="dash-tren-cu" /></div>}
        <Link to="/laporan/tren" className="text-xs font-semibold text-amber-700 hover:underline" data-testid="dash-tren-link">Lihat laporan lengkap</Link>
      </div>
    </div>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 10, right: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e3dc" />
        <XAxis dataKey="bulan" tickFormatter={bln} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `${v / 1e6} jt`} tick={{ fontSize: 11 }} width={60} />
        <Tooltip labelFormatter={bln} formatter={(v, n) => [`Rp ${rp(v)}`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="iuran" name="Iuran Tudung" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="cair" name="Saldo Pencairan" stroke="#155e46" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
  );
};

const Stat = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="rounded-lg border bg-white p-5 shadow-sm fade-up" data-testid={testid}>
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <Icon className={`h-5 w-5 ${accent}`} />
    </div>
    <p className="mt-3 text-3xl font-extrabold tabular-nums text-[#0d3b2e]">{value}</p>
  </div>
);

export default function Dashboard() {
  const { user, org } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return <p className="text-sm text-muted-foreground">Memuat dashboard...</p>;

  return (
    <div>
      <PageHeader title={`Selamat datang, ${user.name}`} subtitle={org.puskopdit.nama || "Ringkasan Tudung-Pusaka"}>
        <Button asChild className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="dash-add-permohonan-btn">
          <Link to="/permohonan/tambah"><FilePlus2 className="mr-2 h-4 w-4" /> Tambah Permohonan</Link>
        </Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FileStack} label="Total Permohonan" value={d.total} accent="text-[#155e46]" testid="stat-total" />
        <Stat icon={ScanSearch} label="Antrian Analisis" value={d.status["Antrian Analisis"] || 0} accent="text-amber-600" testid="stat-antrian" />
        <Stat icon={CheckCircle2} label="Sudah Dianalisis" value={d.status["Sudah Dianalisis"] || 0} accent="text-sky-700" testid="stat-dianalisis" />
        <Stat icon={HandCoins} label="Sudah Dicairkan" value={d.status["Dicairkan"] || 0} accent="text-emerald-700" testid="stat-dicairkan" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg bg-[#0d3b2e] p-6 text-white shadow-sm" data-testid="dash-cair-summary">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Total Bantuan Dicairkan</p>
          <p className="mt-3 font-mono text-3xl font-bold tabular-nums">Rp {rp(d.cair.total)}</p>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-emerald-100/80">Sanduk</span><span className="font-mono">Rp {rp(d.cair.sanduk)}</span></div>
            <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-emerald-100/80">Lalau</span><span className="font-mono">Rp {rp(d.cair.lalau)}</span></div>
            <div className="flex justify-between"><span className="text-emerald-100/80">Credit Union</span><span className="font-mono">{d.jumlah_cu}</span></div>
          </div>
          {Object.keys(d.hasil).length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {Object.entries(d.hasil).map(([k, v]) => (
                <span key={k} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{k}: <b>{v}</b></span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm lg:col-span-2">
          <p className="mb-4 text-sm font-semibold text-[#155e46]">Pencairan per Credit Union</p>
          {d.per_cu.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Belum ada pencairan.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.per_cu}>
                <XAxis dataKey="nama" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${v / 1e6} jt`} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => `Rp ${rp(v)}`} />
                <Bar dataKey="total" fill="#155e46" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <Defisit d={d.defisit} />

      <Tren initial={d.tren} />

      <div className="mt-6 rounded-lg border bg-white shadow-sm">
        <p className="border-b px-5 py-3 text-sm font-semibold text-[#155e46]">Permohonan Terbaru</p>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead><tr><th className="px-4 py-2 text-left">Nama</th><th className="px-4 py-2 text-left">BA</th><th className="px-4 py-2 text-left">Credit Union</th><th className="px-4 py-2 text-left">Terima Berkas</th><th className="px-4 py-2 text-left">Status</th></tr></thead>
            <tbody>
              {d.recent.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Belum ada data.</td></tr>}
              {d.recent.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2"><Link to={`/permohonan/${r.id}`} className="font-medium text-[#155e46] hover:underline">{r.nama}</Link></td>
                  <td className="px-4 py-2 font-mono">{r.nomor_anggota}</td>
                  <td className="px-4 py-2">{r.cu_nama}</td>
                  <td className="px-4 py-2">{tgl(r.tanggal_terima)}</td>
                  <td className="px-4 py-2"><StatusBadge value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
