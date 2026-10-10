import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect, SimpleSelect } from "@/components/Controls";
import { ReportShell, ReportTable, PencairanTable } from "@/components/Report";
import { useAuth } from "@/context/AuthContext";
import { api, tglS, tgl, ymdText, BULAN, KEJADIAN } from "@/lib/api";
import LaporanIuran from "@/pages/LaporanIuran";
import { NAV, allowed } from "@/components/Layout";
import { LapSaldoPeriode, LapGenderPeriode, LapTidakDisetujui, LapTren, LapUsia, LapRating, LapPerbandingan, LapPerMil } from "@/pages/LaporanAnalitik";

const useRows = (params, deps) => {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
    api.get("/permohonan", { params: p }).then((r) => setRows([...r.data].sort((a, b) => a.nama.localeCompare(b.nama))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
};

const Filters = ({ f, set, extra, dateLabel = "Tgl Terima", dk = ["terima_dari", "terima_sampai"] }) => {
  const { isAdmin } = useAuth();
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="lap-filter-cu" /></Field>}
      <Field label={`${dateLabel} Dari`}><Input type="date" value={f[dk[0]]} onChange={set(dk[0])} data-testid="lap-filter-dari" /></Field>
      <Field label={`${dateLabel} Sampai`}><Input type="date" value={f[dk[1]]} onChange={set(dk[1])} data-testid="lap-filter-sampai" /></Field>
      {extra}
    </div>
  );
};

const useF = (init) => {
  const [f, setF] = useState(init);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));
  return [f, set];
};

const usePeriodLine = (f, a, b, label) => {
  const { org } = useAuth();
  const cu = org.cus.find((c) => c.id === f.cu_id);
  return [cu ? `Credit Union: ${cu.nama}` : "Semua Credit Union", f[a] || f[b] ? `${label}: ${f[a] ? tgl(f[a]) : "awal"} s/d ${f[b] ? tgl(f[b]) : "sekarang"}` : null];
};

function LapPermohonan() {
  const [f, set] = useF({ cu_id: "", terima_dari: "", terima_sampai: "", status: "", jk: "" });
  const rows = useRows(f, [f]);
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "tanggal_terima", label: "Tgl Terima", center: true, render: (r) => tglS(r.tanggal_terima) },
    { key: "cu_nama", label: "Credit Union" },
    { key: "nama", label: "Nama" },
    { key: "nomor_anggota", label: "BA", center: true },
    { key: "jenis_kelamin", label: "JK", center: true },
    { key: "tgl_kejadian", label: "Tgl Kejadian", center: true, render: (r) => tglS(r.tgl_kejadian) },
    { key: "jenis_kejadian", label: "Kejadian", render: (r) => (r.jenis_kejadian === "cacat" ? "CTT" : "Meninggal") },
    { key: "sanduk", label: "SANDUK", money: true, total: true },
    { key: "lalau", label: "LALAU", money: true, total: true },
    { key: "total", label: "JUMLAH", money: true, total: true },
    { key: "status", label: "Status" },
  ];
  return (
    <ReportShell title="Laporan Data Permohonan Tudung" lines={usePeriodLine(f, "terima_dari", "terima_sampai", "Tanggal Terima Berkas")} fileName="Laporan_Permohonan"
      filters={<Filters f={f} set={set} extra={<>
        <Field label="Status"><SimpleSelect value={f.status} onChange={set("status")} testid="lap-filter-status" options={[["Antrian Analisis", "Antrian Analisis"], ["Sudah Dianalisis", "Sudah Dianalisis"], ["Dicairkan", "Dicairkan"]]} /></Field>
        <Field label="Jenis Kelamin"><SimpleSelect value={f.jk} onChange={set("jk")} testid="lap-filter-jk" options={[["L", "Laki-laki"], ["P", "Perempuan"]]} /></Field>
      </>} />}>
      <ReportTable columns={cols} rows={rows} labelSpan={8} />
    </ReportShell>
  );
}

