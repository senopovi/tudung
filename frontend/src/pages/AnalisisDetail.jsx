import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save, Loader2, CalendarClock, Cake, Landmark, HeartCrack, CalendarHeart, Wallet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, StatusBadge, Field } from "@/components/Common";
import { RG } from "@/components/Controls";
import { MoneyInput } from "@/components/MoneyInput";
import { PdfUpload } from "@/components/PdfUpload";
import { PermohonanInfo } from "@/components/PermohonanInfo";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, rp, tgl, ymdLong } from "@/lib/api";

const DEF = {
  kelonggaran_berkas: false, sanduk_saldo_70: null, sanduk_alasan: "", lalau_override: false, lalau_alasan: "", lalau_manual: null,
  lalau_file_id: null, lalau_temp_id: null, lalau_file_name: null, cacat_override: false, cacat_alasan: "", cacat_file_id: null,
  cacat_temp_id: null, cacat_file_name: null, berkas_lengkap: null, keputusan_berkas: "Ditunda", catatan: "",
};

const Info = ({ icon: Icon, n, label, value, sub, warn, testid, children }) => (
  <div className={`rounded-lg border p-4 shadow-sm ${warn ? "border-red-300 bg-red-50/60" : "bg-white"}`} data-testid={testid}>
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] text-amber-800">{n}</span>
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <p className={`mt-2 text-lg font-bold ${warn ? "text-red-700" : "text-[#0d3b2e]"}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    {children}
  </div>
);

const Notes = ({ items, testid }) => (items?.length ? (
  <ul className="mt-3 space-y-1.5" data-testid={testid}>
    {items.map((t) => <li key={t} className="flex gap-2 text-xs text-stone-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{t}</li>)}
  </ul>
) : null);

const Panel = ({ title, children, tone = "emerald" }) => (
  <section className={`rounded-lg border bg-white p-5 shadow-sm ${tone === "amber" ? "border-t-4 border-t-amber-500" : "border-t-4 border-t-[#155e46]"}`}>
    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#155e46]">{title}</h3>
    {children}
  </section>
);

const Amt = ({ label, v, strong, testid }) => (
  <div className="flex justify-between py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-mono tabular-nums ${strong ? "font-bold text-[#155e46]" : ""}`} data-testid={testid}>Rp {rp(v)}</span>
  </div>
);

