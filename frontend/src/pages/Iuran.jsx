import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect, Confirm } from "@/components/Controls";
import { MoneyInput } from "@/components/MoneyInput";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, rp, tglS, todayISO, sum } from "@/lib/api";

const blank = () => ({ tanggal: todayISO(), sanduk: 0, lalau: 0, keterangan: "", biris: 0, gppk: 0, keterangan2: "" });

const EntryRow = ({ e, i, onChange, onRemove, canRemove, ok }) => {
  const set = (k) => (v) => onChange({ ...e, [k]: v?.target ? v.target.value : v });
  const lock = (k) => (ok(k) ? null : <span className="ml-1 text-[10px] font-normal text-red-600">(tidak ada hak)</span>);
  return (
    <div className="relative rounded-md border bg-stone-50/60 p-4" data-testid={`iuran-entry-${i}`}>
      {canRemove && <button type="button" onClick={onRemove} className="absolute right-2 top-2 text-muted-foreground hover:text-red-600" data-testid={`iuran-entry-remove-${i}`}><X className="h-4 w-4" /></button>}
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-700">Pembayaran #{i + 1}</p>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Tanggal Bayar Iuran"><Input type="date" value={e.tanggal} onChange={set("tanggal")} data-testid={`iuran-tanggal-${i}`} /></Field>
        <Field label={<>Iuran Sanduk (Simpanan){lock("sanduk")}</>}><MoneyInput value={e.sanduk} onChange={set("sanduk")} disabled={!ok("sanduk")} testid={`iuran-sanduk-${i}`} /></Field>
        <Field label={<>Iuran Lalau (Pinjaman){lock("lalau")}</>}><MoneyInput value={e.lalau} onChange={set("lalau")} disabled={!ok("lalau")} testid={`iuran-lalau-${i}`} /></Field>
        <Field label="Total Iuran Tudung"><MoneyInput value={(e.sanduk || 0) + (e.lalau || 0)} onChange={() => {}} disabled testid={`iuran-total-${i}`} /></Field>
        <Field label="Keterangan Iuran Tudung" className="md:col-span-4"><Input value={e.keterangan} onChange={set("keterangan")} data-testid={`iuran-ket-${i}`} /></Field>
        <Field label={<>Saldo Biris Pangkaras{lock("biris")}</>}><MoneyInput value={e.biris} onChange={set("biris")} disabled={!ok("biris")} testid={`iuran-biris-${i}`} /></Field>
        <Field label={<>Iuran Solidaritas GPPK{lock("gppk")}</>}><MoneyInput value={e.gppk} onChange={set("gppk")} disabled={!ok("gppk")} testid={`iuran-gppk-${i}`} /></Field>
        <Field label="Keterangan Biris / GPPK" className="md:col-span-2"><Input value={e.keterangan2} onChange={set("keterangan2")} data-testid={`iuran-ket2-${i}`} /></Field>
      </div>
    </div>
  );
};

