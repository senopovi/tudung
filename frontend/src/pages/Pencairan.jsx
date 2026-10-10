import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HandCoins, RotateCcw, PauseCircle, PlayCircle, Loader2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, Field } from "@/components/Common";
import { CuSelect, SortTh } from "@/components/Controls";
import { api, errMsg, rp, tgl, tglS, sortRows, sum } from "@/lib/api";

const eligible = (r) => ["Disetujui", "Disetujui Sebagian"].includes(r.analisis?.hasil) && r.analisis?.total_disetujui > 0 && !r.tunda_pencairan;

export default function Pencairan() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [cu, setCu] = useState("");
  const [sel, setSel] = useState([]);
  const [sort, setSort] = useState({ key: "cu_nama", dir: "asc" });
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/permohonan", { params: { status: "Sudah Dianalisis", ...(cu ? { cu_id: cu } : {}) } }).then((r) => { setRows(r.data); setSel([]); });
  }, [cu]);
  useEffect(load, [load]);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const selRows = rows.filter((r) => sel.includes(r.id));
  const selCu = selRows[0]?.cu_id;

  const toggle = (r, v) => setSel((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)));
  const selectCu = () => setSel(rows.filter((r) => eligible(r) && r.cu_id === cu).map((r) => r.id));

  const openCair = async (items) => {
    const { data } = await api.get("/pencairan/nomor-berikutnya");
    setDlg({ items, nomor: data.nomor, tanggal: data.tanggal });
  };

  const cairkan = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/pencairan", { cu_id: dlg.items[0].cu_id, permohonan_ids: dlg.items.map((r) => r.id), nomor: dlg.nomor });
      toast.success(`Bantuan berhasil dicairkan • No. ${data.nomor}`, { action: { label: "Lihat", onClick: () => nav("/bantuan-cair") } });
      setDlg(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal mencairkan"));
    } finally {
      setBusy(false);
    }
  };

  const tunda = async (r) => {
    await api.post(`/permohonan/${r.id}/tunda`, { tunda: !r.tunda_pencairan });
    toast.success(r.tunda_pencairan ? "Penundaan dibatalkan" : "Pencairan ditunda");
    load();
  };

  return (
    <div>
      <PageHeader title="Pencairan Tudung" subtitle="Data analisis yang belum dicairkan. Pencairan tidak dapat digabung antar Credit Union.">
        {cu && <Button variant="outline" onClick={selectCu} data-testid="select-cu-all-btn"><CheckSquare className="mr-2 h-4 w-4" /> Pilih Semua (CU ini)</Button>}
        <Button disabled={!selRows.length} onClick={() => openCair(selRows)} className="bg-amber-600 hover:bg-amber-700" data-testid="cair-selected-btn">
          <HandCoins className="mr-2 h-4 w-4" /> Cairkan {selRows.length ? `${selRows.length} Terpilih` : "Terpilih"}
        </Button>
      </PageHeader>
      <div className="mb-4 max-w-sm"><Field label="Credit Union"><CuSelect value={cu} onChange={setCu} allowAll testid="pencairan-filter-cu" /></Field></div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full" data-testid="pencairan-table">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2.5" />
              <SortTh k="nama" label="Nama" sort={sort} setSort={setSort} />
              <SortTh k="nomor_anggota" label="BA" sort={sort} setSort={setSort} />
              <SortTh k="cu_nama" label="Credit Union" sort={sort} setSort={setSort} />
              <SortTh k="analisis.tanggal_analisis" label="Tgl Analisis" sort={sort} setSort={setSort} />
              <SortTh k="analisis.hasil" label="Hasil" sort={sort} setSort={setSort} />
              <th className="px-3 py-2.5 text-right">Sanduk</th>
              <th className="px-3 py-2.5 text-right">Lalau</th>
              <th className="px-3 py-2.5 text-right">Total Disetujui</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Tidak ada data analisis yang menunggu pencairan.</td></tr>}
            {sorted.map((r) => {
              const ok = eligible(r);
              const can = ok && (!selCu || selCu === r.cu_id);
              return (
                <tr key={r.id} className={`border-t ${r.tunda_pencairan ? "bg-orange-50/50" : ""}`} data-testid={`pencairan-row-${r.id}`}>
                  <td className="px-3 py-2"><Checkbox disabled={!can} checked={sel.includes(r.id)} onCheckedChange={(v) => toggle(r, v)} data-testid={`cair-check-${r.id}`} /></td>
                  <td className="px-3 py-2 font-medium">{r.nama}</td>
                  <td className="px-3 py-2 font-mono">{r.nomor_anggota}</td>
                  <td className="px-3 py-2">{r.cu_nama}</td>
                  <td className="px-3 py-2">{tglS(r.analisis?.tanggal_analisis)}</td>
                  <td className="px-3 py-2"><div className="flex flex-col gap-1"><StatusBadge value={r.analisis?.hasil} />{r.tunda_pencairan && <StatusBadge value="Ditunda" />}</div></td>
                  <td className="px-3 py-2 text-right font-mono">{rp(r.analisis?.sanduk_disetujui)}</td>
                  <td className="px-3 py-2 text-right font-mono">{rp(r.analisis?.lalau_disetujui)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{rp(r.analisis?.total_disetujui)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => nav(`/analisis/${r.id}`)} title="Analisis Ulang" data-testid={`reanalisis-${r.id}`}><RotateCcw className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => tunda(r)} title={r.tunda_pencairan ? "Batal Tunda" : "Tunda Pencairan"} data-testid={`tunda-${r.id}`}>
                        {r.tunda_pencairan ? <PlayCircle className="h-4 w-4 text-emerald-700" /> : <PauseCircle className="h-4 w-4 text-orange-600" />}
                      </Button>
                      <Button size="sm" disabled={!ok} onClick={() => openCair([r])} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`cair-${r.id}`}>Cairkan</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!dlg} onOpenChange={() => setDlg(null)}>
        <DialogContent data-testid="cair-dialog">
          <DialogHeader>
            <DialogTitle>Cairkan Bantuan Tudung</DialogTitle>
            <DialogDescription>{dlg?.items[0]?.cu_nama} • {dlg?.items.length} anggota • Tanggal cair {tgl(dlg?.tanggal)}</DialogDescription>
          </DialogHeader>
          {dlg && (
            <div className="space-y-4">
              <Field label="Nomor Pencairan (bisa diubah manual)"><Input value={dlg.nomor} onChange={(e) => setDlg({ ...dlg, nomor: e.target.value })} className="font-mono font-bold uppercase" data-testid="cair-nomor-input" /></Field>
              <div className="rounded-md bg-emerald-50 p-4 text-sm">
                <div className="flex justify-between"><span>Sanduk</span><span className="font-mono">Rp {rp(sum(dlg.items, (r) => r.analisis.sanduk_disetujui))}</span></div>
                <div className="flex justify-between"><span>Lalau</span><span className="font-mono">Rp {rp(sum(dlg.items, (r) => r.analisis.lalau_disetujui))}</span></div>
                <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Jumlah</span><span className="font-mono" data-testid="cair-total">Rp {rp(sum(dlg.items, (r) => r.analisis.total_disetujui))}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Batal</Button>
            <Button onClick={cairkan} disabled={busy} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="cair-confirm-btn">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />} Cairkan Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