function LapAnalisis() {
  const [f, set] = useF({ cu_id: "", terima_dari: "", terima_sampai: "", hasil: "", status: "Sudah Dianalisis,Dicairkan" });
  const rows = useRows(f, [f]);
  const a = (r) => r.analisis || {};
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "nama", label: "Nama" },
    { key: "nomor_anggota", label: "BA", center: true },
    { key: "cu_nama", label: "CU" },
    { key: "lama", label: "Lama Berkas (hr)", center: true, render: (r) => a(r).lama_berkas },
    { key: "usia", label: "Usia Kejadian", render: (r) => ymdText(a(r).usia_kejadian) },
    { key: "sa", label: "Sanduk Diajukan", money: true, total: true, render: (r) => a(r).sanduk_diajukan },
    { key: "ss", label: "Sanduk Disetujui", money: true, total: true, render: (r) => a(r).sanduk_disetujui },
    { key: "la", label: "Lalau Diajukan", money: true, total: true, render: (r) => a(r).lalau_diajukan },
    { key: "ls", label: "Lalau Disetujui", money: true, total: true, render: (r) => a(r).lalau_disetujui },
    { key: "ts", label: "Total Disetujui", money: true, total: true, render: (r) => a(r).total_disetujui },
    { key: "hasil", label: "Hasil", render: (r) => a(r).hasil },
  ];
  return (
    <ReportShell title="Laporan Data Analisis Permohonan Tudung" lines={[...usePeriodLine(f, "terima_dari", "terima_sampai", "Tanggal Terima Berkas"), f.hasil ? `Hasil: ${f.hasil}` : null]} fileName="Laporan_Analisis"
      filters={<Filters f={f} set={set} extra={
        <Field label="Hasil Analisis"><SimpleSelect value={f.hasil} onChange={set("hasil")} testid="lap-filter-hasil" options={["Disetujui", "Disetujui Sebagian", "Ditunda", "Tidak Disetujui"].map((x) => [x, x])} /></Field>
      } />}>
      <ReportTable columns={cols} rows={rows} labelSpan={6} />
    </ReportShell>
  );
}

function LapPencairan() {
  const [f, set] = useF({ cu_id: "", cair_dari: "", cair_sampai: "", status: "Dicairkan" });
  const rows = useRows(f, [f]);
  return (
    <ReportShell title="Laporan Pencairan Bantuan Tudung" lines={usePeriodLine(f, "cair_dari", "cair_sampai", "Tanggal Pencairan")} fileName="Laporan_Pencairan"
      filters={<Filters f={f} set={set} dateLabel="Tgl Cair" dk={["cair_dari", "cair_sampai"]} />}>
      <PencairanTable rows={rows} />
    </ReportShell>
  );
}

const range = (tipe, tahun, idx) => {
  const len = { bulan: 1, triwulan: 3, semester: 6, tahun: 12 }[tipe];
  const start = tipe === "tahun" ? 1 : (idx - 1) * len + 1;
  const end = start + len - 1;
  const last = new Date(tahun, end, 0).getDate();
  return [`${tahun}-${String(start).padStart(2, "0")}-01`, `${tahun}-${String(end).padStart(2, "0")}-${last}`, start, end];
};