export default function AnalisisDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { org } = useAuth();
  const [p, setP] = useState(null);
  const [inp, setInp] = useState(DEF);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    api.get(`/permohonan/${id}`).then(({ data }) => {
      setP(data);
      if (data.analisis) setInp(Object.fromEntries(Object.keys(DEF).map((k) => [k, data.analisis[k] ?? DEF[k]])));
    });
  }, [id]);

  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => {
      api.post(`/analisis/${id}/preview`, inp).then((r) => {
        setRes(r.data);
        if (first.current && inp.berkas_lengkap === null) setInp((o) => ({ ...o, berkas_lengkap: r.data.berkas_lengkap }));
        first.current = false;
      }).catch((e) => toast.error(errMsg(e)));
    }, first.current ? 0 : 300);
    return () => clearTimeout(t);
  }, [inp, p, id]);

  const set = (k) => (v) => setInp((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/analisis/${id}`, inp);
      toast.success("Data Permohonan Sudah Dianalisis");
      nav(-1);
    } catch (e) {
      toast.error(errMsg(e, "Gagal menyimpan analisis"));
    } finally {
      setBusy(false);
    }
  };

  if (!p || !res) return <p className="text-sm text-muted-foreground">Memuat analisis...</p>;
  const s = org.settings;
  const overBerkas = res.lama_berkas > (s.max_hari_berkas ?? 100);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title={`Analisis: ${p.nama}`} subtitle={`BA ${p.nomor_anggota} • ${p.cu_nama} • Terima berkas ${tgl(p.tanggal_terima)}`}>
        <Button variant="outline" onClick={() => nav(-1)} data-testid="analisis-back-btn"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
        <Button variant="outline" onClick={() => nav(`/permohonan/${id}/ubah`)} data-testid="analisis-edit-btn"><Pencil className="mr-2 h-4 w-4" /> Ubah Data</Button>
        <Button onClick={save} disabled={busy} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="analisis-save-btn">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Simpan Hasil Analisis
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-6 rounded-lg bg-[#0d3b2e] p-5 text-white shadow-sm" data-testid="analisis-result-banner">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">Hasil Analisis</p>
          <div className="mt-2"><StatusBadge value={res.hasil} testid="analisis-hasil" /></div>
        </div>
        {[["Sanduk Disetujui", res.sanduk_disetujui, "res-sanduk"], ["Lalau Disetujui", res.lalau_disetujui, "res-lalau"], ["Total Disetujui", res.total_disetujui, "res-total"]].map(([l, v, t]) => (
          <div key={l} className="border-l border-white/15 pl-6">
            <p className="text-[11px] uppercase tracking-wider text-emerald-100/70">{l}</p>
            <p className="font-mono text-xl font-bold tabular-nums" data-testid={t}>Rp {rp(v)}</p>
          </div>
        ))}
        {res.catatan_umum.length > 0 && (
          <div className="w-full space-y-1 border-t border-white/10 pt-3 text-xs text-amber-100" data-testid="analisis-catatan-umum">
            {res.catatan_umum.map((t) => <p key={t} className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{t}</p>)}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Info n={1} icon={CalendarClock} label="Lama Terima Berkas" value={`${res.lama_berkas} hari`} sub={`Dari tgl kejadian s/d tgl terima berkas • batas ${s.max_hari_berkas} hari`} warn={overBerkas && !inp.kelonggaran_berkas} testid="info-lama-berkas">
          {overBerkas && (
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-800">
              <Switch checked={inp.kelonggaran_berkas} onCheckedChange={set("kelonggaran_berkas")} data-testid="kelonggaran-switch" /> Berikan kelonggaran (boleh dicairkan)
            </label>
          )}
        </Info>
        <Info n={2} icon={Landmark} label="Usia Jadi Anggota" value={ymdLong(res.usia_anggota)} sub={`Lama jadi anggota s/d kejadian: ${res.lama_anggota_hari} hari`} testid="info-usia-anggota" />
        <Info n={3} icon={Wallet} label="Usia Saat Pinjam" value={res.usia_pinjam ? ymdLong(res.usia_pinjam) : "Tidak ada pinjaman"} testid="info-usia-pinjam" />
        <Info n={4} icon={HeartCrack} label={`Usia ${p.jenis_kejadian === "cacat" ? "Cacat Total Tetap" : "Meninggal Dunia"}`} value={ymdLong(res.usia_kejadian)} warn={res.lewat_70} sub={res.lewat_70 ? "Di atas 70 tahun" : null} testid="info-usia-kejadian" />
        <Info n={5} icon={Cake} label="Tanggal Usia 70 Tahun" value={tgl(res.tgl_70)} testid="info-tgl-70" />
        <Info n={6} icon={CalendarHeart} label="Saldo Diajukan" value={`Rp ${rp(res.total_diajukan)}`} sub={`Sanduk Rp ${rp(res.sanduk_diajukan)} • Lalau Rp ${rp(res.lalau_diajukan)}`} testid="info-saldo" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Analisis Sanduk (Saldo Simpanan)">
          <Amt label="Diajukan" v={res.sanduk_diajukan} />
          <Amt label="Disetujui" v={res.sanduk_disetujui} strong testid="panel-sanduk-disetujui" />
          <Notes items={res.catatan_sanduk} testid="notes-sanduk" />
          {res.lewat_70 && res.sanduk_diajukan > 0 && (
            <div className="mt-4 space-y-3 rounded-md bg-amber-50 p-4">
              <Field label="Saldo Simpanan Saat Usia 70 Tahun"><MoneyInput value={inp.sanduk_saldo_70} onChange={set("sanduk_saldo_70")} allowEmpty placeholder="Isi saldo saat usia 70 tahun" testid="sanduk-saldo-70" /></Field>
              <Field label="Alasan Disetujui Sebagian"><Textarea rows={2} value={inp.sanduk_alasan} onChange={set("sanduk_alasan")} data-testid="sanduk-alasan" /></Field>
            </div>
          )}
        </Panel>

        <Panel title="Analisis Lalau (Saldo Pinjaman)">
          <Amt label="Diajukan" v={res.lalau_diajukan} />
          <Amt label="Disetujui" v={res.lalau_disetujui} strong testid="panel-lalau-disetujui" />
          <Notes items={res.catatan_lalau} testid="notes-lalau" />
          {res.lewat_70 && res.lalau_diajukan > 0 && (
            <div className="mt-4 space-y-3 rounded-md bg-amber-50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={inp.lalau_override} onCheckedChange={set("lalau_override")} data-testid="lalau-override-switch" /> Setujui Lalau usia di atas 70 tahun</label>
              {inp.lalau_override && (
                <>
                  <Field label="Alasan (wajib bila tanpa surat keputusan)"><Textarea rows={2} value={inp.lalau_alasan} onChange={set("lalau_alasan")} data-testid="lalau-alasan" /></Field>
                  <PdfUpload label="Surat Permintaan dari Credit Union" hint="Surat CU agar Lalau anggota usia > 70 th disetujui (PDF, maks 3 MB)" fileId={inp.lalau_file_id} tempId={inp.lalau_temp_id} fileName={inp.lalau_file_name}
                    onChange={({ temp_id, file_name }) => setInp((o) => ({ ...o, lalau_temp_id: temp_id, lalau_file_name: file_name }))} testid="lalau-berkas" />
                  <Field label="Saldo Pinjaman Disetujui (kosongkan = sesuai permohonan)"><MoneyInput value={inp.lalau_manual} onChange={set("lalau_manual")} allowEmpty placeholder={rp(res.lalau_diajukan)} testid="lalau-manual" /></Field>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Kelengkapan Berkas" tone="amber">
          <PdfUpload label="File Gabungan Berkas Permohonan" fileId={p.file_id} fileName={p.file_name} hint="Belum ada berkas diunggah saat input permohonan" disabled testid="analisis-berkas" onChange={() => {}} />
          <div className="mt-4 space-y-3">
            <Field label="Berkas Lengkap?"><RG value={inp.berkas_lengkap ? "ya" : "tidak"} onChange={(v) => set("berkas_lengkap")(v === "ya")} testid="berkas-lengkap" options={[["ya", "Lengkap"], ["tidak", "Tidak Lengkap"]]} /></Field>
            {!inp.berkas_lengkap && (
              <Field label="Keputusan bila berkas tidak lengkap"><RG value={inp.keputusan_berkas} onChange={set("keputusan_berkas")} testid="keputusan-berkas" options={[["Ditunda", "Ditunda"], ["Tidak Disetujui", "Tidak Disetujui"]]} /></Field>
            )}
            <Field label="Catatan Analisis"><Textarea rows={2} value={inp.catatan} onChange={set("catatan")} data-testid="analisis-catatan" /></Field>
          </div>
        </Panel>

        {p.jenis_kejadian === "cacat" ? (
          <Panel title="Analisis Cacat Total Tetap" tone="amber">
            <p className="text-sm">Lama mengendap sejak terima berkas: <b data-testid="cacat-hari">{res.hari_mengendap} hari</b> dari {s.hari_cacat} hari.</p>
            {res.hari_mengendap < s.hari_cacat && (
              <div className="mt-4 space-y-3 rounded-md bg-amber-50 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={inp.cacat_override} onCheckedChange={set("cacat_override")} data-testid="cacat-override-switch" /> Setujui lebih cepat sebelum {s.hari_cacat} hari</label>
                {inp.cacat_override && (
                  <>
                    <Field label="Alasan dicairkan lebih cepat"><Textarea rows={2} value={inp.cacat_alasan} onChange={set("cacat_alasan")} data-testid="cacat-alasan" /></Field>
                    <PdfUpload label="Berkas Hasil Keputusan" fileId={inp.cacat_file_id} tempId={inp.cacat_temp_id} fileName={inp.cacat_file_name}
                      onChange={({ temp_id, file_name }) => setInp((o) => ({ ...o, cacat_temp_id: temp_id, cacat_file_name: file_name }))} testid="cacat-berkas" />
                  </>
                )}
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Kebijakan yang Berlaku" tone="amber">
            <ul className="space-y-1.5 text-xs text-stone-700">
              <li>• Batas lama terima berkas: {s.max_hari_berkas} hari</li>
              <li>• Minimal lama jadi anggota: {s.min_hari_anggota} hari</li>
              {(s.sanduk_brackets || []).map((b, i, arr) => <li key={b.sampai}>• Usia jadi anggota {i ? `> ${arr[i - 1].sampai}` : "0"} s/d {b.sampai} th: maks Sanduk Rp {rp(b.max)}</li>)}
              <li>• Lama anggota s/d 1 tahun: maks Sanduk Rp {rp(s.sanduk_max_anggota_baru)}</li>
              <li>• Maksimal Lalau: Rp {rp(s.lalau_max)}</li>
            </ul>
          </Panel>
        )}
      </div>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#155e46]">Data Permohonan (tidak dapat diubah di sini)</h3>
        <PermohonanInfo p={p} />
      </section>
    </div>
  );
}
