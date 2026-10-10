import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Upload, Trash2, Plus, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Field } from "@/components/Common";
import { MoneyInput } from "@/components/MoneyInput";
import { Confirm } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, todayISO } from "@/lib/api";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const Card = ({ title, children }) => (
  <section className="rounded-lg border bg-white p-6 shadow-sm">
    <h2 className="mb-5 border-b pb-3 text-sm font-bold uppercase tracking-wider text-[#155e46]">{title}</h2>
    {children}
  </section>
);

export default function Pengaturan() {
  const { org, loadOrg } = useAuth();
  const [s, setS] = useState(null);
  const ref = useRef(null);
  const [demo, setDemo] = useState(null);
  const [askReset, setAskReset] = useState(false);
  const [notif, setNotif] = useState([]);
  const [sending, setSending] = useState(false);
  const kirimUji = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/notifikasi/uji");
      toast.success(`Email uji dikirim ke ${data.penerima.join(", ")}. Periksa inbox/spam.`);
    } catch (e) { toast.error(errMsg(e, "Gagal mengirim email uji")); }
    finally { setSending(false); api.get("/notifikasi").then((r) => setNotif(r.data)); }
  };
  const loadDemo = () => api.get("/demo-data").then((r) => setDemo(r.data));
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); loadDemo(); api.get("/notifikasi").then((r) => setNotif(r.data)); }, []);
  if (!s) return <p className="text-sm text-muted-foreground">Memuat...</p>;
  const set = (k) => (v) => setS((o) => ({ ...o, [k]: v?.target ? Number(v.target.value) : v }));
  const setB = (i, k, v) => setS((o) => ({ ...o, sanduk_brackets: o.sanduk_brackets.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));

  const save = async () => {
    try {
      const { kop_surat, ...body } = s;
      await api.put("/settings", body);
      await loadOrg();
      toast.success("Pengaturan disimpan");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const uploadKop = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) return toast.error("Kop surat harus JPG atau PNG");
    const fd = new FormData();
    fd.append("file", f);
    try { await api.post("/settings/kop", fd); await loadOrg(); toast.success("Kop surat diperbarui"); } catch (er) { toast.error(errMsg(er)); }
  };
  const resetDemo = async () => {
    setAskReset(false);
    try {
      const { data } = await api.delete("/demo-data");
      await loadOrg();
      loadDemo();
      toast.success(`Data contoh dihapus: ${data.permohonan} permohonan, ${data.cu} Credit Union`);
      if (data.cu_dipertahankan.length) toast.warning(`CU ${data.cu_dipertahankan.join(", ")} dipertahankan karena sudah berisi data asli/iuran/user`);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const delKop = async () => { await api.delete("/settings/kop"); await loadOrg(); toast.success("Kop surat dihapus"); };
  const d = new Date(todayISO());

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan Aplikasi" subtitle="Plafon analisis, kop surat laporan, dan nomor pencairan.">
        <Button onClick={save} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="settings-save-btn"><Save className="mr-2 h-4 w-4" /> Simpan Pengaturan</Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Saldo Maksimal Sanduk per Usia Jadi Anggota">
          <div className="space-y-3">
            {s.sanduk_brackets.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-3" data-testid={`bracket-${i}`}>
                <Field label={`Usia ${i ? `> ${s.sanduk_brackets[i - 1].sampai}` : "0"} s/d (tahun)`}><Input type="number" step="0.5" value={b.sampai} onChange={(e) => setB(i, "sampai", Number(e.target.value))} data-testid={`bracket-sampai-${i}`} /></Field>
                <Field label="Maksimal Sanduk"><MoneyInput value={b.max} onChange={(v) => setB(i, "max", v)} testid={`bracket-max-${i}`} /></Field>
                <Button variant="ghost" size="icon" onClick={() => setS((o) => ({ ...o, sanduk_brackets: o.sanduk_brackets.filter((_, j) => j !== i) }))} data-testid={`bracket-remove-${i}`}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setS((o) => ({ ...o, sanduk_brackets: [...o.sanduk_brackets, { sampai: 70, max: 0 }] }))} data-testid="bracket-add-btn"><Plus className="mr-1.5 h-4 w-4" /> Tambah Rentang</Button>
            <p className="text-xs text-muted-foreground">Usia jadi anggota di atas rentang terakhir: Sanduk Tidak Disetujui.</p>
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <Field label="Maks Sanduk (lama anggota s/d 1 tahun)"><MoneyInput value={s.sanduk_max_anggota_baru} onChange={set("sanduk_max_anggota_baru")} testid="set-sanduk-baru" /></Field>
              <Field label="Saldo Maksimal Lalau (Pinjaman)"><MoneyInput value={s.lalau_max} onChange={set("lalau_max")} testid="set-lalau-max" /></Field>
            </div>
          </div>
        </Card>

        <Card title="Batas Waktu & Usia">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maks. lama terima berkas (hari)"><Input type="number" value={s.max_hari_berkas} onChange={set("max_hari_berkas")} data-testid="set-max-hari-berkas" /></Field>
            <Field label="Min. lama jadi anggota (hari)"><Input type="number" value={s.min_hari_anggota} onChange={set("min_hari_anggota")} data-testid="set-min-hari-anggota" /></Field>
            <Field label="Masa endap Cacat Total Tetap (hari)"><Input type="number" value={s.hari_cacat} onChange={set("hari_cacat")} data-testid="set-hari-cacat" /></Field>
            <Field label="Batas usia (tahun)"><Input type="number" value={s.usia_max} onChange={set("usia_max")} data-testid="set-usia-max" /></Field>
            <Field label="Usia minimal pinjam (tahun)"><Input type="number" value={s.usia_min_pinjam} onChange={set("usia_min_pinjam")} data-testid="set-usia-min-pinjam" /></Field>
          </div>
        </Card>

        <Card title="Nomor Surat Pencairan">
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Nomor urut berikutnya"><Input type="number" min={1} value={s.nomor_berikutnya} onChange={set("nomor_berikutnya")} data-testid="set-nomor-berikutnya" /></Field>
            <div className="rounded-md bg-emerald-50 px-4 py-2.5">
              <p className="text-[11px] uppercase text-muted-foreground">Contoh nomor berikutnya</p>
              <p className="font-mono font-bold text-[#0d3b2e]" data-testid="nomor-preview">{s.nomor_berikutnya}/T/PUSAKA/{ROMAN[d.getMonth()]}/{d.getFullYear()}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Setelah pencairan, nomor urut otomatis bertambah. Nomor juga dapat diubah manual saat pencairan.</p>
        </Card>

        <Card title="Kop Surat Laporan">
          <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={uploadKop} data-testid="kop-input" />
          {org.settings.kop_surat ? (
            <img src={org.settings.kop_surat} alt="Kop surat" className="mb-4 w-full rounded border" data-testid="kop-preview" />
          ) : (
            <p className="mb-4 rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada kop surat. Laporan memakai kop teks dari Data PUSKOPDIT.</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => ref.current?.click()} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="kop-upload-btn"><Upload className="mr-2 h-4 w-4" /> Upload JPG/PNG</Button>
            {org.settings.kop_surat && <Button variant="outline" onClick={delKop} data-testid="kop-delete-btn"><Trash2 className="mr-2 h-4 w-4" /> Hapus</Button>}
          </div>
        </Card>

        <Card title="Notifikasi Email Defisit">
          <p className="text-sm text-muted-foreground">Email otomatis dikirim ke semua Admin Pusat aktif setiap kali ada Credit Union yang baru masuk status defisit (pencairan melebihi iuran tahun berjalan). Pengecekan berjalan setelah pencairan, batal pencairan, dan perubahan iuran.</p>
          <Button onClick={kirimUji} disabled={sending} variant="outline" className="mt-4" data-testid="kirim-email-uji-btn">
            <Send className="mr-2 h-4 w-4" /> {sending ? "Mengirim..." : "Kirim email uji"}
          </Button>
          <div className="mt-4 space-y-2" data-testid="notif-log">
            {notif.length === 0 && <p className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada notifikasi terkirim.</p>}
            {notif.map((n) => (
              <div key={n.id} className="rounded-md border px-3 py-2 text-xs">
                <div className="flex justify-between gap-2"><b>{n.cu.join(", ")}</b><span className={n.terkirim ? "text-emerald-700" : "text-red-600"}>{n.terkirim ? "Terkirim" : `Gagal (${n.info})`}</span></div>
                <p className="text-muted-foreground">{new Date(n.created_at).toLocaleString("id-ID")} • ke {n.penerima.join(", ")}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Reset Data Contoh">
          <p className="text-sm text-muted-foreground" data-testid="demo-info">
            {demo ? `Tersisa ${demo.permohonan} permohonan contoh dan ${demo.cu} Credit Union contoh (CUG-001 s/d CUG-006).` : "Memuat..."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Menghapus semua permohonan contoh beserta berkas & pencairannya. Credit Union contoh yang sudah berisi data asli, iuran, atau user tetap dipertahankan.</p>
          <Button variant="outline" disabled={!demo || (!demo.permohonan && !demo.cu)} onClick={() => setAskReset(true)} className="mt-4 border-red-300 text-red-700 hover:bg-red-50" data-testid="demo-reset-btn">
            <Trash2 className="mr-2 h-4 w-4" /> Hapus Semua Data Contoh
          </Button>
        </Card>
      </div>
      <Confirm open={askReset} onOpenChange={setAskReset} confirmText="Hapus Data Contoh" title="Hapus semua data contoh?" desc="Permohonan contoh, berkas, pencairan, dan Credit Union contoh akan dihapus permanen. Tindakan ini tidak dapat dibatalkan." onConfirm={resetDemo} />
    </div>
  );
}
