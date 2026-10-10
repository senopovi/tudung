import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Pencil, ScanSearch, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Field, StatusBadge } from "@/components/Common";
import { CuSelect } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, rp, tglS, KEJADIAN } from "@/lib/api";

export default function PermohonanTertahan({ hasil }) {
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [cu, setCu] = useState("");
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    api.get("/permohonan-tertahan", { params: { hasil, ...(cu ? { cu_id: cu } : {}) } }).then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [hasil, cu]);
  useEffect(load, [load]);
  const shown = rows.filter((r) => !q || `${r.nama} ${r.nomor_anggota}`.toLowerCase().includes(q.toLowerCase()));
  const slug = hasil === "Ditunda" ? "ditunda" : "tidak-disetujui";
  return (
    <div className="space-y-5" data-testid={`tertahan-page-${slug}`}>
      <PageHeader title={`Permohonan ${hasil}`} subtitle={`Ubah data atau analisis ulang permohonan dengan hasil ${hasil}. Data yang diubah kembali ke Antrian Analisis.`} />
      <div className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-2">
        {isAdmin && <Field label="Credit Union"><CuSelect value={cu} onChange={setCu} allowAll testid={`tertahan-${slug}-cu`} /></Field>}
        <Field label="Cari Nama / BA"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama atau BA" data-testid={`tertahan-${slug}-search`} /></Field>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full text-sm" data-testid={`tertahan-${slug}-table`}>
          <thead><tr className="bg-stone-50 text-left text-xs uppercase text-stone-600">
            <th className="px-3 py-2">Nama / BA</th><th className="px-3 py-2">Credit Union</th><th className="px-3 py-2">Kejadian</th>
            <th className="px-3 py-2 text-right">Diajukan</th><th className="px-3 py-2">Hasil</th><th className="px-3 py-2">Alasan</th><th className="px-3 py-2 text-right">Aksi</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Tidak ada permohonan {hasil}.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t align-top" data-testid={`tertahan-row-${r.id}`}>
                <td className="px-3 py-2"><p className="font-semibold">{r.nama}</p><p className="text-xs text-muted-foreground">BA {r.nomor_anggota} • Terima {tglS(r.tanggal_terima)}</p></td>
                <td className="px-3 py-2">{r.cu_nama}</td>
                <td className="px-3 py-2">{KEJADIAN[r.jenis_kejadian]}</td>
                <td className="px-3 py-2 text-right font-mono">{rp((r.sanduk || 0) + (r.lalau || 0))}</td>
                <td className="px-3 py-2"><StatusBadge value={r.hasil} />
                  {r.tunda_ctt && <p className="mt-1 flex items-center gap-1 text-[11px] text-orange-700" data-testid={`tertahan-ctt-${r.id}`}><Clock className="h-3 w-3" /> Otomatis dianalisis ulang {tglS(r.tgl_ctt_180)}</p>}
                  {r.lapor_pencairan_id && <p className="mt-1 text-[11px] text-muted-foreground">Sudah dimuat di surat pencairan</p>}
                </td>
                <td className="max-w-md px-3 py-2 text-xs text-stone-700">{r.alasan}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => nav(`/permohonan/${r.id}`)} title="Lihat" data-testid={`tertahan-view-${r.id}`}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => nav(`/permohonan/${r.id}/ubah`)} title="Ubah Data" data-testid={`tertahan-edit-${r.id}`}><Pencil className="h-4 w-4 text-amber-700" /></Button>
                  {isAdmin && <Button size="sm" variant="outline" onClick={() => nav(`/analisis/${r.id}`)} className="ml-1" data-testid={`tertahan-reanalisis-${r.id}`}><ScanSearch className="mr-1.5 h-4 w-4" /> Analisis Ulang</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
