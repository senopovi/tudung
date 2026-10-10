import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg, openPdf } from "@/lib/api";

const MAX = 3 * 1024 * 1024;

export const PdfUpload = ({ label, hint, fileId, tempId, fileName, onChange, testid, disabled }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const has = tempId || fileId;

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) return toast.error("Berkas harus berformat PDF");
    if (f.size > MAX) return toast.error("Ukuran berkas maksimal 3 MB");
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      const { data } = await api.post("/temp-files", fd);
      onChange({ temp_id: data.id, file_name: data.filename });
      toast.success("Berkas terunggah sementara. Klik Simpan untuk menyimpan permanen.");
    } catch (err) {
      toast.error(errMsg(err, "Gagal mengunggah berkas"));
    } finally {
      setBusy(false);
    }
  };

  const view = () => openPdf(tempId ? `/temp-files/${tempId}` : `/files/${fileId}`).catch(() => toast.error("Gagal membuka berkas"));

  return (
    <div className="rounded-md border border-dashed border-emerald-800/30 bg-emerald-50/40 p-4" data-testid={`${testid}-box`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-[#155e46] shadow-sm">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0d3b2e]">{label}</p>
          <p className="truncate text-xs text-muted-foreground" data-testid={`${testid}-name`}>
            {has ? fileName || "berkas.pdf" : hint || "PDF, maksimal 3 MB"}
            {tempId && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">SEMENTARA</span>}
            {!tempId && fileId && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">TERSIMPAN</span>}
          </p>
        </div>
        <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden" onChange={pick} data-testid={`${testid}-input`} />
        {has && (
          <Button type="button" variant="outline" size="sm" onClick={view} data-testid={`${testid}-view`}>
            <Eye className="mr-1.5 h-4 w-4" /> Lihat
          </Button>
        )}
        {!disabled && (
          <Button type="button" size="sm" onClick={() => ref.current?.click()} disabled={busy} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`${testid}-btn`}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {has ? "Ganti" : "Upload"}
          </Button>
        )}
      </div>
    </div>
  );
};
