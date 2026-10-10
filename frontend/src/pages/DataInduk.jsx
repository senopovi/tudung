import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect, RG, Confirm } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

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
      {[["nomor", "Nomor PUSKOPDIT (Badan Hukum)"], ["nama", "Nama PUSKOPDIT"], ["manager", "Nama Manager PUSKOPDIT"], ["bagian_tudung", "Nama Bagian Tudung PUSKOPDIT"], ["telepon", "Telepon"]].map(([k, l]) => (
        <Field key={k} label={l}><Input value={d[k] || ""} onChange={set(k)} data-testid={`puskopdit-${k}`} /></Field>
      ))}
      <Field label="Alamat PUSKOPDIT" className="md:col-span-2"><Textarea rows={2} value={d.alamat || ""} onChange={set("alamat")} data-testid="puskopdit-alamat" /></Field>
      <div className="md:col-span-2 flex justify-end"><Button onClick={save} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="puskopdit-save-btn"><Save className="mr-2 h-4 w-4" /> Simpan</Button></div>
    </div>
  );
}

function CrudTab({ title, rows, columns, fields, onSave, onDelete, testid, renderField }) {
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const save = async () => { if (await onSave(edit)) setEdit(null); };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit({})} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid={`${testid}-add-btn`}><Plus className="mr-2 h-4 w-4" /> Tambah {title}</Button></div>
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

function CUTab() {
  const { org, loadOrg } = useAuth();
  const onSave = async (d) => {
    if (!d.kode || !d.nama) { toast.error("Kode dan Nama wajib diisi"); return false; }
    try {
      const body = Object.fromEntries(CU_FIELDS.map(([k]) => [k, d[k] || ""]));
      d.id ? await api.put(`/cu/${d.id}`, body) : await api.post("/cu", body);
      await loadOrg(); toast.success("Credit Union disimpan"); return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const onDelete = async (d) => { try { await api.delete(`/cu/${d.id}`); await loadOrg(); toast.success("Credit Union dihapus"); } catch (e) { toast.error(errMsg(e)); } };
  return <CrudTab title="Credit Union" testid="cu" rows={org.cus} fields={CU_FIELDS} onSave={onSave} onDelete={onDelete}
    columns={[["kode", "Kode"], ["nama", "Nama"], ["manager", "Manager"], ["bagian_tudung", "Bagian Tudung"], ["telepon", "Telepon"], ["alamat", "Alamat"]]} />;
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
      const body = { email: d.email || "", name: d.name || "", password: d.password || null, role: d.role || "petugas", cu_id: d.cu_id || null, aktif: d.aktif !== false };
      d.id ? await api.put(`/users/${d.id}`, body) : await api.post("/users", body);
      load(); toast.success("Pengguna disimpan"); return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const onDelete = async (d) => { try { await api.delete(`/users/${d.id}`); load(); toast.success("Pengguna dihapus"); } catch (e) { toast.error(errMsg(e)); } };
  const renderField = (k, e, set) => {
    if (k === "role") return <RG value={e.role || "petugas"} onChange={(v) => set({ ...e, role: v })} testid="user-role" options={[["petugas", "Petugas CU"], ["admin", "Admin Pusat"]]} />;
    if (k === "cu_id") return (e.role || "petugas") === "petugas" ? <CuSelect value={e.cu_id} onChange={(v) => set({ ...e, cu_id: v })} testid="user-cu-select" /> : <p className="py-2 text-xs text-muted-foreground">Admin Pusat mengakses semua CU</p>;
    if (k === "aktif") return <RG value={e.aktif === false ? "tidak" : "ya"} onChange={(v) => set({ ...e, aktif: v === "ya" })} testid="user-aktif" options={[["ya", "Aktif"], ["tidak", "Nonaktif"]]} />;
    return null;
  };
  return (
    <>
    <CrudTab title="Pengguna" testid="user" rows={rows} onSave={onSave} onDelete={onDelete} renderField={renderField}
    fields={[["name", "Nama"], ["email", "Email (Username)"], ["password", "Password (kosongkan bila tidak diubah)"], ["role", "Peran"], ["cu_id", "Credit Union"], ["aktif", "Status"]]}
    columns={[["name", "Nama"], ["email", "Email"], ["role", "Peran", (r) => (r.role === "admin" ? "Admin Pusat" : "Petugas CU")], ["cu", "Credit Union", (r) => (r.role === "admin" ? "Semua" : cuName(r.cu_id))], ["aktif", "Status", (r) => (r.aktif === false ? "Nonaktif" : "Aktif")], ["login", "Login Terakhir", (r) => <LastLogin r={r} onOpen={() => openHist(r)} />]]} />
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
  return (
    <div>
      <PageHeader title="Data Induk" subtitle="Profil Puskopdit, Credit Union anggota, dan pengguna aplikasi." />
      <Tabs defaultValue="puskopdit">
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
