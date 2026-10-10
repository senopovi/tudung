import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Upload, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Field } from "@/components/Common";
import { MoneyInput } from "@/components/MoneyInput";
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
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);
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
      </div>
    </div>
  );
}