function LapRekap() {
  const { org } = useAuth();
  const [f, set] = useF({ tipe: "bulan", tahun: new Date().getFullYear(), idx: new Date().getMonth() + 1 });
  const [dari, sampai, s, e] = range(f.tipe, f.tahun, Number(f.idx));
  const rows = useRows({ status: "Dicairkan", cair_dari: dari, cair_sampai: sampai }, [dari, sampai]);
  const rekap = useMemo(() => org.cus.map((c) => {
    const rs = rows.filter((r) => r.cu_id === c.id);
    const g = (k) => rs.reduce((x, r) => x + (r.analisis?.[k] || 0), 0);
    return { id: c.id, kode: c.kode, nama: c.nama, n: rs.length, l: rs.filter((r) => r.jenis_kelamin === "L").length, p: rs.filter((r) => r.jenis_kelamin === "P").length, sanduk: g("sanduk_disetujui"), lalau: g("lalau_disetujui"), total: g("total_disetujui") };
  }), [rows, org.cus]);
  const idxOpts = { bulan: BULAN.map((b, i) => [String(i + 1), b]), triwulan: [1, 2, 3, 4].map((i) => [String(i), `Triwulan ${i}`]), semester: [["1", "Semester 1"], ["2", "Semester 2"]], tahun: [] }[f.tipe];
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "kode", label: "Kode", center: true },
    { key: "nama", label: "Credit Union" },
    { key: "n", label: "Jml Anggota", center: true, total: true },
    { key: "l", label: "L", center: true, total: true },
    { key: "p", label: "P", center: true, total: true },
    { key: "sanduk", label: "SANDUK", money: true, total: true },
    { key: "lalau", label: "LALAU", money: true, total: true },
    { key: "total", label: "JUMLAH", money: true, total: true },
  ];
  const label = f.tipe === "tahun" ? `Tahun ${f.tahun}` : `Periode ${BULAN[s - 1]}${s !== e ? ` - ${BULAN[e - 1]}` : ""} ${f.tahun}`;
  return (
    <ReportShell title="Rekap Saldo Total Pencairan Tudung per Credit Union" lines={[label]} fileName="Rekap_Pencairan"
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Periode"><SimpleSelect value={f.tipe} onChange={(v) => { set("tipe")(v || "bulan"); set("idx")("1"); }} placeholder="Bulanan" testid="rekap-tipe" options={[["triwulan", "Tiga Bulan"], ["semester", "Enam Bulan"], ["tahun", "Tahunan"]]} /></Field>
          <Field label="Tahun"><Input type="number" value={f.tahun} onChange={(ev) => set("tahun")(Number(ev.target.value))} data-testid="rekap-tahun" /></Field>
          {f.tipe !== "tahun" && <Field label="Bagian"><SimpleSelect value={String(f.idx)} onChange={(v) => set("idx")(v || "1")} placeholder="Pilih" testid="rekap-idx" options={idxOpts} /></Field>}
        </div>
      }>
      <ReportTable columns={cols} rows={rekap} labelSpan={3} />
    </ReportShell>
  );
}

function LapCU() {
  const { org } = useAuth();
  const cols = [
    { key: "no", label: "No.", center: true, render: (_, i) => i + 1 },
    { key: "kode", label: "Kode", center: true },
    { key: "nama", label: "Nama Credit Union" },
    { key: "manager", label: "Manager" },
    { key: "bagian_tudung", label: "Bagian Tudung" },
    { key: "alamat", label: "Alamat" },
    { key: "telepon", label: "Telepon" },
  ];
  return (
    <ReportShell title="Laporan Data Credit Union" lines={[`Jumlah: ${org.cus.length} Credit Union`]} fileName="Data_Credit_Union">
      <ReportTable columns={cols} rows={org.cus} />
    </ReportShell>
  );
}

const MAP = {
  permohonan: ["Laporan Data Permohonan", LapPermohonan],
  analisis: ["Laporan Data Analisis", LapAnalisis],
  pencairan: ["Laporan Pencairan Bantuan Tudung", LapPencairan],
  rekap: ["Rekap Pencairan per Credit Union", LapRekap],
  cu: ["Laporan Data Credit Union", LapCU],
  iuran: ["Laporan Iuran Tudung", LaporanIuran],
  "saldo-periode": ["Laporan Saldo Pencairan per Periode", LapSaldoPeriode],
  "penerima-periode": ["Laporan Jumlah Penerima (L/P) per Periode", LapGenderPeriode],
  "tidak-disetujui": ["Laporan Permohonan Tidak Disetujui", LapTidakDisetujui],
  tren: ["Tren Iuran & Pencairan", LapTren],
  usia: ["Laporan Anggota berdasarkan Usia", LapUsia],
  rating: ["Rating Credit Union", LapRating],
  perbandingan: ["Perbandingan Iuran vs Pencairan", LapPerbandingan],
  permil: ["Angka Kematian per Mil (‰)", LapPerMil],
};

export default function Laporan() {
  const { jenis } = useParams();
  const { isAdmin, can } = useAuth();
  const item = NAV.flatMap((g) => g.items).find((i) => i.to === `/laporan/${jenis}`);
  if (!MAP[jenis] || !item || !allowed(item, isAdmin, can)) return <Navigate to="/" replace />;
  const [title, Comp] = MAP[jenis] || MAP.permohonan;
  return (
    <div>
      <div className="no-print"><PageHeader title={title} subtitle={`Format A4/F4 dengan kop surat • ${KEJADIAN.meninggal} & ${KEJADIAN.cacat}`} /></div>
      <Comp key={jenis} />
    </div>
  );
}
