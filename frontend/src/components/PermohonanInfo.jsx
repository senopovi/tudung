import { tgl, rp, JK, KEJADIAN } from "@/lib/api";

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-4 border-b border-dashed border-stone-200 py-1.5 text-sm last:border-0">
    <span className="text-muted-foreground">{k}</span>
    <span className={`text-right font-medium ${mono ? "font-mono tabular-nums" : ""}`}>{v || "-"}</span>
  </div>
);

const SYARAT = [
  ["surat_kematian", "Surat Kematian / Ket. Cacat Total Tetap"],
  ["identitas", "Identitas Diri"],
  ["buku_anggota", "Buku Anggota"],
  ["buku_simpanan", "Buku Simpanan Khusus Anggota"],
  ["spp", "SPP (Surat Perjanjian Pinjaman)"],
];

export const PermohonanInfo = ({ p }) => (
  <div className="grid gap-6 md:grid-cols-2" data-testid="permohonan-info">
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#155e46]">Identitas & Kejadian</p>
      <Row k="Credit Union" v={p.cu_nama} />
      <Row k="Tanggal Terima Berkas" v={tgl(p.tanggal_terima)} />
      <Row k="Nama Anggota" v={p.nama} />
      <Row k="Nomor Anggota (BA)" v={p.nomor_anggota} mono />
      <Row k="Jenis Kelamin" v={JK[p.jenis_kelamin]} />
      <Row k="Tanggal Lahir" v={tgl(p.tgl_lahir)} />
      <Row k="Tanggal Jadi Anggota" v={tgl(p.tgl_anggota)} />
      <Row k="Jenis Kejadian" v={KEJADIAN[p.jenis_kejadian]} />
      <Row k="Tanggal Meninggal/CTT" v={tgl(p.tgl_kejadian)} />
      <Row k="Penyebab" v={p.penyebab} />
      <Row k="Pernah Menerima Bantuan Lalau" v={p.pernah_bantuan === "sudah" ? "Sudah Pernah" : "Belum Pernah"} />
    </div>
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#155e46]">Saldo & Pinjaman</p>
      <Row k="Jenis Simpanan" v={p.jenis_simpanan === "lembaga" ? "Simpanan Lembaga a.n. Perorangan" : "Simpanan Perorangan"} />
      <Row k="Jenis Pinjaman" v={p.jenis_pinjaman === "lembaga" ? "Pinjaman Lembaga a.n. Perorangan" : "Pinjaman Perorangan"} />
      <Row k="Tanggal Pinjam" v={tgl(p.tgl_pinjam)} />
      <Row k="Tujuan Pinjaman" v={p.tujuan_pinjaman} />
      <Row k="Sanduk (Saldo Simpanan)" v={`Rp ${rp(p.sanduk)}`} mono />
      <Row k="Lalau (Saldo Pinjaman)" v={`Rp ${rp(p.lalau)}`} mono />
      <Row k="Total Diajukan" v={`Rp ${rp(p.total)}`} mono />
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-[#155e46]">Syarat Administrasi</p>
      {SYARAT.map(([k, l]) => (
        <Row key={k} k={l} v={<span className={p.syarat?.[k] === "ada" ? "text-emerald-700" : "text-red-600"}>{p.syarat?.[k] === "ada" ? "Ada" : "Tidak Ada"}</span>} />
      ))}
    </div>
  </div>
);

export { SYARAT };
