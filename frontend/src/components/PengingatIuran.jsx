import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Common";
import { RG } from "@/components/Controls";
import { api, errMsg } from "@/lib/api";

export const kirimPengingatIuran = async () => {
  try {
    const { data: h } = await api.post("/notifikasi/iuran");
    const info = [h.sudah && `${h.sudah} CU sudah diingatkan bulan ini`, h.tanpa_petugas && `${h.tanpa_petugas} CU tanpa petugas aktif`, h.gagal && `${h.gagal} gagal`].filter(Boolean).join(" • ");
    (h.terkirim ? toast.success : toast.info)(`Pengingat terkirim ke ${h.terkirim} CU${info ? ` • ${info}` : ""}`);
    return true;
  } catch (e) { toast.error(errMsg(e)); return false; }
};

export const PengingatIuran = ({ s, set, onSent }) => {
  const [busy, setBusy] = useState(false);
  const mode = String(s.iuran_reminder_mode ?? 0);
  const kirim = async () => { setBusy(true); await kirimPengingatIuran(); setBusy(false); onSent?.(); };
  return (
    <div className="space-y-4" data-testid="pengingat-iuran">
      <Field label="Mode pengiriman">
        <RG value={mode} onChange={(v) => set("iuran_reminder_mode")(Number(v))} testid="iuran-reminder-mode" options={[["1", "Otomatis"], ["2", "Manual (klik dulu)"], ["0", "Nonaktif"]]} />
      </Field>
      <div className="max-w-xs">
        <Field label="Tanggal kirim setiap bulan (1-28)">
          <Input type="number" min={1} max={28} value={s.iuran_reminder_tanggal ?? 25} disabled={mode === "0"}
            onChange={(e) => set("iuran_reminder_tanggal")(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} data-testid="iuran-reminder-tanggal" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Email dikirim ke semua petugas aktif dari CU yang belum mencatat iuran bulan berjalan, paling banyak sekali per CU per bulan.
        Otomatis: dikirim pukul 08.00 WIB mulai tanggal di atas. Manual: mulai tanggal di atas, Dashboard Admin menampilkan tombol kirim. Klik Simpan Pengaturan setelah mengubah.
      </p>
      <Button variant="outline" onClick={kirim} disabled={busy} data-testid="kirim-pengingat-iuran-btn"><Send className="mr-2 h-4 w-4" /> {busy ? "Mengirim..." : "Kirim Pengingat Sekarang"}</Button>
    </div>
  );
};
