import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Common";
import { CuSelect, RG } from "@/components/Controls";
import { ReportShell } from "@/components/Report";
import { useAuth } from "@/context/AuthContext";
import { api, BULAN } from "@/lib/api";

const f = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
const dd = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
const KEYS = ["sanduk", "lalau", "total", "biris", "gppk", "saldo2"];
const T1 = { a: "sanduk", b: "lalau", s: "total", k: "keterangan", la: "Sanduk", lb: "Lalau" };
const T2 = { a: "biris", b: "gppk", s: "saldo2", k: "keterangan2", la: "Biris Pangkaras", lb: "Sol. GPPK" };
const withSaldo2 = (r) => ({ ...r, saldo2: (r.biris || 0) + (r.gppk || 0) });

const Cells = ({ r, t }) => (
  <>
    <td className="num">{r ? f(r[t.a]) : ""}</td>
    <td className="num">{r ? f(r[t.b]) : ""}</td>
    <td className="num">{r ? f(r[t.s]) : ""}</td>
    <td>{r?.[t.k]}</td>
  </>
);

const IuranTable = ({ t, id, testid, jenis, months, tot }) => (
  <table className="rpt-table" id={id} data-testid={testid}>
    <thead>
      <tr><th rowSpan={2}>Bulan</th><th rowSpan={2}>Tanggal</th><th colSpan={2}>Iuran</th><th rowSpan={2}>Saldo</th><th rowSpan={2}>Keterangan</th></tr>
      <tr><th>{t.la}</th><th>{t.lb}</th></tr>
    </thead>
    <tbody>
      {jenis === "rekap"
        ? months.map((mo) => (
          <tr key={mo.label}><td>{mo.label}</td><td className="ctr">{mo.agg?.tanggal}</td><Cells r={mo.agg} t={t} /></tr>
        ))
        : months.flatMap((mo) => (mo.items.length ? mo.items : [null]).map((r, i) => (
          <tr key={`${mo.label}-${r?.id || i}`}>
            {i === 0 && <td rowSpan={Math.max(mo.items.length, 1)}>{mo.label}</td>}
            <td className="ctr">{r ? dd(r.tanggal) + "/" + r.tanggal.slice(0, 4) : ""}</td>
            <Cells r={r} t={t} />
          </tr>
        )))}
    </tbody>
    <tfoot>
      <tr data-testid={`${testid}-total`}>
        <td>Jumlah</td><td /><td className="num">{f(tot[t.a])}</td><td className="num">{f(tot[t.b])}</td><td className="num">{f(tot[t.s])}</td><td />
      </tr>
    </tfoot>
  </table>
);

const REKAP = [["sanduk", "Sanduk"], ["lalau", "Lalau"], ["biris", "Biris Pangkaras"], ["gppk", "Sol. GPPK"]];
const rekapTotal = (r) => REKAP.reduce((a, [k]) => a + (r?.[k] || 0), 0);

const RekapTable = ({ months, tot }) => (
  <table className="rpt-table" id="report-table-3" data-testid="iuran-rekap-table">
    <thead><tr><th>No.</th><th>Bulan</th>{REKAP.map(([k, l]) => <th key={k}>{l}</th>)}<th>Total Iuran</th></tr></thead>
    <tbody>
      {months.map((mo, i) => (
        <tr key={mo.label}>
          <td className="ctr">{i + 1}</td><td>{mo.label}</td>
          {REKAP.map(([k]) => <td key={k} className="num">{f(mo.agg?.[k])}</td>)}
          <td className="num">{f(rekapTotal(mo.agg))}</td>
        </tr>
      ))}
    </tbody>
    <tfoot>
      <tr data-testid="iuran-rekap-table-total">
        <td colSpan={2} className="ctr">JUMLAH</td>
        {REKAP.map(([k]) => <td key={k} className="num">{f(tot[k])}</td>)}
        <td className="num">{f(rekapTotal(tot))}</td>
      </tr>
    </tfoot>
  </table>
);

export default function LaporanIuran() {
  const { org, isAdmin, user } = useAuth();
  const [cu, setCu] = useState(isAdmin ? org.cus[0]?.id || "" : user.cu_id);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [jenis, setJenis] = useState("detail");
  const [rows, setRows] = useState([]);

  useEffect(() => { if (!cu && org.cus[0]) setCu(org.cus[0].id); }, [org.cus, cu]);
  useEffect(() => {
    if (!cu) return;
    api.get("/iuran", { params: { cu_id: cu, dari: `${tahun - 1}-12-01`, sampai: `${tahun}-12-31` } }).then((r) => setRows(r.data.map(withSaldo2)));
  }, [cu, tahun]);

  const months = useMemo(() => [{ y: tahun - 1, m: 12 }, ...BULAN.map((_, i) => ({ y: tahun, m: i + 1 }))].map((mo) => {
    const items = rows.filter((r) => Number(r.tanggal.slice(0, 4)) === mo.y && Number(r.tanggal.slice(5, 7)) === mo.m);
    const agg = items.length ? {
      ...Object.fromEntries(KEYS.map((k) => [k, items.reduce((a, r) => a + (r[k] || 0), 0)])),
      keterangan: items.map((r) => r.keterangan).filter(Boolean).join("; "),
      keterangan2: items.map((r) => r.keterangan2).filter(Boolean).join("; "),
      tanggal: items.map((r) => dd(r.tanggal)).join(", "),
    } : null;
    return { ...mo, label: `${BULAN[mo.m - 1]} ${mo.y}`, items, agg };
  }), [rows, tahun]);
  const tot = Object.fromEntries(KEYS.map((k) => [k, rows.reduce((a, r) => a + (r[k] || 0), 0)]));
  const cuName = org.cus.find((c) => c.id === cu)?.nama || "-";
  const rekapLine = jenis === "rekap" ? "(Rekap Bulanan)" : null;
  const props = { jenis, months, tot };

  return (
    <ReportShell cuId={cu} title="Laporan Iuran Tudung" lines={[cuName, `Tahun Buku ${tahun}`, rekapLine]} fileName={`Iuran_${cuName}_${tahun}_${jenis}`}
      extra={[
        { titles: ["Laporan Iuran", "Biris Pangkaras dan Solidaritas GPPK"], lines: [cuName, `Tahun Buku ${tahun}`, rekapLine],
          content: <IuranTable t={T2} id="report-table-2" testid="iuran-biris-report-table" {...props} /> },
        { titles: ["Rekap Tahunan Iuran"], lines: [cuName, `Tahun Buku ${tahun}`], testid: "report-rekap-page",
          content: <RekapTable months={months} tot={tot} /> },
      ]}
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Credit Union"><CuSelect value={cu} onChange={setCu} disabled={!isAdmin} testid="lap-iuran-cu" /></Field>
          <Field label="Tahun Buku"><Input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} data-testid="lap-iuran-tahun" /></Field>
          <Field label="Jenis Laporan"><RG value={jenis} onChange={setJenis} testid="lap-iuran-jenis" options={[["detail", "Rincian per Pembayaran"], ["rekap", "Rekap per Bulan"]]} /></Field>
        </div>
      }>
      <IuranTable t={T1} id="report-table" testid="iuran-report-table" {...props} />
    </ReportShell>
  );
}
