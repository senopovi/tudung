import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
import { Printer, FileSpreadsheet } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { api, tgl, todayISO } from "@/lib/api";

export function exportExcel(fileName) {
  const el = document.getElementById("report-table");
  if (!el) return;
  const wb = XLSX.utils.table_to_book(el, { raw: true, sheet: "Laporan" });
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

const Kop = ({ settings, p }) =>
  settings.kop_surat ? (
    <img src={settings.kop_surat} alt="Kop Surat" className="mb-3 w-full" data-testid="report-kop-image" />
  ) : (
    <div className="mb-3 border-b-[3px] border-double border-black pb-2 text-center" data-testid="report-kop-text">
      <p className="text-[15pt] font-extrabold uppercase leading-tight">{p.nama || "PUSKOPDIT"}</p>
      {p.nomor && <p className="text-[9pt]">Badan Hukum No. {p.nomor}</p>}
      <p className="text-[9pt]">{p.alamat}{p.telepon ? ` • Telp. ${p.telepon}` : ""}</p>
    </div>
  );

const TtdImg = ({ ttd, stempel }) => (
  <div className="relative mx-auto h-20 w-48">
    {stempel && <img src={stempel} alt="Stempel" className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 object-contain opacity-90" />}
    {ttd && <img src={ttd} alt="Tanda tangan" className="absolute left-1/2 top-1/2 h-16 max-w-[9rem] -translate-x-1/2 -translate-y-1/2 object-contain" />}
  </div>
);

export const Signatures = ({ p, tanggal, s = {} }) => (
  <div className="mt-8 grid grid-cols-2 gap-8 text-[10pt]" style={{ pageBreakInside: "avoid" }} data-testid="report-signatures">
    <div className="text-center">
      <p>&nbsp;</p>
      <p>Manager</p>
      <TtdImg ttd={s.ttd_manager} stempel={s.stempel_manager} />
      <p className="font-bold underline">{p.manager || "(.............................)"}</p>
    </div>
    <div className="text-center">
      <p data-testid="report-signature-date">{p.kota?.trim() ? `${p.kota.trim()}, ` : ""}{tgl(tanggal || todayISO())}</p>
      <p>Bagian Tudung</p>
      <TtdImg ttd={s.ttd_bagian} stempel={s.stempel_bagian} />
      <p className="font-bold underline">{p.bagian_tudung || "(.............................)"}</p>
    </div>
  </div>
);

const KERTAS = { A4: [210, 297], F4: [215, 330] };

export const ReportShell = ({ title, lines = [], fileName = "laporan", filters, children, ready = true, cuId }) => {
  const { org, user, isAdmin } = useAuth();
  const sigCu = cuId || (!isAdmin ? user?.cu_id : "");
  const [cuTtd, setCuTtd] = useState({});
  useEffect(() => { setCuTtd({}); if (sigCu) api.get(`/cu/${sigCu}/ttd`).then((r) => setCuTtd(r.data)).catch(() => {}); }, [sigCu]);
  const cuRow = sigCu && org.cus.find((c) => c.id === sigCu);
  const sigP = cuRow ? { kota: org.puskopdit.kota, manager: cuRow.manager, bagian_tudung: cuRow.bagian_tudung } : org.puskopdit;
  const sigS = cuRow ? cuTtd : org.settings;
  const key = `tudung-orientasi:${title}`;
  const [ori, setOri] = useState(() => localStorage.getItem(key) || "portrait");
  const pickOri = (v) => { if (!v) return; setOri(v); localStorage.setItem(key, v); };
  const kKey = `tudung-kertas:${title}`;
  const [kertas, setKertas] = useState(() => localStorage.getItem(kKey) || "A4");
  const pickKertas = (v) => { if (!v) return; setKertas(v); localStorage.setItem(kKey, v); };
  const [ttd, setTtd] = useState(todayISO());
  const [denganTtd, setDenganTtd] = useState(true);
  const [w, h] = KERTAS[kertas] || KERTAS.A4;
  const [pw, ph] = ori === "landscape" ? [h, w] : [w, h];
  return (
    <div className="space-y-5">
      <style>{`@page { size: ${pw}mm ${ph}mm; }`}</style>
      {filters && <div className="no-print rounded-lg border bg-white p-4 shadow-sm" data-testid="report-filters">{filters}</div>}
      <div className="no-print flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Switch checked={denganTtd} onCheckedChange={setDenganTtd} data-testid="report-with-signature-switch" />
          Cetak dengan tanda tangan
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Tgl. Tanda Tangan
          <Input type="date" value={ttd} onChange={(e) => setTtd(e.target.value || todayISO())} className="h-9 w-40" data-testid="report-signature-date-input" />
        </label>
        <ToggleGroup type="single" value={kertas} onValueChange={pickKertas} className="rounded-md border bg-white p-0.5" data-testid="report-paper-size">
          {Object.keys(KERTAS).map((k) => (
            <ToggleGroupItem key={k} value={k} size="sm" className="data-[state=on]:bg-[#155e46] data-[state=on]:text-white" data-testid={`report-paper-size-${k.toLowerCase()}`}>{k}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" value={ori} onValueChange={pickOri} className="rounded-md border bg-white p-0.5" data-testid="report-orientation">
          <ToggleGroupItem value="portrait" size="sm" className="data-[state=on]:bg-[#155e46] data-[state=on]:text-white" data-testid="report-orientation-portrait">Potret</ToggleGroupItem>
          <ToggleGroupItem value="landscape" size="sm" className="data-[state=on]:bg-[#155e46] data-[state=on]:text-white" data-testid="report-orientation-landscape">Lanskap</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" onClick={() => exportExcel(fileName)} disabled={!ready} data-testid="report-excel-btn">
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-700" /> Ekspor Excel
        </Button>
        <Button onClick={() => window.print()} disabled={!ready} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="report-print-btn">
          <Printer className="mr-2 h-4 w-4" /> Cetak / PDF
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className={`paper print-area ${ori === "landscape" ? "paper-landscape" : ""}`} style={{ maxWidth: `${pw}mm` }} data-testid="report-paper">
          <table className="print-wrap" data-testid="report-print-wrap">
            <thead><tr><td><Kop settings={org.settings} p={org.puskopdit} /></td></tr></thead>
            <tbody><tr><td>
              <div className="mb-3 text-center">
                <p className="text-[12pt] font-bold uppercase">{title}</p>
                {lines.filter(Boolean).map((l) => (
                  <p key={l} className="text-[10pt] font-semibold">{l}</p>
                ))}
              </div>
              {children}
              <Signatures p={sigP} tanggal={ttd} s={denganTtd ? sigS : {}} />
            </td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const ReportTable = ({ columns, rows, labelSpan = 3, empty = "Tidak ada data", rowClass }) => {
  const hasTotal = columns.some((c) => c.total);
  return (
    <table className="rpt-table" id="report-table" data-testid="report-table">
      <thead>
        <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={columns.length} className="ctr">{empty}</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={r.id || i} className={rowClass?.(r) || ""}>
            {columns.map((c) => {
              const v = c.render ? c.render(r, i) : r[c.key];
              return <td key={c.key} className={c.money ? "num" : c.center ? "ctr" : ""}>{c.money ? new Intl.NumberFormat("id-ID").format(v || 0) : v}</td>;
            })}
          </tr>
        ))}
      </tbody>
      {hasTotal && rows.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={labelSpan} className="ctr">JUMLAH</td>
            {columns.slice(labelSpan).map((c) => {
              if (!c.total) return <td key={c.key} />;
              const s = rows.reduce((a, r, i) => a + (Number(c.value ? c.value(r) : c.render ? c.render(r, i) : r[c.key]) || 0), 0);
              return <td key={c.key} className={c.money ? "num" : "ctr"}>{c.money ? new Intl.NumberFormat("id-ID").format(s) : s}</td>;
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );
};

export const PencairanTable = ({ rows }) => {
  const f = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
  const s = (fn) => rows.reduce((a, r) => a + (fn(r) || 0), 0);
  const a = (r) => r.analisis || {};
  return (
    <table className="rpt-table" id="report-table" data-testid="pencairan-report-table">
      <thead>
        <tr>
          <th rowSpan={2}>No.</th><th rowSpan={2}>Nama</th><th rowSpan={2}>BA</th>
          <th colSpan={2}>JK</th>
          <th rowSpan={2}>SANDUK</th><th rowSpan={2}>LALAU</th><th rowSpan={2}>JUMLAH</th>
        </tr>
        <tr><th>L</th><th>P</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={8} className="ctr">Tidak ada data</td></tr>}
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="ctr">{i + 1}</td>
            <td>{r.nama}</td>
            <td className="ctr">{r.nomor_anggota}</td>
            <td className="ctr">{r.jenis_kelamin === "L" ? 1 : ""}</td>
            <td className="ctr">{r.jenis_kelamin === "P" ? 1 : ""}</td>
            <td className="num">{f(a(r).sanduk_disetujui)}</td>
            <td className="num">{f(a(r).lalau_disetujui)}</td>
            <td className="num">{f(a(r).total_disetujui)}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr data-testid="pencairan-total-row">
            <td colSpan={3} className="ctr">JUMLAH</td>
            <td className="ctr">{rows.filter((r) => r.jenis_kelamin === "L").length}</td>
            <td className="ctr">{rows.filter((r) => r.jenis_kelamin === "P").length}</td>
            <td className="num">{f(s((r) => a(r).sanduk_disetujui))}</td>
            <td className="num">{f(s((r) => a(r).lalau_disetujui))}</td>
            <td className="num">{f(s((r) => a(r).total_disetujui))}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
};
