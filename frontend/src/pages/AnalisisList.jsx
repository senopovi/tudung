import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ScanSearch, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect, SortTh, Confirm } from "@/components/Controls";
import { api, errMsg, rp, tglS, sortRows } from "@/lib/api";

export default function AnalisisList() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [cu, setCu] = useState("");
  const [sel, setSel] = useState([]);
  const [sort, setSort] = useState({ key: "tanggal_terima", dir: "asc" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/permohonan", { params: { status: "Antrian Analisis", ...(cu ? { cu_id: cu } : {}) } }).then((r) => { setRows(r.data); setSel([]); });
  }, [cu]);
  useEffect(load, [load]);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const targets = sel.length ? sel : rows.map((r) => r.id);

  const batch = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      const { data } = await api.post("/analisis-batch", { ids: targets });
      toast.success(`${data.dianalisis} Data Permohonan berhasil dianalisis`);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Analisis Data Permohonan" subtitle={`${rows.length} permohonan menunggu analisis`}>
        <Button onClick={() => setConfirm(true)} disabled={!rows.length || busy} className="bg-amber-600 hover:bg-amber-700" data-testid="analisis-batch-btn">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
          {sel.length ? `Analisis ${sel.length} Terpilih` : "Analisis Semua Sekaligus"}
        </Button>
      </PageHeader>
      <div className="mb-4 max-w-sm"><Field label="Credit Union"><CuSelect value={cu} onChange={setCu} allowAll testid="analisis-filter-cu" /></Field></div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full" data-testid="analisis-table">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2.5"><Checkbox checked={rows.length > 0 && sel.length === rows.length} onCheckedChange={(v) => setSel(v ? rows.map((r) => r.id) : [])} data-testid="analisis-select-all" /></th>
              <SortTh k="nama" label="Nama" sort={sort} setSort={setSort} />
              <SortTh k="nomor_anggota" label="BA" sort={sort} setSort={setSort} />
              <SortTh k="cu_nama" label="Credit Union" sort={sort} setSort={setSort} />
              <SortTh k="tanggal_terima" label="Tgl Terima" sort={sort} setSort={setSort} />
              <SortTh k="jenis_kejadian" label="Kejadian" sort={sort} setSort={setSort} />
              <th className="px-3 py-2.5 text-right">Sanduk</th>
              <th className="px-3 py-2.5 text-right">Lalau</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Tidak ada antrian analisis.</td></tr>}
            {sorted.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2"><Checkbox checked={sel.includes(r.id)} onCheckedChange={(v) => setSel((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)))} data-testid={`analisis-check-${r.id}`} /></td>
                <td className="px-3 py-2 font-medium">{r.nama}</td>
                <td className="px-3 py-2 font-mono">{r.nomor_anggota}</td>
                <td className="px-3 py-2">{r.cu_nama}</td>
                <td className="px-3 py-2">{tglS(r.tanggal_terima)}</td>
                <td className="px-3 py-2">{r.jenis_kejadian === "cacat" ? "Cacat Total Tetap" : "Meninggal"}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.sanduk)}</td>
                <td className="px-3 py-2 text-right font-mono">{rp(r.lalau)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{rp(r.total)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" onClick={() => nav(`/analisis/${r.id}`)} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`analisis-open-${r.id}`}><ScanSearch className="mr-1.5 h-4 w-4" /> Analisis</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Confirm open={confirm} onOpenChange={setConfirm} danger={false} confirmText="Analisis" title="Analisis Sekaligus?" desc={`${targets.length} Data Permohonan akan dianalisis otomatis dengan kriteria standar (tanpa kelonggaran/pengecualian).`} onConfirm={batch} />
    </div>
  );
}
