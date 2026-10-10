import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2, CheckCircle2, XCircle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, Field } from "@/components/Common";
import { RG, CuSelect } from "@/components/Controls";
import { MoneyInput } from "@/components/MoneyInput";
import { PdfUpload } from "@/components/PdfUpload";
import { SYARAT } from "@/components/PermohonanInfo";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, todayISO } from "@/lib/api";

const empty = (cu_id = "", tanggal_terima = todayISO()) => ({
  cu_id, tanggal_terima, jenis_simpanan: "perorangan", jenis_pinjaman: "perorangan", pernah_bantuan: "belum", jenis_kejadian: "meninggal",
  nama: "", nomor_anggota: "", jenis_kelamin: "", tgl_lahir: "", tgl_anggota: "", tgl_pinjam: "", tujuan_pinjaman: "",
  tgl_kejadian: "", penyebab: "", sanduk: 0, lalau: 0, total: 0,
  syarat: { surat_kematian: "ada", identitas: "ada", buku_anggota: "ada", buku_simpanan: "ada", spp: "tidak" },
  file_id: null, temp_file_id: null, file_name: null,
});

const Section = ({ title, children }) => (
  <section className="rounded-lg border bg-white p-5 shadow-sm md:p-6">
    <h2 className="mb-5 border-b pb-3 text-sm font-bold uppercase tracking-wider text-[#155e46]">{title}</h2>
    {children}
  </section>
);

