import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/Common";
import { PermohonanInfo } from "@/components/PermohonanInfo";
import { PdfUpload } from "@/components/PdfUpload";
import { useAuth } from "@/context/AuthContext";
import { api, rp, tgl } from "@/lib/api";

export default function PermohonanDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/permohonan/${id}`).then((r) => setP(r.data)); }, [id]);
  if (!p) return <p className="text-sm text-muted-foreground">Memuat...</p>;
  const a = p.analisis;

  return (
    <div className="space-y-6">
      <PageHeader title={p.nama} subtitle={`BA ${p.nomor_anggota} • ${p.cu_nama}`}>
        <Button variant="outline" onClick={() => nav(-1)} data-testid="detail-back-btn"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
        {p.status !== "Dicairkan" && <Button variant="outline" onClick={() => nav(`/permohonan/${id}/ubah`)} data-testid="detail-edit-btn"><Pencil className="mr-2 h-4 w-4" /> Ubah</Button>}
        {isAdmin && p.status !== "Dicairkan" && (
          <Button className="bg-[#155e46] hover:bg-[#0d3b2e]" onClick={() => nav(`/analisis/${id}`)} data-testid="detail-analisis-btn"><ScanSearch className="mr-2 h-4 w-4" /> Analisis</Button>
        )}
      </PageHeader>
      <div className="flex flex-wrap gap-2"><StatusBadge value={p.status} testid="detail-status" />{a && <StatusBadge value={a.hasil} testid="detail-hasil" />}</div>
      <div className="rounded-lg border bg-white p-6 shadow-sm"><PermohonanInfo p={p} /></div>
      <PdfUpload label="File Gabungan Berkas Permohonan" fileId={p.file_id} fileName={p.file_name} hint="Belum ada berkas diunggah" disabled testid="detail-berkas" onChange={() => {}} />
      {a && (
        <div className="grid gap-4 rounded-lg border bg-white p-6 shadow-sm sm:grid-cols-3" data-testid="detail-analisis-summary">
          <div><p className="text-xs uppercase text-muted-foreground">Sanduk Disetujui</p><p className="font-mono text-lg font-bold">Rp {rp(a.sanduk_disetujui)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Lalau Disetujui</p><p className="font-mono text-lg font-bold">Rp {rp(a.lalau_disetujui)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Total Disetujui</p><p className="font-mono text-lg font-bold text-[#155e46]">Rp {rp(a.total_disetujui)}</p></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">Dianalisis {tgl(a.tanggal_analisis)} oleh {a.analis}{p.nomor_pencairan ? ` • Dicairkan ${tgl(p.tanggal_cair)} No. ${p.nomor_pencairan}` : ""}</p>
        </div>
      )}
    </div>
  );
}
