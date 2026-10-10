import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const nf = new Intl.NumberFormat("id-ID");
const num = (v) => Number(String(v ?? "").replace(/[.\s]/g, "").replace(",", "."));

const downloadTemplate = (cus) => {
  const y = new Date().getFullYear();
  const rows = cus.length ? cus.map((c) => ({ "Kode CU": c.kode, Tahun: y, "Jumlah Anggota": c.jumlah_anggota || 0 })) : [{ "Kode CU": "", Tahun: y, "Jumlah Anggota": 0 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Jumlah Anggota");
  XLSX.writeFile(wb, "template-jumlah-anggota.xlsx");
};

const parseRows = (sheet, cus) => {
  const kodes = new Set(cus.map((c) => c.kode.trim().toUpperCase()));
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ""))
    .map((r) => {
      const row = { kode: String(r[0]).trim(), tahun: num(r[1]), jumlah: num(r[2]) };
      row.error = !kodes.has(row.kode.toUpperCase()) ? "Kode CU tidak ditemukan"
        : !Number.isInteger(row.tahun) || row.tahun < 1900 || row.tahun > 2100 ? "Tahun tidak valid"
        : !Number.isInteger(row.jumlah) || row.jumlah < 0 ? "Jumlah tidak valid" : "";
      return row;
    });
};

export const AnggotaImport = () => {
  const { org, loadOrg } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const bad = rows.filter((r) => r.error).length;
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const r = parseRows(wb.Sheets[wb.SheetNames[0]], org.cus);
      if (!r.length) toast.error("File tidak berisi data");
      setRows(r);
    } catch { toast.error("File Excel tidak dapat dibaca"); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/cu/anggota-import", { rows: rows.map(({ kode, tahun, jumlah }) => ({ kode, tahun, jumlah })) });
      await loadOrg(); toast.success(`${data.baris} baris diimpor untuk ${data.cu} Credit Union`);
      setOpen(false); setRows([]);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" onClick={() => { setRows([]); setOpen(true); }} data-testid="anggota-import-btn"><FileSpreadsheet className="mr-2 h-4 w-4" /> Impor Jumlah Anggota (Excel)</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="anggota-import-dialog">
          <DialogHeader><DialogTitle>Impor Jumlah Anggota per Tahun</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Format: satu baris per CU per tahun dengan kolom <b>Kode CU</b>, <b>Tahun</b>, <b>Jumlah Anggota</b>. Data tahun yang sudah ada akan ditimpa.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTemplate(org.cus)} data-testid="anggota-template-btn"><Download className="mr-2 h-4 w-4" /> Unduh Template</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md bg-[#155e46] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d3b2e]" data-testid="anggota-file-label">
              <Upload className="mr-2 h-4 w-4" /> Pilih File Excel
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} data-testid="anggota-file-input" />
            </label>
          </div>
          {rows.length > 0 && (
            <>
              <p className="text-sm" data-testid="anggota-import-summary">{rows.length - bad} baris valid{bad > 0 && <span className="text-red-700">, {bad} baris error</span>}</p>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="data-table w-full text-sm" data-testid="anggota-preview-table">
                  <thead><tr><th className="px-3 py-2 text-left">Kode CU</th><th className="px-3 py-2 text-left">Tahun</th><th className="px-3 py-2 text-right">Jumlah Anggota</th><th className="px-3 py-2 text-left">Keterangan</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t ${r.error ? "bg-red-50" : ""}`} data-testid={`anggota-preview-row-${i}`}>
                        <td className="px-3 py-1.5">{r.kode}</td><td className="px-3 py-1.5">{r.tahun || "-"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{Number.isFinite(r.jumlah) ? nf.format(r.jumlah) : "-"}</td>
                        <td className={`px-3 py-1.5 text-xs ${r.error ? "text-red-700" : "text-emerald-700"}`}>{r.error || "OK"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={!rows.length || bad > 0 || busy} onClick={save} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="anggota-import-save-btn">Simpan Impor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
