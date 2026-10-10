import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Common";
import { CuSelect, SimpleSelect, RG } from "@/components/Controls";
import { ReportShell, ReportTable } from "@/components/Report";
import { useAuth } from "@/context/AuthContext";
import { api, BULAN, rp, tglS } from "@/lib/api";

const thisYear = new Date().getFullYear();
const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(y, m, 0).getDate();

const periods = (tipe, y) => {
  const len = { bulan: 1, triwulan: 3, semester: 6, tahun: 12 }[tipe];
  const names = { bulan: (i) => BULAN[i], triwulan: (i) => `Triwulan ${i + 1}`, semester: (i) => `Semester ${i + 1}`, tahun: () => `Tahun ${y}` }[tipe];
  return Array.from({ length: 12 / len }, (_, i) => {
    const s = i * len + 1, e = s + len - 1;
    return { id: i, label: names(i), dari: `${y}-${pad(s)}-01`, sampai: `${y}-${pad(e)}-${lastDay(y, e)}` };
  });
};

const ageYears = (a, b) => {
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  let y = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) y -= 1;
  const exact = m2 === m1 && d2 === d1;
  return y + (exact ? 0 : 0.5);
};

const useData = (url, params) => {
  const [rows, setRows] = useState([]);
  const key = JSON.stringify(params);
  useEffect(() => {
    const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
    api.get(url, { params: p }).then((r) => setRows(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  return rows;
};

const cuLine = (cus, id) => (id ? `Credit Union: ${cus.find((c) => c.id === id)?.nama || "-"}` : cus.length === 1 ? `Credit Union: ${cus[0].nama}` : "Semua Credit Union");
const TIPE = [["triwulan", "Tiga Bulan"], ["semester", "Enam Bulan"], ["tahun", "Satu Tahun"]];
const TIPE_LABEL = { bulan: "Bulanan", triwulan: "Tiga Bulanan", semester: "Enam Bulanan", tahun: "Tahunan" };

const PeriodFilters = ({ f, set, isAdmin }) => (
  <div className="grid gap-3 md:grid-cols-3">
    {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="an-filter-cu" /></Field>}
    <Field label="Periode"><SimpleSelect value={f.tipe === "bulan" ? "" : f.tipe} onChange={(v) => set("tipe")(v || "bulan")} placeholder="Per Bulan" options={TIPE} testid="an-filter-tipe" /></Field>
    <Field label="Tahun"><Input type="number" value={f.tahun} onChange={(e) => set("tahun")(Number(e.target.value))} data-testid="an-filter-tahun" /></Field>
  </div>
);

const useF = (init) => {
  const [f, setF] = useState(init);
  return [f, (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }))];
};

const usePeriodRows = (f) => {
  const cair = useData("/permohonan", { status: "Dicairkan", cu_id: f.cu_id, cair_dari: `${f.tahun}-01-01`, cair_sampai: `${f.tahun}-12-31` });
  return useMemo(() => periods(f.tipe, f.tahun).map((p) => {
    const rs = cair.filter((r) => r.tanggal_cair >= p.dari && r.tanggal_cair <= p.sampai);
    const g = (k) => rs.reduce((a, r) => a + (r.analisis?.[k] || 0), 0);
    return { ...p, n: rs.length, l: rs.filter((r) => r.jenis_kelamin === "L").length, p: rs.filter((r) => r.jenis_kelamin === "P").length, sanduk: g("sanduk_disetujui"), lalau: g("lalau_disetujui"), total: g("total_disetujui") };
  }), [cair, f.tipe, f.tahun]);
};

export function LapSaldoPeriode() {
  const { org, isAdmin } = useAuth();
  const [f, set] = useF({ cu_id: "", tipe: "bulan", tahun: thisYear });
  const rows = usePeriodRows(f);
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const pct = (a, b) => `${(Math.round((a / b) * 1000) / 10).toLocaleString("id-ID")}%`;
  return (
    <ReportShell cuId={f.cu_id} title="Laporan Saldo Pencairan Tudung" lines={[cuLine(org.cus, f.cu_id), `${TIPE_LABEL[f.tipe]} Tahun ${f.tahun}`]} fileName={`Saldo_Pencairan_${f.tipe}_${f.tahun}`}
      filters={<PeriodFilters f={f} set={set} isAdmin={isAdmin} />}>
      {sum("n") === 0 ? (
        <div className="mb-4 flex h-[200px] w-full flex-col items-center justify-center rounded border border-dashed text-center" data-testid="saldo-periode-chart-empty">
          <p className="text-[11pt] font-semibold text-stone-600">Belum ada data</p>
          <p className="mt-1 text-[9pt] text-stone-500">Belum ada penerima pencairan pada tahun {f.tahun}.</p>
        </div>
      ) : (
        <div className="mb-4 h-[220px] w-full" data-testid="saldo-periode-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e3dc" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickFormatter={(v) => (f.tipe === "bulan" ? v.slice(0, 3) : v)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={30} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="l" name="Laki-laki" fill="#155e46" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="p" name="Perempuan" fill="#d97706" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="rpt-table" id="report-table" data-testid="report-table">
        <thead>
          <tr>
            <th rowSpan={2}>No.</th><th rowSpan={2}>Periode</th>
            <th colSpan={3}>PENCAIRAN TUDUNG</th>
            <th colSpan={2}>JENIS KELAMIN</th>
            <th rowSpan={2}>JUMLAH</th>
          </tr>
          <tr><th>SANDUK</th><th>LALAU</th><th>JUMLAH</th><th>Laki-laki</th><th>Perempuan</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="ctr">{i + 1}</td><td>{r.label}</td>
              <td className="num">{rp(r.sanduk)}</td><td className="num">{rp(r.lalau)}</td><td className="num">{rp(r.total)}</td>
              <td className="ctr">{r.l}</td><td className="ctr">{r.p}</td><td className="ctr">{r.n}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr data-testid="saldo-periode-total-row">
            <td colSpan={2} className="ctr">JUMLAH</td>
            <td className="num">{rp(sum("sanduk"))}</td><td className="num">{rp(sum("lalau"))}</td><td className="num">{rp(sum("total"))}</td>
            <td className="ctr" data-testid="saldo-periode-total-l">{sum("l")}{sum("n") > 0 && <span className="block text-[7.5pt] font-semibold">({pct(sum("l"), sum("n"))})</span>}</td>
            <td className="ctr" data-testid="saldo-periode-total-p">{sum("p")}{sum("n") > 0 && <span className="block text-[7.5pt] font-semibold">({pct(sum("p"), sum("n"))})</span>}</td>
            <td className="ctr">{sum("n")}</td>
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}

export function LapTidakDisetujui() {
  const { org, isAdmin } = useAuth();
  const [f, set] = useF({ cu_id: "", terima_dari: "", terima_sampai: "", hasil: "Tidak Disetujui" });
  const rows = useData("/permohonan", { ...f, status: "Sudah Dianalisis" });
  const alasan = (r) => {
    const a = r.analisis || {};
    const list = [...(a.catatan_umum || []), ...(a.catatan_sanduk || []), ...(a.catatan_lalau || [])].filter((t) => !t.includes("sesuai Saldo Permohonan"));
    return list.join(" ") + (a.catatan ? ` Catatan: ${a.catatan}` : "");
  };
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "nama", label: "Nama" },
    { key: "nomor_anggota", label: "BA", center: true },
    { key: "cu_nama", label: "CU" },
    { key: "tanggal_terima", label: "Tgl Terima", center: true, render: (r) => tglS(r.tanggal_terima) },
    { key: "total", label: "Diajukan", money: true, total: true },
    { key: "hasil", label: "Hasil", render: (r) => r.analisis?.hasil },
    { key: "alasan", label: "Alasan (Hasil Analisis)", render: alasan },
  ];
  return (
    <ReportShell cuId={f.cu_id} title={`Laporan Data Permohonan ${f.hasil}`} lines={[cuLine(org.cus, f.cu_id)]} fileName="Permohonan_Tidak_Disetujui"
      filters={
        <div className="grid gap-3 md:grid-cols-4">
          {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="an-filter-cu" /></Field>}
          <Field label="Hasil"><SimpleSelect value={f.hasil === "Tidak Disetujui" ? "" : f.hasil} onChange={(v) => set("hasil")(v || "Tidak Disetujui")} placeholder="Tidak Disetujui" options={[["Ditunda", "Ditunda"]]} testid="an-filter-hasil" /></Field>
          <Field label="Tgl Terima Dari"><Input type="date" value={f.terima_dari} onChange={set("terima_dari")} data-testid="an-filter-dari" /></Field>
          <Field label="Tgl Terima Sampai"><Input type="date" value={f.terima_sampai} onChange={set("terima_sampai")} data-testid="an-filter-sampai" /></Field>
        </div>
      }>
      <ReportTable columns={cols} rows={rows} labelSpan={5} />
    </ReportShell>
  );
}

export function LapTren() {
  const { org, isAdmin } = useAuth();
  const [f, set] = useF({ cu_id: "", tahun: thisYear });
  const range = { dari: `${f.tahun}-01-01`, sampai: `${f.tahun}-12-31` };
  const iuran = useData("/iuran", { cu_id: f.cu_id, ...range });
  const cair = useData("/permohonan", { status: "Dicairkan", cu_id: f.cu_id, cair_dari: range.dari, cair_sampai: range.sampai });
  const rows = useMemo(() => BULAN.map((b, i) => {
    const m = `${f.tahun}-${pad(i + 1)}`;
    const iu = iuran.filter((r) => r.tanggal.startsWith(m));
    const cr = cair.filter((r) => r.tanggal_cair?.startsWith(m));
    const s = (arr, fn) => arr.reduce((a, r) => a + (fn(r) || 0), 0);
    return { id: m, label: b, iuran: s(iu, (r) => r.total), biris: s(iu, (r) => r.biris), gppk: s(iu, (r) => r.gppk), n: cr.length, cair: s(cr, (r) => r.analisis?.total_disetujui) };
  }), [iuran, cair, f.tahun]);
  const cols = [
    { key: "label", label: "Bulan" },
    { key: "iuran", label: "Iuran Tudung", money: true, total: true },
    { key: "biris", label: "Biris Pangkaras", money: true, total: true },
    { key: "gppk", label: "Sol. GPPK", money: true, total: true },
    { key: "n", label: "Jml Anggota Cair", center: true, total: true },
    { key: "cair", label: "Saldo Pencairan", money: true, total: true },
  ];
  return (
    <ReportShell cuId={f.cu_id} title="Tren Iuran dan Pencairan Tudung" lines={[cuLine(org.cus, f.cu_id), `Tahun ${f.tahun}`]} fileName={`Tren_Iuran_Pencairan_${f.tahun}`}
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="an-filter-cu" /></Field>}
          <Field label="Tahun"><Input type="number" value={f.tahun} onChange={(e) => set("tahun")(Number(e.target.value))} data-testid="an-filter-tahun" /></Field>
        </div>
      }>
      {rows.every((r) => !r.iuran && !r.cair) ? (
        <div className="mb-4 flex h-[230px] w-full flex-col items-center justify-center rounded border border-dashed text-center" data-testid="tren-chart-empty">
          <p className="text-[11pt] font-semibold text-stone-600">Belum ada data</p>
          <p className="mt-1 text-[9pt] text-stone-500">Belum ada iuran atau pencairan pada tahun {f.tahun}.</p>
        </div>
      ) : (
      <div className="mb-4 h-[230px] w-full" data-testid="tren-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e3dc" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${v / 1e6} jt`} width={50} />
            <Tooltip formatter={(v) => `Rp ${rp(v)}`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="iuran" name="Iuran Tudung" stroke="#d97706" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="cair" name="Saldo Pencairan" stroke="#155e46" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
      <ReportTable columns={cols} rows={rows} labelSpan={1} />
    </ReportShell>
  );
}

const GROUPS = {
  meninggal: [[0, 40, "s/d 40 tahun"], [40, 50, "> 40 - 50 tahun"], [50, 55, "> 50 - 55 tahun"], [55, 60, "> 55 - 60 tahun"], [60, 65, "> 60 - 65 tahun"], [65, 70, "> 65 - 70 tahun"], [70, 999, "> 70 tahun"]],
  masuk: [[0, 17, "s/d 17 tahun"], [17, 30, "> 17 - 30 tahun"], [30, 45, "> 30 - 45 tahun"], [45, 55, "> 45 - 55 tahun"], [55, 60, "> 55 - 60 tahun"], [60, 65, "> 60 - 65 tahun"], [65, 70, "> 65 - 70 tahun"], [70, 999, "> 70 tahun"]],
};

export function LapUsia() {
  const { org, isAdmin } = useAuth();
  const [f, set] = useF({ cu_id: "", dasar: "meninggal", tahun: "", jenis: "" });
  const all = useData("/permohonan", { cu_id: f.cu_id });
  const rows = useMemo(() => {
    const src = all.filter((r) => (!f.tahun || r.tgl_kejadian?.startsWith(String(f.tahun))) && (!f.jenis || r.jenis_kejadian === f.jenis));
    return GROUPS[f.dasar].map(([lo, hi, label]) => {
      const rs = src.filter((r) => {
        const a = ageYears(r.tgl_lahir, f.dasar === "meninggal" ? r.tgl_kejadian : r.tgl_anggota);
        return a !== null && (lo === 0 ? a <= hi : a > lo && a <= hi);
      });
      return { id: label, label, l: rs.filter((r) => r.jenis_kelamin === "L").length, p: rs.filter((r) => r.jenis_kelamin === "P").length, n: rs.length,
        sanduk: rs.reduce((a, r) => a + (r.sanduk || 0), 0), lalau: rs.reduce((a, r) => a + (r.lalau || 0), 0) };
    });
  }, [all, f.dasar, f.tahun, f.jenis]);
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "label", label: f.dasar === "meninggal" ? "Usia Meninggal/CTT" : "Usia Masuk Anggota" },
    { key: "l", label: "L", center: true, total: true },
    { key: "p", label: "P", center: true, total: true },
    { key: "n", label: "Jumlah Anggota", center: true, total: true },
    { key: "sanduk", label: "Sanduk Diajukan", money: true, total: true },
    { key: "lalau", label: "Lalau Diajukan", money: true, total: true },
  ];
  return (
    <ReportShell cuId={f.cu_id} title={`Laporan Data Anggota Meninggal/CTT berdasarkan ${f.dasar === "meninggal" ? "Usia Meninggal" : "Usia Masuk"}`}
      lines={[cuLine(org.cus, f.cu_id), f.tahun ? `Tahun Kejadian ${f.tahun}` : "Seluruh Tahun"]} fileName={`Anggota_per_Usia_${f.dasar}`}
      filters={
        <div className="grid gap-3 md:grid-cols-4">
          {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="an-filter-cu" /></Field>}
          <Field label="Berdasarkan"><RG value={f.dasar} onChange={set("dasar")} testid="an-filter-dasar" options={[["meninggal", "Usia Meninggal"], ["masuk", "Usia Masuk"]]} /></Field>
          <Field label="Jenis Kejadian"><SimpleSelect value={f.jenis} onChange={set("jenis")} options={[["meninggal", "Meninggal Dunia"], ["cacat", "Cacat Total Tetap"]]} testid="an-filter-jenis" /></Field>
          <Field label="Tahun Kejadian (kosong = semua)"><Input type="number" value={f.tahun} onChange={set("tahun")} data-testid="an-filter-tahun" /></Field>
        </div>
      }>
      <ReportTable columns={cols} rows={rows} labelSpan={2} />
    </ReportShell>
  );
}

const SORTS = [["iuran", "Iuran Terbesar"], ["cair", "Saldo Pencairan Terbesar"], ["n_cair", "Jumlah Anggota Dicairkan"], ["n_meninggal", "Jumlah Anggota Meninggal/CTT"]];

export function LapRating() {
  const { org } = useAuth();
  const [f, set] = useF({ tahun: thisYear, by: "cair" });
  const range = f.tahun ? { dari: `${f.tahun}-01-01`, sampai: `${f.tahun}-12-31` } : {};
  const iuran = useData("/iuran", range);
  const all = useData("/permohonan", {});
  const rows = useMemo(() => {
    const inYear = (d) => !f.tahun || d?.startsWith(String(f.tahun));
    return org.cus.map((c) => {
      const ps = all.filter((r) => r.cu_id === c.id);
      const cr = ps.filter((r) => r.status === "Dicairkan" && inYear(r.tanggal_cair));
      return { id: c.id, kode: c.kode, nama: c.nama,
        iuran: iuran.filter((r) => r.cu_id === c.id).reduce((a, r) => a + (r.total || 0), 0),
        n_meninggal: ps.filter((r) => inYear(r.tgl_kejadian)).length,
        n_cair: cr.length, cair: cr.reduce((a, r) => a + (r.analisis?.total_disetujui || 0), 0) };
    }).sort((a, b) => b[f.by] - a[f.by] || b.cair - a.cair);
  }, [org.cus, iuran, all, f.tahun, f.by]);
  const cols = [
    { key: "rank", label: "Peringkat", center: true, render: (_, i) => i + 1 },
    { key: "kode", label: "Kode", center: true },
    { key: "nama", label: "Credit Union" },
    { key: "iuran", label: "Total Iuran Tudung", money: true, total: true },
    { key: "n_meninggal", label: "Anggota Meninggal/CTT", center: true, total: true },
    { key: "n_cair", label: "Anggota Dicairkan", center: true, total: true },
    { key: "cair", label: "Saldo Pencairan", money: true, total: true },
  ];
  return (
    <ReportShell title="Rating Credit Union" lines={[`Urutan: ${SORTS.find((s) => s[0] === f.by)[1]}`, f.tahun ? `Tahun ${f.tahun}` : "Seluruh Tahun"]} fileName={`Rating_CU_${f.by}_${f.tahun || "semua"}`}
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Urutkan Berdasarkan"><SimpleSelect value={f.by === "cair" ? "" : f.by} onChange={(v) => set("by")(v || "cair")} placeholder="Saldo Pencairan Terbesar" options={SORTS.filter((s) => s[0] !== "cair")} testid="rating-sort" /></Field>
          <Field label="Tahun (kosong = semua)"><Input type="number" value={f.tahun} onChange={(e) => set("tahun")(e.target.value ? Number(e.target.value) : "")} data-testid="rating-tahun" /></Field>
        </div>
      }>
      <ReportTable columns={cols} rows={rows} labelSpan={3} />
    </ReportShell>
  );
}

const rasio = (r) => (r.iuran ? `${((r.cair / r.iuran) * 100).toFixed(1).replace(".", ",")}%` : "-");

export function LapPerbandingan() {
  const { org, isAdmin } = useAuth();
  const [f, set] = useF({ tahun: thisYear, mode: "cu", cu_id: "" });
  const range = { dari: `${f.tahun}-01-01`, sampai: `${f.tahun}-12-31` };
  const iuran = useData("/iuran", range);
  const cair = useData("/permohonan", { status: "Dicairkan", cair_dari: range.dari, cair_sampai: range.sampai });
  const agg = (iu, cr, extra) => {
    const i = iu.reduce((a, r) => a + (r.total || 0), 0);
    const c = cr.reduce((a, r) => a + (r.analisis?.total_disetujui || 0), 0);
    return { ...extra, iuran: i, cair: c, selisih: i - c, n: cr.length };
  };
  const rows = useMemo(() => {
    if (f.mode === "cu") return org.cus.map((c) => agg(iuran.filter((r) => r.cu_id === c.id), cair.filter((r) => r.cu_id === c.id), { id: c.id, label: `${c.kode} — ${c.nama}` }));
    const iu = f.cu_id ? iuran.filter((r) => r.cu_id === f.cu_id) : iuran;
    const cr = f.cu_id ? cair.filter((r) => r.cu_id === f.cu_id) : cair;
    return BULAN.map((b, i) => {
      const m = `${f.tahun}-${pad(i + 1)}`;
      return agg(iu.filter((r) => r.tanggal.startsWith(m)), cr.filter((r) => r.tanggal_cair?.startsWith(m)), { id: m, label: b });
    });
  }, [org.cus, iuran, cair, f.mode, f.cu_id, f.tahun]);
  const tot = agg(f.mode === "cu" || !f.cu_id ? iuran : iuran.filter((r) => r.cu_id === f.cu_id), f.mode === "cu" || !f.cu_id ? cair : cair.filter((r) => r.cu_id === f.cu_id), {});
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "label", label: f.mode === "cu" ? "Credit Union" : "Bulan", render: (r) => (r.selisih < 0 ? <span data-testid={`defisit-${r.id}`}>{r.label} <b>(DEFISIT)</b></span> : r.label) },
    { key: "iuran", label: "Total Iuran Tudung", money: true, total: true },
    { key: "n", label: "Jml Anggota Cair", center: true, total: true },
    { key: "cair", label: "Total Pencairan Tudung", money: true, total: true },
    { key: "selisih", label: "Selisih (Iuran - Pencairan)", money: true, total: true, value: (r) => r.selisih, render: (r) => r.selisih },
    { key: "rasio", label: "Rasio Pencairan/Iuran", center: true, render: rasio },
  ];
  return (
    <ReportShell title="Laporan Perbandingan Iuran dan Pencairan Tudung" fileName={`Perbandingan_Iuran_Pencairan_${f.tahun}_${f.mode}`}
      lines={[f.mode === "cu" ? "Semua Credit Union" : cuLine(org.cus, f.cu_id), `Tahun ${f.tahun}${f.mode === "bulan" ? " • Detail Bulanan" : ""}`]}
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tampilan"><RG value={f.mode} onChange={set("mode")} testid="banding-mode" options={[["cu", "Ringkasan per CU"], ["bulan", "Detail Bulan per Bulan"]]} /></Field>
          {f.mode === "bulan" && isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="banding-cu" /></Field>}
          <Field label="Tahun"><Input type="number" value={f.tahun} onChange={(e) => set("tahun")(Number(e.target.value))} data-testid="banding-tahun" /></Field>
        </div>
      }>
      <ReportTable columns={cols} rows={rows} labelSpan={2} rowClass={(r) => (r.selisih < 0 ? "rpt-defisit" : "")} />
      {rows.some((r) => r.selisih < 0) && <p className="mt-2 text-[9pt] text-red-700" data-testid="banding-defisit-note">Baris merah (DEFISIT): total pencairan melebihi total iuran pada tahun {f.tahun}.</p>}
      <p className="mt-2 text-right text-[9pt]" data-testid="banding-rasio-total">Rasio total pencairan terhadap iuran: <b>{rasio(tot)}</b></p>
    </ReportShell>
  );
}


const fmtPermil = (v) => (v === null || v === undefined ? "-" : `${String(v).replace(".", ",")} \u2030`);

export function LapPerMil() {
  const [tahun, setTahun] = useState(thisYear);
  const rows = useData("/laporan/permil", { tahun });
  const tot = rows.reduce((a, r) => ({ m: a.m + (r.anggota ? r.meninggal : 0), n: a.n + r.anggota }), { m: 0, n: 0 });
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "kode", label: "Kode", center: true },
    { key: "nama", label: "Credit Union" },
    { key: "anggota", label: "Jumlah Anggota", money: true, total: true },
    { key: "l", label: "L", center: true, total: true },
    { key: "p", label: "P", center: true, total: true },
    { key: "meninggal", label: "Meninggal/CTT", center: true, total: true },
    { key: "permil", label: "Per Mil (\u2030)", center: true, render: (r) => fmtPermil(r.permil) + (r.sumber === "terkini" ? " *" : "") },
  ];
  return (
    <ReportShell title="Laporan Angka Kematian/CTT Anggota per Mil" lines={[`Tahun ${tahun}`, "Per mil = jumlah meninggal/CTT \u00f7 jumlah anggota \u00d7 1.000"]} fileName={`Per_Mil_${tahun}`}
      filters={<div className="max-w-xs"><Field label="Tahun Kejadian"><Input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} data-testid="permil-tahun" /></Field></div>}>
      <ReportTable columns={cols} rows={rows} labelSpan={3} />
      <p className="mt-2 text-right text-[9pt]" data-testid="permil-total">Per mil keseluruhan (hanya CU yang jumlah anggotanya terisi): <b>{fmtPermil(tot.n ? Math.round((tot.m / tot.n) * 100000) / 100 : null)}</b></p>
      {rows.some((r) => r.sumber === "terkini") && <p className="mt-1 text-[8pt]" data-testid="permil-terkini-note">* Jumlah anggota tahun {tahun} belum dicatat; memakai Jumlah Anggota Terkini.</p>}
      {rows.some((r) => !r.anggota) && <p className="no-print mt-1 text-xs text-amber-700">CU dengan per mil "-" belum diisi Jumlah Anggota di Data Induk &rarr; Data Credit Union.</p>}
    </ReportShell>
  );
}