export default function Iuran() {
  const { isAdmin, user, can } = useAuth();
  const ok = (k) => can(`iuran_${k}`);
  const bolehInput = can("input_iuran") && ["sanduk", "lalau", "biris", "gppk"].some(ok);
  const bolehRow = (r) => ["sanduk", "lalau", "biris", "gppk"].every((k) => ok(k) || !r[k]);
  const [cu, setCu] = useState(isAdmin ? "" : user.cu_id);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [entries, setEntries] = useState([blank()]);
  const [editId, setEditId] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!cu) return setRows([]);
    api.get("/iuran", { params: { cu_id: cu, dari: `${tahun - 1}-12-01`, sampai: `${tahun}-12-31` } }).then((r) => setRows(r.data));
  }, [cu, tahun]);
  useEffect(load, [load]);

  const reset = () => { setEntries([blank()]); setEditId(null); };
  const save = async () => {
    if (!cu) return toast.error("Pilih Credit Union terlebih dahulu");
    if (entries.some((e) => !e.tanggal)) return toast.error("Tanggal bayar wajib diisi");
    setBusy(true);
    try {
      if (editId) await api.put(`/iuran/${editId}`, { ...entries[0], cu_id: cu });
      else await api.post("/iuran", { items: entries.map((e) => ({ ...e, cu_id: cu })) });
      toast.success("Data iuran berhasil disimpan");
      reset();
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menyimpan iuran"));
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => { await api.delete(`/iuran/${del.id}`); toast.success("Iuran dihapus"); setDel(null); load(); };

  return (
    <div className="space-y-6">
      <PageHeader title="Iuran Credit Union" subtitle="Iuran Tudung (Sanduk & Lalau), Biris Pangkaras dan Solidaritas GPPK per Credit Union." />
      <div className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-3">
        <Field label="Credit Union"><CuSelect value={cu} onChange={(v) => { setCu(v); reset(); }} disabled={!isAdmin} testid="iuran-cu-select" /></Field>
        <Field label="Tahun Buku"><Input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} data-testid="iuran-tahun" /></Field>
      </div>

      {bolehInput && cu && (
        <section className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" data-testid="iuran-form">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#155e46]">{editId ? "Ubah Data Iuran" : "Input Pembayaran Iuran"}</h2>
          {entries.map((e, i) => (
            <EntryRow key={i} e={e} i={i} ok={ok} canRemove={entries.length > 1} onChange={(n) => setEntries((a) => a.map((x, j) => (j === i ? n : x)))} onRemove={() => setEntries((a) => a.filter((_, j) => j !== i))} />
          ))}
          <div className="flex flex-wrap justify-between gap-2">
            {!editId ? (
              <Button type="button" variant="outline" onClick={() => setEntries((a) => [...a, blank()])} data-testid="iuran-add-row-btn"><Plus className="mr-2 h-4 w-4" /> Tambah Pembayaran (Rapel)</Button>
            ) : (
              <Button type="button" variant="outline" onClick={reset} data-testid="iuran-cancel-edit-btn">Batal Ubah</Button>
            )}
            <Button onClick={save} disabled={busy} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="iuran-save-btn">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Simpan Iuran
            </Button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full" data-testid="iuran-table">
          <thead>
            <tr>
              {["Tanggal", "Sanduk", "Lalau", "Total Tudung", "Keterangan", "Biris Pangkaras", "Sol. GPPK", "Keterangan", ""].map((h, i) => (
                <th key={i} className={`px-3 py-2.5 ${i >= 1 && i <= 3 ? "text-right" : i === 5 || i === 6 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{cu ? "Belum ada iuran pada tahun buku ini." : "Pilih Credit Union."}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{tglS(r.tanggal)}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.sanduk)}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.lalau)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{rp(r.total)}</td>
                <td className="px-3 py-2">{r.keterangan}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.biris)}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.gppk)}</td>
                <td className="px-3 py-2">{r.keterangan2}</td>
                <td className="px-3 py-2 text-right">
                  {bolehInput && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditId(r.id); setEntries([{ ...r }]); window.scrollTo({ top: 0, behavior: "smooth" }); }} data-testid={`iuran-edit-${r.id}`}><Pencil className="h-4 w-4 text-amber-700" /></Button>
                      {bolehRow(r) && <Button size="icon" variant="ghost" onClick={() => setDel(r)} data-testid={`iuran-delete-${r.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-[#f7f5ee] font-bold">
                <td className="px-3 py-2">Jumlah</td>
                <td className="px-3 py-2 text-right font-mono">{rp(sum(rows, (r) => r.sanduk))}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(sum(rows, (r) => r.lalau))}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(sum(rows, (r) => r.total))}</td>
                <td />
                <td className="px-3 py-2 text-right font-mono">{rp(sum(rows, (r) => r.biris))}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(sum(rows, (r) => r.gppk))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title="Hapus Iuran?" desc="Data iuran ini akan dihapus permanen." onConfirm={doDelete} />
    </div>
  );
}
