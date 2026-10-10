import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Eye, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge, Field } from "@/components/Common";
import { CuSelect, SimpleSelect, SortTh, Confirm } from "@/components/Controls";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg, rp, tglS, sortRows } from "@/lib/api";

const STATUS = [["Antrian Analisis", "Antrian Analisis"], ["Sudah Dianalisis", "Sudah Dianalisis"], ["Dicairkan", "Dicairkan"]];

export default function PermohonanList() {
  const { isAdmin, can } = useAuth();
  const editable = (r) => r.status !== "Dicairkan" && (isAdmin || (can("ubah_hapus_permohonan") && (r.status === "Antrian Analisis" || ["Ditunda", "Tidak Disetujui"].includes(r.analisis?.hasil))));
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ q: "", cu_id: "", status: "", terima_dari: "", terima_sampai: "", cair_dari: "", cair_sampai: "" });
  const [sort, setSort] = useState({ key: "", dir: "asc" });
  const [del, setDel] = useState(null);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    api.get("/permohonan", { params }).then((r) => setRows(r.data));
  }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));

  const doDelete = async () => {
    try {
      await api.delete(`/permohonan/${del.id}`);
      toast.success("Data Permohonan dihapus");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setDel(null);
  };

  return (
    <div>
      <PageHeader title="Daftar Semua Data Permohonan" subtitle={`${rows.length} data permohonan`}>
        <Button asChild className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="add-permohonan-btn">
          <Link to="/permohonan/tambah"><Plus className="mr-2 h-4 w-4" /> Tambah Data Permohonan</Link>
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-4 xl:grid-cols-7" data-testid="permohonan-filters">
        <Field label="Cari Anggota" className="md:col-span-2 xl:col-span-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Nama / No. BA" value={f.q} onChange={set("q")} data-testid="filter-search" />
          </div>
        </Field>
        {isAdmin && <Field label="Credit Union"><CuSelect value={f.cu_id} onChange={set("cu_id")} allowAll testid="filter-cu" /></Field>}
        <Field label="Status"><SimpleSelect value={f.status} onChange={set("status")} options={STATUS} testid="filter-status" /></Field>
        <Field label="Terima Dari"><Input type="date" value={f.terima_dari} onChange={set("terima_dari")} data-testid="filter-terima-dari" /></Field>
        <Field label="Terima Sampai"><Input type="date" value={f.terima_sampai} onChange={set("terima_sampai")} data-testid="filter-terima-sampai" /></Field>
        <Field label="Cair Dari"><Input type="date" value={f.cair_dari} onChange={set("cair_dari")} data-testid="filter-cair-dari" /></Field>
        <Field label="Cair Sampai"><Input type="date" value={f.cair_sampai} onChange={set("cair_sampai")} data-testid="filter-cair-sampai" /></Field>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="data-table w-full" data-testid="permohonan-table">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left">No</th>
              <SortTh k="nama" label="Nama Anggota" sort={sort} setSort={setSort} />
              <SortTh k="nomor_anggota" label="BA" sort={sort} setSort={setSort} />
              <SortTh k="cu_nama" label="Credit Union" sort={sort} setSort={setSort} />
              <SortTh k="tanggal_terima" label="Tgl Terima" sort={sort} setSort={setSort} />
              <SortTh k="tgl_kejadian" label="Tgl Kejadian" sort={sort} setSort={setSort} />
              <SortTh k="total" label="Total Diajukan" sort={sort} setSort={setSort} className="text-right" />
              <SortTh k="tanggal_cair" label="Tgl Cair" sort={sort} setSort={setSort} />
              <SortTh k="status" label="Status" sort={sort} setSort={setSort} />
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Belum ada data permohonan.</td></tr>}
            {sorted.map((r, i) => (
              <tr key={r.id} className="border-t" data-testid={`permohonan-row-${r.id}`}>
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.nama}</td>
                <td className="px-3 py-2 font-mono">{r.nomor_anggota}</td>
                <td className="px-3 py-2">{r.cu_nama}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tglS(r.tanggal_terima)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tglS(r.tgl_kejadian)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{rp(r.total)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tglS(r.tanggal_cair)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <StatusBadge value={r.status} />
                    {r.analisis?.hasil && r.status !== "Dicairkan" && <StatusBadge value={r.analisis.hasil} />}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => nav(`/permohonan/${r.id}`)} title="Buka" data-testid={`open-${r.id}`}><Eye className="h-4 w-4" /></Button>
                    {editable(r) && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => nav(`/permohonan/${r.id}/ubah`)} title="Ubah" data-testid={`edit-${r.id}`}><Pencil className="h-4 w-4 text-amber-700" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDel(r)} title="Hapus" data-testid={`delete-${r.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title="Hapus Data Permohonan?" desc={`Data permohonan ${del?.nama} beserta berkasnya akan dihapus permanen.`} onConfirm={doDelete} />
    </div>
  );
}
