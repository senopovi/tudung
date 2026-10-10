import { useRef } from "react";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";

const SLOTS = [["manager", "Manager"], ["bagian", "Bagian Tudung"]];

const Slot = ({ slot, label, img, base, onChange }) => {
  const ref = useRef(null);
  const upload = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) return toast.error("Gambar harus JPG atau PNG");
    if (f.size > 1024 * 1024) return toast.error("Ukuran gambar maksimal 1 MB");
    const fd = new FormData(); fd.append("file", f);
    try { await api.post(`${base}/${slot}`, fd); await onChange(); toast.success(`${label} diperbarui`); } catch (er) { toast.error(errMsg(er)); }
  };
  const del = async () => { try { await api.delete(`${base}/${slot}`); await onChange(); toast.success(`${label} dihapus`); } catch (er) { toast.error(errMsg(er)); } };
  return (
    <div className="space-y-2" data-testid={`ttd-slot-${slot}`}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex h-24 items-center justify-center rounded border border-dashed bg-[repeating-conic-gradient(#f4f4f0_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
        {img ? <img src={img} alt={label} className="max-h-20 max-w-full object-contain" data-testid={`ttd-preview-${slot}`} /> : <span className="text-xs text-muted-foreground">Belum ada</span>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={upload} data-testid={`ttd-input-${slot}`} />
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()} data-testid={`ttd-upload-${slot}`}><Upload className="mr-1.5 h-3.5 w-3.5" /> Unggah</Button>
        {img && <Button size="sm" variant="ghost" onClick={del} data-testid={`ttd-delete-${slot}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
      </div>
    </div>
  );
};

export const TtdUpload = ({ data = {}, base = "/settings/ttd", onChange, names = {} }) => (
  <div className="space-y-5">
    {SLOTS.map(([k, l]) => (
      <div key={k} className="grid gap-4 sm:grid-cols-2">
        <Slot slot={`ttd_${k}`} label={`Tanda Tangan ${l}${names[k] ? ` (${names[k]})` : ""}`} img={data[`ttd_${k}`]} base={base} onChange={onChange} />
        <Slot slot={`stempel_${k}`} label={`Stempel ${l}`} img={data[`stempel_${k}`]} base={base} onChange={onChange} />
      </div>
    ))}
    <p className="text-xs text-muted-foreground">PNG berlatar transparan memberi hasil terbaik. Maks. 1 MB per gambar. Stempel dicetak sedikit menumpuk di samping tanda tangan.</p>
  </div>
);
