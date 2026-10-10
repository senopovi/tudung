import { useCallback, useEffect, useState } from "react";
import { PageHeader, Field } from "@/components/Common";
import { CuSelect } from "@/components/Controls";
import { TtdUpload } from "@/components/TtdUpload";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function TandaTanganCU() {
  const { user, org, isAdmin } = useAuth();
  const [cid, setCid] = useState(isAdmin ? org.cus[0]?.id || "" : user.cu_id);
  const [data, setData] = useState({});
  useEffect(() => { if (!cid && org.cus[0]) setCid(org.cus[0].id); }, [org.cus, cid]);
  const load = useCallback(() => (cid ? api.get(`/cu/${cid}/ttd`).then((r) => setData(r.data)) : Promise.resolve()), [cid]);
  useEffect(() => { setData({}); load(); }, [load]);
  const cu = org.cus.find((c) => c.id === cid);
  return (
    <div className="space-y-6">
      <PageHeader title="Tanda Tangan CU" subtitle="Tanda tangan & stempel Manager dan Bagian Tudung Credit Union untuk laporan satu CU." />
      <section className="max-w-3xl space-y-5 rounded-lg border bg-white p-6 shadow-sm" data-testid="ttd-cu-card">
        {isAdmin ? (
          <Field label="Credit Union"><CuSelect value={cid} onChange={setCid} testid="ttd-cu-select" /></Field>
        ) : (
          <p className="text-sm font-semibold text-[#0d3b2e]" data-testid="ttd-cu-name">{cu ? `${cu.kode} — ${cu.nama}` : "-"}</p>
        )}
        {cid && <TtdUpload data={data} base={`/cu/${cid}/ttd`} onChange={load} names={{ manager: cu?.manager, bagian: cu?.bagian_tudung }} />}
        <p className="text-xs text-muted-foreground">Nama Manager dan Bagian Tudung diambil dari Data Credit Union. Laporan semua CU tetap memakai tanda tangan PUSKOPDIT.</p>
      </section>
    </div>
  );
}
