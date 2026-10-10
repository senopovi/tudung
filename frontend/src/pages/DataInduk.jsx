import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect, RG, Confirm } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { AnggotaImport } from "@/components/AnggotaImport";

const CU_FIELDS = [["kode", "Kode Credit Union"], ["nama", "Nama Credit Union"], ["manager", "Nama Manager"], ["bagian_tudung", "Nama Bagian Tudung"], ["telepon", "Nomor Telepon"], ["alamat", "Alamat"]];

function PuskopditTab() {
  const { org, loadOrg } = useAuth();
  const [d, setD] = useState(org.puskopdit);
  useEffect(() => setD(org.puskopdit), [org.puskopdit]);
  const set = (k) => (e) => setD((o) => ({ ...o, [k]: e.target.value }));
  const save = async () => {
    try { await api.put("/puskopdit", d); await loadOrg(); toast.success("Data Puskopdit disimpan"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid gap-4 rounded-lg border bg-white p-6 shadow-sm md:grid-cols-2" data-testid="puskopdit-form">
      {[["nomor", "Nomor PUSKOPDIT (Badan Hukum)"], ["nama", "Nama PUSKOPDIT"], ["manager", "Nama Manager PUSKOPDIT"], ["bagian_tudung", "Nama Bagian Tudung PUSKOPDIT"], ["telepon", "Telepon"], ["kota", "Kota Tanda Tangan (mis. Pontianak)"]].map(([k, l]) => (
        <Field key={k} label={l}><Input value={d[k] || ""} onChange={set(k)} data-testid={`puskopdit-${k}`} /></Field>
      ))}
      <Field label="Alamat PUSKOPDIT" className="md:col-span-2"><Textarea rows={2} value={d.alamat || ""} onChange={set("alamat")} data-testid="puskopdit-alamat" /></Field>
      <div className="md:col-span-2 flex justify-end"><Button onClick={save} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="puskopdit-save-btn"><Save className="mr-2 h-4 w-4" /> Simpan</Button></div>
    </div>
  );
}

function CrudTab({ title, rows, columns, fields, onSave, onDelete, testid, renderField, extra }) {
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const save = async () => { if (await onSave(edit)) setEdit(null); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">{extra}<Button onClick={() => setEdit({})} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`${testid}-add-btn`}><Plus className="mr-2 h-4 w-4" /> Tambah {title}</Button></div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full" data-testid={`${testid}-table`}>
          <thead><tr>{columns.map(([, l]) => <th key={l} className="px-3 py-2.5 text-left">{l}</th>)}<th className="px-3 py-2.5" /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">Belum ada data.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                {columns.map(([k, l, fn]) => <td key={l} className="px-3 py-2">{fn ? fn(r) : r[k]}</td>)}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => setEdit({ ...r, password: "" })} data-testid={`${testid}-edit-${r.id}`}><Pencil className="h-4 w-4 text-amber-700" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDel(r)} data-testid={`${testid}-delete-${r.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent className="max-w-xl" data-testid={`${testid}-dialog`}>
          <DialogHeader><DialogTitle>{edit?.id ? "Ubah" : "Tambah"} {title}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(([k, l]) => (
                <Field key={k} label={l} className={k === "alamat" ? "sm:col-span-2" : ""}>
                  {renderField?.(k, edit, setEdit) || <Input type={k === "password" ? "password" : "text"} value={edit[k] || ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} data-testid={`${testid}-field-${k}`} />}
                </Field>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Batal</Button><Button onClick={save} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`${testid}-save-btn`}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Hapus ${title}?`} desc="Data akan dihapus permanen." onConfirm={async () => { await onDelete(del); setDel(null); }} />
    </div>
  );
}

const HAK = [["input_iuran", "Input & ubah iuran CU sendiri"], ["iuran_sanduk", "— Iuran Sanduk"], ["iuran_lalau", "— Iuran Lalau"], ["iuran_biris", "— Iuran Biris Pangkaras"], ["iuran_gppk", "— Iuran Solidaritas GPPK"], ["ubah_hapus_permohonan", "Ubah/hapus permohonan (Antrian Analisis, Ditunda, Tidak Disetujui)"], ["lihat_hasil_analisis", "Lihat hasil analisis & laporan analisis"], ["lihat_laporan_permohonan", "Lihat laporan data permohonan"], ["lihat_laporan", "Lihat menu Laporan & Daftar Bantuan Cair"]];
const hakOf = (d) => ({ input_iuran: true, iuran_sanduk: true, iuran_lalau: true, iuran_biris: true, iuran_gppk: true, ubah_hapus_permohonan: true, lihat_hasil_analisis: true, lihat_laporan_permohonan: true, lihat_laporan: true, ...(d.hak_akses || {}) });

const HakBoxes = ({ e, set, note, testid }) => (
  <div className="space-y-2 rounded-md border bg-stone-50 p-3" data-testid={testid}>
    <p className="text-[11px] text-muted-foreground">{note}</p>
    {HAK.map(([h, l]) => (
      <label key={h} className="flex items-center gap-2 text-sm">
        <Checkbox checked={hakOf(e)[h]} onCheckedChange={(v) => set({ ...e, hak_akses: { ...hakOf(e), [h]: !!v } })} data-testid={`${testid}-${h}`} /> {l}
      </label>
    ))}
  </div>
);

const AnggotaTahun = ({ e, set }) => {
  const apt = e.anggota_per_tahun || {};
  const [baru, setBaru] = useState(String(new Date().getFullYear()));
  const upd = (n) => set({ ...e, anggota_per_tahun: n });
  return (
    <div className="space-y-2 rounded-md border bg-stone-50 p-3" data-testid="cu-anggota-tahun">
      {Object.keys(apt).sort().reverse().map((y) => (
        <div key={y} className="flex items-center gap-2">
          <span className="w-14 font-mono text-sm font-semibold">{y}</span>
          <Input type="number" min={0} value={apt[y]} onChange={(ev) => upd({ ...apt, [y]: Number(ev.target.value) })} className="h-8" data-testid={`apt-${y}`} />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => { const n = { ...apt }; delete n[y]; upd(n); }} data-testid={`apt-remove-${y}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input type="number" value={baru} onChange={(ev) => setBaru(ev.target.value)} className="h-8 w-24" placeholder="Tahun" data-testid="apt-new-tahun" />
        <Button type="button" size="sm" variant="outline" disabled={!/^\d{4}$/.test(baru) || baru in apt} onClick={() => upd({ ...apt, [baru]: Number(e.jumlah_anggota) || 0 })} data-testid="apt-add-btn"><Plus className="mr-1 h-3.5 w-3.5" /> Tambah Tahun</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Tahun yang belum diisi memakai Jumlah Anggota Terkini.</p>
    </div>
  );
};

function CUTab() {
  const { org, loadOrg } = useAuth();
  const renderField = (k, e, set) => {
    if (k === "anggota_per_tahun") return <AnggotaTahun e={e} set={set} />;
    if (k === "jumlah_anggota") return <Input type="number" min={0} value={e.jumlah_anggota || ""} onChange={(ev) => set({ ...e, jumlah_anggota: Number(ev.target.value) })} data-testid="cu-field-jumlah_anggota" />;
    if (k !== "hak_akses") return null;
    return <HakBoxes e={e} set={set} testid="hak" note="Selalu diizinkan: input permohonan & Dashboard CU sendiri. Analisis & pencairan hanya Admin Pusat. Hak per petugas bisa dibatasi lagi di Data User." />;
  };
  const onSave = async (d) => {
    if (!d.kode || !d.nama) { toast.error("Kode dan Nama wajib diisi"); return false; }
    try {
      const body = { ...Object.fromEntries(CU_FIELDS.map(([k]) => [k, d[k] || ""])), hak_akses: hakOf(d), anggota_per_tahun: d.anggota_per_tahun || {}, jumlah_anggota: Number(d.jumlah_anggota) || 0 };
      d.id ? await api.put(`/cu/${d.id}`, body) : await api.post("/cu", body);
      await loadOrg(); toast.success("Credit Union disimpan"); return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const onDelete = async (d) => { try { await api.delete(`/cu/${d.id}`); await loadOrg(); toast.success("Credit Union dihapus"); } catch (e) { toast.error(errMsg(e)); } };
  return <CrudTab title="Credit Union" testid="cu" rows={org.cus} fields={[...CU_FIELDS, ["jumlah_anggota", "Jumlah Anggota Terkini"], ["anggota_per_tahun", "Jumlah Anggota per Tahun (untuk per mil)"], ["hak_akses", "Hak Akses Petugas CU"]]} onSave={onSave} onDelete={onDelete} renderField={renderField} extra={<AnggotaImport />}
    columns={[["kode", "Kode"], ["nama", "Nama"], ["manager", "Manager"], ["bagian_tudung", "Bagian Tudung"], ["telepon", "Telepon"], ["hak", "Hak Akses Petugas", (r) => `${Object.values(hakOf(r)).filter(Boolean).length}/${HAK.length}`], ["jumlah_anggota", "Jml Anggota", (r) => (r.jumlah_anggota ? new Intl.NumberFormat("id-ID").format(r.jumlah_anggota) : "-")]]} />;
}

const fmtWaktu = (s) => new Date(s).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const LastLogin = ({ r, onOpen }) => {
  if (!r.last_login_at) return <button onClick={onOpen} className="text-xs text-muted-foreground hover:underline" data-testid={`last-login-${r.id}`}>Belum pernah login</button>;
  const days = (Date.now() - new Date(r.last_login_at).getTime()) / 864e5;
  const [label, cls] = days <= 7 ? ["Aktif", "bg-emerald-100 text-emerald-800"] : days <= 30 ? ["Jarang", "bg-amber-100 text-amber-800"] : ["Tidak aktif", "bg-stone-200 text-stone-700"];
  return (
    <button onClick={onOpen} className="flex flex-col items-start text-left hover:underline" data-testid={`last-login-${r.id}`}>
      <span className="text-xs">{fmtWaktu(r.last_login_at)}</span>
      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
    </button>
  );
};

function UsersTab() {
  const { org } = useAuth();
  const [rows, setRows] = useState([]);
  const [hist, setHist] = useState(null);
  const openHist = async (u) => { const { data } = await api.get(`/users/${u.id}/login-history`); setHist({ u, data }); };
  const load = () => api.get("/users").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const cuName = (id) => org.cus.find((c) => c.id === id)?.nama || "-";
  const onSave = async (d) => {
    try {
      const body = { email: d.email || "", name: d.name || "", password: d.password || null, role: d.role || "petugas", cu_id: d.cu_id || null, aktif: d.aktif !== false, hak_akses: (d.role || "petugas") === "petugas" ? hakOf(d) : null };
      d.id ? await api.put(`/users/${d.id}`, body) : await api.post("/users", body);
      load(); toast.success("Pengguna disimpan"); return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const onDelete = async (d) => { try { await api.delete(`/users/${d.id}`); load(); toast.success("Pengguna dihapus"); } catch (e) { toast.error(errMsg(e)); } };
  const renderField = (k, e, set) => {
    if (k === "role") return <RG value={e.role || "petugas"} onChange={(v) => set({ ...e, role: v })} testid="user-role" options={[["petugas", "Petugas CU"], ["admin", "Admin Pusat"]]} />;
    if (k === "cu_id") return (e.role || "petugas") === "petugas" ? <CuSelect value={e.cu_id} onChange={(v) => set({ ...e, cu_id: v })} testid="user-cu-select" /> : <p className="py-2 text-xs text-muted-foreground">Admin Pusat mengakses semua CU</p>;
    if (k === "hak_akses") return (e.role || "petugas") === "petugas" ? <HakBoxes e={e} set={set} testid="user-hak" note="Hak akses petugas ini. Tetap dibatasi oleh hak akses Credit Union-nya (tidak bisa melebihi)." /> : <p className="py-2 text-xs text-muted-foreground">Admin Pusat memiliki semua hak akses</p>;
    if (k === "aktif") return <RG value={e.aktif === false ? "tidak" : "ya"} onChange={(v) => set({ ...e, aktif: v === "ya" })} testid="user-aktif" options={[["ya", "Aktif"], ["tidak", "Nonaktif"]]} />;
    return null;
  };
  return (
    <>
    <CrudTab title="Pengguna" testid="user" rows={rows} onSave={onSave} onDelete={onDelete} renderField={renderField}
    fields={[["name", "Nama"], ["email", "Email (Username)"], ["password", "Password (kosongkan bila tidak diubah)"], ["role", "Peran"], ["cu_id", "Credit Union"], ["aktif", "Status"], ["hak_akses", "Hak Akses Petugas"]]}
    columns={[["name", "Nama"], ["email", "Email"], ["role", "Peran", (r) => (r.role === "admin" ? "Admin Pusat" : "Petugas CU")], ["cu", "Credit Union", (r) => (r.role === "admin" ? "Semua" : cuName(r.cu_id))], ["aktif", "Status", (r) => (r.aktif === false ? <span className="text-red-700" data-testid={`status-${r.id}`}>{r.nonaktif_otomatis ? "Nonaktif (otomatis)" : "Nonaktif"}</span> : "Aktif")], ["login", "Login Terakhir", (r) => <LastLogin r={r} onOpen={() => openHist(r)} />]]} />
    <Dialog open={!!hist} onOpenChange={() => setHist(null)}>
      <DialogContent className="max-w-lg" data-testid="login-history-dialog">
        <DialogHeader><DialogTitle>Riwayat Login: {hist?.u.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Total login: {hist?.u.login_count || 0} kali • 20 login terakhir</p>
        <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {hist?.data.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Belum pernah login.</p>}
          {hist?.data.map((h) => (
            <div key={h.at} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium">{fmtWaktu(h.at)}</span>
              <span className="truncate text-xs text-muted-foreground">{h.ip}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function DataInduk() {
  const [params] = useSearchParams();
  return (
    <div>
      <PageHeader title="Data Induk" subtitle="Profil Puskopdit, Credit Union anggota, dan pengguna aplikasi." />
      <Tabs defaultValue={["puskopdit", "cu", "users"].includes(params.get("tab")) ? params.get("tab") : "puskopdit"}>
        <TabsList className="mb-4">
          <TabsTrigger value="puskopdit" data-testid="tab-puskopdit">Data PUSKOPDIT</TabsTrigger>
          <TabsTrigger value="cu" data-testid="tab-cu">Data Credit Union</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Data User</TabsTrigger>
        </TabsList>
        <TabsContent value="puskopdit"><PuskopditTab /></TabsContent>
        <TabsContent value="cu"><CUTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
