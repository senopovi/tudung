import { KEJADIAN } from "@/lib/api";

const f = (n) => new Intl.NumberFormat("id-ID").format(n || 0);

export const Narasi = ({ items, testid }) => (
  <ol className="mt-2 space-y-1 text-[9.5pt] leading-snug" data-testid={testid}>
    {items.map((r, i) => (
      <li key={r.id} data-testid={`${testid}-${i}`}>
        {i + 1}. Tudung a.n.: <b>{r.nama}</b> dengan BA. {r.ba}: <b>{r.hasil}</b> karena {r.alasan}.
      </li>
    ))}
  </ol>
);

export const TertahanTable = ({ rows }) => (
  <table className="rpt-table" data-testid="tertahan-report-table">
    <thead>
      <tr>
        <th rowSpan={2}>No.</th><th rowSpan={2}>Nama</th><th rowSpan={2}>BA</th><th colSpan={2}>JK</th>
        <th rowSpan={2}>Kejadian</th><th rowSpan={2}>SANDUK Diajukan</th><th rowSpan={2}>LALAU Diajukan</th><th rowSpan={2}>Hasil</th>
      </tr>
      <tr><th>L</th><th>P</th></tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={r.id}>
          <td className="ctr">{i + 1}</td><td>{r.nama}</td><td className="ctr">{r.ba}</td>
          <td className="ctr">{r.jenis_kelamin === "L" ? 1 : ""}</td><td className="ctr">{r.jenis_kelamin === "P" ? 1 : ""}</td>
          <td>{KEJADIAN[r.jenis_kejadian] || "-"}</td>
          <td className="num">{f(r.sanduk)}</td><td className="num">{f(r.lalau)}</td><td className="ctr">{r.hasil}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const PencairanNarasi = ({ cur }) => {
  const seb = cur.sebagian || [];
  const tt = cur.tertahan || [];
  return (
    <div className="mt-3 text-[10pt]" data-testid="pencairan-narasi">
      {seb.length > 0 && (
        <div className="rpt-keep">
          <p className="font-semibold">Keterangan Permohonan Disetujui Sebagian:</p>
          <Narasi items={seb} testid="narasi-sebagian" />
        </div>
      )}
      {tt.length > 0 && (
        <div className="mt-[1.2em]">
          <p className="mb-1 text-center text-[11pt] font-bold uppercase">Daftar Bantuan Tudung yang Ditunda dan Tidak Disetujui</p>
          <TertahanTable rows={tt} />
          <p className="mt-2 font-semibold">Keterangan Permohonan Ditunda / Tidak Disetujui:</p>
          <Narasi items={tt} testid="narasi-tertahan" />
        </div>
      )}
      <p className="mt-4" data-testid="pencairan-penutup">Demikian surat ini disampaikan, atas perhatian dan kerjasama diucapkan terima kasih.</p>
    </div>
  );
};
