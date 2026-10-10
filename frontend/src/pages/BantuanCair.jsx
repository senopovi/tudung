import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/Controls";
import { Input } from "@/components/ui/input";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect } from "@/components/Controls";
import { errMsg } from "@/lib/api";
import { ReportShell, PencairanTable } from "@/components/Report";
import { useAuth } from "@/context/AuthContext";
import { api, rp, tgl, tglS } from "@/lib/api";

export default function BantuanCair() {
  const { isAdmin } = useAuth();
  const [batches, setBatches] = useState([]);
  const [f, setF] = useState({ cu_id: "", dari: "", sampai: "" });
  const [cur, setCur] = useState(null);
  const [rows, setRows] = useState([]);
  const [batal, setBatal] = useState(false);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    api.get("/pencairan", { params }).then((r) => { setBatches(r.data); setCur(r.data[0] || null); });
  }, [f]);
  useEffect(load, [load]);
  const doBatal = async () => {
    setBatal(false);
    try {
      const { data } = await api.delete(`/pencairan/${cur.id}`);
      toast.success(`Pencairan ${cur.nomor} dibatalkan • ${data.dikembalikan} data kembali ke daftar siap cair`);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal membatalkan pencairan"));
    }
  };
  useEffect(() => {
    if (!cur) return setRows([]);
    api.get("/permohonan", { params: { pencairan_id: cur.id } }).then((r) => setRows([...r.data].sort((a, b) => a.nama.localeCompare(b.nama))));
  }, [cur]);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));

  return (
    <div>
      <PageHeader title="Daftar Bantuan yang Sudah Cair" subtitle="Pilih nomor pencairan untuk mencetak / mengekspor daftar." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="no-print space-y-3">
          <div className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm">
            {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="cair-filter-cu" /></Field>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dari"><Input type="date" value={f.dari} onChange={set("dari")} data-testid="cair-filter-dari" /></Field>
              <Field label="Sampai"><Input type="date" value={f.sampai} onChange={set("sampai")} data-testid="cair-filter-sampai" /></Field>
            </div>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto" data-testid="batch-list">
            {batches.length === 0 && <p className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">Belum ada pencairan.</p>}
            {batches.map((b) => (
              <button key={b.id} onClick={() => setCur(b)} data-testid={`batch-${b.id}`}
                className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:border-[#155e46] ${cur?.id === b.id ? "border-[#155e46] ring-2 ring-[#155e46]/20" : ""}`}>
                <p className="font-mono text-sm font-bold text-[#0d3b2e]">{b.nomor}</p>
                <p className="mt-1 text-xs text-muted-foreground">{b.cu_nama} • {tglS(b.tanggal)} • {b.jumlah_anggota} anggota</p>
                <p className="mt-1 font-mono text-sm font-semibold text-amber-700">Rp {rp(b.total)}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          {cur && isAdmin && (
            <div className="no-print mb-3 flex justify-start">
              <Button variant="outline" onClick={() => setBatal(true)} className="border-red-300 text-red-700 hover:bg-red-50" data-testid="batal-pencairan-btn">
                <Undo2 className="mr-2 h-4 w-4" /> Batalkan Pencairan Ini
              </Button>
            </div>
          )}
          {cur && (
            <ReportShell title="Daftar Pencairan Bantuan Tudung" lines={[`Nomor: ${cur.nomor}`, `Credit Union: ${cur.cu_nama}`, `Tanggal Pencairan: ${tgl(cur.tanggal)}`]} fileName={`Pencairan_${cur.nomor.replace(/\//g, "-")}`}>
              <PencairanTable rows={rows} />
            </ReportShell>
          )}
        </div>
      </div>
      <Confirm open={batal} onOpenChange={setBatal} confirmText="Batalkan Pencairan" title="Batalkan Pencairan?"
        desc={`Pencairan ${cur?.nomor} akan dihapus dan ${cur?.jumlah_anggota} data anggota dikembalikan ke daftar siap cair (Pencairan Tudung).`} onConfirm={doBatal} />
    </div>
  );
}
