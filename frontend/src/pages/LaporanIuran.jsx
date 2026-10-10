import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Common";
import { CuSelect, RG } from "@/components/Controls";
import { ReportShell } from "@/components/Report";
import { useAuth } from "@/context/AuthContext";
import { api, BULAN } from "@/lib/api";

const f = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
const dd = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
const KEYS = ["sanduk", "lalau", "total", "biris", "gppk"];

const Cells = ({ r }) => (
  <>
    <td className="num">{r ? f(r.sanduk) : ""}</td>
    <td className="num">{r ? f(r.lalau) : ""}</td>
    <td className="num">{r ? f(r.total) : ""}</td>
    <td>{r?.keterangan}</td>
    <td className="num">{r ? f(r.biris) : ""}</td>
    <td className="num">{r ? f(r.gppk) : ""}</td>
    <td>{r?.keterangan2}</td>
  </>
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
    api.get("/iuran", { params: { cu_id: cu, dari: `${tahun - 1}-12-01`, sampai: `${tahun}-12-31` } }).then((r) => setRows(r.data));
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

  return (
    <ReportShell cuId={cu} title="Laporan Iuran Tudung" lines={[cuName, `Tahun Buku ${tahun}`, jenis === "rekap" ? "(Rekap Bulanan)" : null]} fileName={`Iuran_${cuName}_${tahun}_${jenis}`}
      filters={
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Credit Union"><CuSelect value={cu} onChange={setCu} disabled={!isAdmin} testid="lap-iuran-cu" /></Field>
          <Field label="Tahun Buku"><Input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} data-testid="lap-iuran-tahun" /></Field>
          <Field label="Jenis Laporan"><RG value={jenis} onChange={setJenis} testid="lap-iuran-jenis" options={[["detail", "Rincian per Pembayaran"], ["rekap", "Rekap per Bulan"]]} /></Field>
        </div>
      }>
      <table className="rpt-table" id="report-table" data-testid="iuran-report-table">
        <thead>
          <tr>
            <th rowSpan={2}>Bulan</th><th rowSpan={2}>Tanggal</th><th colSpan={2}>Iuran</th><th rowSpan={2}>Saldo</th><th rowSpan={2}>Keterangan</th>
            <th colSpan={2}>Iuran</th><th rowSpan={2}>Keterangan</th>
          </tr>
          <tr><th>Sanduk</th><th>Lalau</th><th>Biris Pangkaras</th><th>Sol. GPPK</th></tr>
        </thead>
        <tbody>
          {jenis === "rekap"
            ? months.map((mo) => (
              <tr key={mo.label}><td>{mo.label}</td><td className="ctr">{mo.agg?.tanggal}</td><Cells r={mo.agg} /></tr>
            ))
            : months.flatMap((mo) => (mo.items.length ? mo.items : [null]).map((r, i) => (
              <tr key={`${mo.label}-${r?.id || i}`}>
                {i === 0 && <td rowSpan={Math.max(mo.items.length, 1)}>{mo.label}</td>}
                <td className="ctr">{r ? dd(r.tanggal) + "/" + r.tanggal.slice(0, 4) : ""}</td>
                <Cells r={r} />
              </tr>
            )))}
        </tbody>
        <tfoot>
          <tr data-testid="iuran-report-total">
            <td>Jumlah</td><td /><td className="num">{f(tot.sanduk)}</td><td className="num">{f(tot.lalau)}</td><td className="num">{f(tot.total)}</td><td />
            <td className="num">{f(tot.biris)}</td><td className="num">{f(tot.gppk)}</td><td />
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}