export default function PermohonanForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const [d, setD] = useState(() => empty(isAdmin ? "" : user.cu_id));
  const [totalManual, setTotalManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/permohonan/${id}`).then(({ data }) => {
      setD({ ...empty(), ...data, tgl_pinjam: data.tgl_pinjam || "", temp_file_id: null });
      setTotalManual(data.total !== data.sanduk + data.lalau);
    });
  }, [id]);

  const set = (k) => (v) => setD((o) => {
    const n = { ...o, [k]: v?.target ? v.target.value : v };
    if (!totalManual && (k === "sanduk" || k === "lalau")) n.total = (n.sanduk || 0) + (n.lalau || 0);
    if (k === "tgl_pinjam") n.syarat = { ...n.syarat, spp: n.tgl_pinjam ? (o.tgl_pinjam ? o.syarat.spp : "ada") : "tidak" };
    return n;
  });
  const setSyarat = (k) => (v) => setD((o) => ({ ...o, syarat: { ...o.syarat, [k]: v } }));

  const required = ["cu_id", "tanggal_terima", "nama", "nomor_anggota", "jenis_kelamin", "tgl_lahir", "tgl_anggota", "tgl_kejadian"];
  const submit = async (e) => {
    e.preventDefault();
    const miss = required.filter((k) => !d[k]);
    if (miss.length) return setMsg({ ok: false, text: "Lengkapi isian wajib: Credit Union, Tanggal Terima, Nama, No. Anggota, Jenis Kelamin, Tgl Lahir, Tgl Jadi Anggota, Tgl Meninggal/CTT." });
    setBusy(true);
    try {
      const body = { ...d, tgl_pinjam: d.tgl_pinjam || null };
      if (id) await api.put(`/permohonan/${id}`, body);
      else await api.post("/permohonan", body);
      setMsg({ ok: true });
      if (!id) {
        setD(empty(d.cu_id, d.tanggal_terima));
        setTotalManual(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  const closeMsg = () => {
    const ok = msg?.ok;
    setMsg(null);
    if (ok && id) nav(-1);
  };

  return (
    <form onSubmit={submit} className="space-y-6 pb-24" data-testid="permohonan-form">
      <PageHeader title={id ? "Ubah Data Permohonan" : "Tambah Data Permohonan"} subtitle={id ? "Perubahan data akan mengembalikan status ke Antrian Analisis." : "Mode Tambah Data — Credit Union & Tanggal Terima tetap setelah simpan."}>
        <Button type="button" variant="outline" onClick={() => nav(-1)} data-testid="form-back-btn"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
      </PageHeader>

      <Section title="Asal Berkas">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Asal Credit Union *"><CuSelect value={d.cu_id} onChange={set("cu_id")} disabled={!isAdmin} testid="form-cu-select" /></Field>
          <Field label="Tanggal Terima Berkas *"><Input type="date" value={d.tanggal_terima} onChange={set("tanggal_terima")} data-testid="form-tanggal-terima" /></Field>
          <Field label="Jenis Saldo Simpanan"><RG value={d.jenis_simpanan} onChange={set("jenis_simpanan")} testid="form-jenis-simpanan" options={[["perorangan", "Saldo Simpanan Perorangan"], ["lembaga", "Saldo Simpanan Lembaga atas Nama Perorangan"]]} /></Field>
          <Field label="Jenis Saldo Pinjaman"><RG value={d.jenis_pinjaman} onChange={set("jenis_pinjaman")} testid="form-jenis-pinjaman" options={[["perorangan", "Saldo Pinjaman Perorangan"], ["lembaga", "Saldo Pinjaman Lembaga atas Nama Perorangan"]]} /></Field>
          <Field label="Pernah Menerima Bantuan Lalau Tudung?"><RG value={d.pernah_bantuan} onChange={set("pernah_bantuan")} testid="form-pernah-bantuan" options={[["belum", "Belum Pernah"], ["sudah", "Sudah Pernah"]]} /></Field>
          <Field label="Jenis Kejadian"><RG value={d.jenis_kejadian} onChange={set("jenis_kejadian")} testid="form-jenis-kejadian" options={[["meninggal", "Meninggal Dunia"], ["cacat", "Cacat Total Tetap"]]} /></Field>
        </div>
      </Section>

      <Section title="Data Anggota">
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Nama Anggota *" className="md:col-span-2"><Input value={d.nama} onChange={set("nama")} data-testid="form-nama" /></Field>
          <Field label="Nomor Anggota *"><Input value={d.nomor_anggota} onChange={set("nomor_anggota")} data-testid="form-nomor-anggota" className="font-mono" /></Field>
          <Field label="Jenis Kelamin *"><RG value={d.jenis_kelamin} onChange={set("jenis_kelamin")} testid="form-jk" options={[["L", "Laki-laki"], ["P", "Perempuan"]]} /></Field>
          <Field label="Tanggal Lahir *"><Input type="date" value={d.tgl_lahir} onChange={set("tgl_lahir")} data-testid="form-tgl-lahir" /></Field>
          <Field label="Tanggal Jadi Anggota *"><Input type="date" value={d.tgl_anggota} onChange={set("tgl_anggota")} data-testid="form-tgl-anggota" /></Field>
          <Field label="Tanggal Pinjam"><Input type="date" value={d.tgl_pinjam} onChange={set("tgl_pinjam")} data-testid="form-tgl-pinjam" /></Field>
          <Field label="Tujuan Pinjaman" className="md:col-span-2"><Input value={d.tujuan_pinjaman} onChange={set("tujuan_pinjaman")} data-testid="form-tujuan-pinjaman" /></Field>
          <Field label="Tanggal Meninggal / Cacat Total Tetap *"><Input type="date" value={d.tgl_kejadian} onChange={set("tgl_kejadian")} data-testid="form-tgl-kejadian" /></Field>
          <Field label="Penyebab Meninggal / Cacat Total Tetap" className="md:col-span-2"><Textarea rows={2} value={d.penyebab} onChange={set("penyebab")} data-testid="form-penyebab" /></Field>
        </div>
      </Section>

      <Section title="Saldo yang Diajukan">
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Sanduk (Saldo Simpanan)"><MoneyInput value={d.sanduk} onChange={set("sanduk")} testid="form-sanduk" /></Field>
          <Field label="Lalau (Saldo Pinjaman)"><MoneyInput value={d.lalau} onChange={set("lalau")} testid="form-lalau" /></Field>
          <Field label="Total Simpanan + Pinjaman">
            <MoneyInput value={d.total} onChange={(v) => { setTotalManual(true); setD((o) => ({ ...o, total: v })); }} testid="form-total" />
            {totalManual && (
              <button type="button" onClick={() => { setTotalManual(false); setD((o) => ({ ...o, total: o.sanduk + o.lalau })); }} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline" data-testid="form-total-auto">
                <RotateCcw className="h-3 w-3" /> Hitung otomatis
              </button>
            )}
          </Field>
        </div>
      </Section>

      <Section title="Syarat Administrasi & Berkas">
        <div className="divide-y rounded-md border">
          {SYARAT.map(([k, l]) => {
            const noLoan = k === "spp" && !d.tgl_pinjam;
            return (
              <div key={k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{l}</p>
                  {noLoan && <p className="text-xs text-amber-700" data-testid="spp-note">Tidak Ada — karena anggota ini tidak memiliki pinjaman.</p>}
                </div>
                <RG value={d.syarat[k]} onChange={setSyarat(k)} testid={`syarat-${k}`} disabled={noLoan} options={[["ada", "Ada"], ["tidak", "Tidak Ada"]]} />
              </div>
            );
          })}
        </div>
        <div className="mt-5">
          <PdfUpload
            label="File Gabungan Berkas Permohonan (PDF)"
            hint="Scan Form Permohonan, Surat Kematian/Ket. CTT, Identitas, Buku Anggota, Buku Simpanan Khusus, SPP — maks. 3 MB"
            fileId={d.file_id}
            tempId={d.temp_file_id}
            fileName={d.file_name}
            onChange={({ temp_id, file_name }) => setD((o) => ({ ...o, temp_file_id: temp_id, file_name }))}
            testid="form-berkas"
          />
        </div>
      </Section>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur lg:pl-72">
        <div className="mx-auto flex max-w-[1400px] justify-end">
          <Button type="submit" disabled={busy} className="min-w-[160px] bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="form-save-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Simpan
          </Button>
        </div>
      </div>

      <Dialog open={!!msg} onOpenChange={closeMsg}>
        <DialogContent data-testid="save-result-dialog">
          <DialogHeader>
            <div className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${msg?.ok ? "bg-emerald-100" : "bg-red-100"}`}>
              {msg?.ok ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : <XCircle className="h-6 w-6 text-red-600" />}
            </div>
            <DialogTitle className="text-center" data-testid="save-result-title">{msg?.ok ? "Data Permohonan Berhasil Disimpan" : "Data Permohonan Gagal Disimpan"}</DialogTitle>
            {msg?.text && <DialogDescription className="text-center">{msg.text}</DialogDescription>}
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button type="button" onClick={closeMsg} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="save-result-ok">OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
