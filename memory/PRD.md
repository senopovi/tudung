# PRD — Tudung (Tudung-Pusaka)

## Original problem statement
Buat aplikasi website dengan nama Tudung, alamat webnya Tudung-Pusaka. Menu: 1. Dashboard, 2. Transaksi (Daftar Data Permohonan + Tambah; Analisis Data Permohonan dengan aturan Sanduk/Lalau, usia 70 th, lama berkas 100 hari, Cacat Total Tetap 180 hari, berkas lengkap; Pencairan Tudung per anggota/per CU dengan nomor "n/T/PUSAKA/ROMAWI/TAHUN"; Daftar Bantuan Cair cetak A4 + Excel dengan kop surat & tanda tangan Manager/Bagian Tudung; Iuran Credit Union rapel), 3. Laporan (permohonan, analisis, pencairan, rekap per CU bulan/3/6/tahun, data CU, iuran Tudung detail & rekap Des th lalu–Des th berjalan), 4. Data Induk (Puskopdit, Credit Union, User; admin pusat senopovi@gmail.com / TudungAdmin#2026), 5. Pengaturan (plafon sanduk per usia, max pinjaman, kop surat JPG/PNG, nomor surat pencairan). Semua saldo format ribuan titik, rata kanan.

User choices: Petugas CU hanya data CU sendiri; Admin Pusat semua. PDF disimpan di database. Login JWT email+password (akun dibuat admin). Tema terang hijau-emas. Semua menu sekaligus.

## Architecture
- Backend FastAPI (`server.py` routes, `calc.py` analysis engine), MongoDB (uuid `id`), Bearer JWT 12 jam, bcrypt, brute-force lockout.
- Files: `temp_files` (upload sementara) -> `files` saat Simpan (temp dihapus). Kop surat base64 di settings.
- Frontend React + shadcn, Plus Jakarta Sans, print CSS A4, Excel via xlsx (table_to_book).

## Implemented (2026-10-10)
- Auth, role scoping (admin / petugas CU), Dashboard
- Permohonan CRUD + filter/sort/search, PDF upload sementara, dialog Berhasil/Gagal, mode tambah mempertahankan CU & tanggal
- Analisis per anggota (preview live dari server) & batch; semua aturan + override (kelonggaran berkas, lalau >70, CTT <180 hari, saldo saat 70 th, berkas tidak lengkap)
- Pencairan per item / per CU, tunda, nomor otomatis + manual; Daftar Bantuan Cair cetak/Excel
- Iuran CU (rapel multi-baris), 6 laporan, Data Induk, Pengaturan
- Interpretasi: "usia jadi anggota 0–1 tahun maks 12,5 jt" diterapkan sebagai LAMA keanggotaan ≤ 1 tahun (bisa diubah di Pengaturan)

## Implemented (2026-10-10, iterasi 2)
- Batal Pencairan (admin): DELETE /api/pencairan/{id}, tombol di Daftar Bantuan Cair -> data kembali ke "Sudah Dianalisis"
- Petugas CU bisa input/ubah/hapus iuran CU sendiri (dibatasi per CU)
- Seed demo `backend/seed_demo.py`: 6 CU (CUG-001..006, nama/manager/alamat placeholder) x 9 permohonan berbagai kriteria, BA 3 + 1236*k, masing-masing dengan PDF contoh
- Reset Data Contoh (Pengaturan): GET/DELETE /api/demo-data; hapus permohonan created_by=seed-demo + berkas + pencairan terkait; CU demo (flag demo=true) dihapus bila tidak berisi data asli/iuran/user
- 6 laporan analitik (frontend `LaporanAnalitik.jsx`): Saldo Pencairan per periode, Penerima L/P per periode, Permohonan Tidak Disetujui + alasan, Tren iuran & pencairan (grafik), Anggota per usia meninggal/masuk, Rating CU
- Dashboard: grafik tren Iuran Tudung & Saldo Pencairan 12 bulan terakhir (GET /api/dashboard -> tren), dengan filter CU untuk admin (GET /api/dashboard/tren?cu_id=)
- Laporan Perbandingan Iuran vs Pencairan (ringkasan per CU / detail bulanan, selisih & rasio)
- Peringatan defisit: baris merah "(DEFISIT)" di laporan perbandingan + kartu peringatan merah di Dashboard (CU dengan pencairan > iuran tahun berjalan)
- Notifikasi email defisit (Emergent-managed Resend, `email_service.py`): check_defisit() berjalan di background setelah pencairan/batal/iuran; email hanya saat CU BARU masuk defisit (state di `defisit_state`), ke semua admin aktif; riwayat di `notif_log` (GET /api/notifikasi, kartu di Pengaturan)
- Lupa password: link di Login -> /lupa-password (POST /api/auth/forgot-password, respons generik, maks 3/jam), email tautan `FRONTEND_URL/reset-password?token=` (token sha256, 1 jam, sekali pakai) -> POST /api/auth/reset-password. Seed admin tidak lagi menimpa password yang sudah diubah.
- Tombol "Kirim email uji" (POST /api/notifikasi/uji, 1x/menit) ke semua admin aktif
- Ubah Password sendiri di header (POST /api/auth/change-password: password lama + baru)
- Riwayat login: users.last_login_at/login_count + koleksi login_history; kolom "Login Terakhir" (Aktif ≤7 hr, Jarang ≤30 hr, Tidak aktif) di Data User + dialog 20 login terakhir (GET /api/users/{id}/login-history)
- Nonaktif otomatis petugas (settings auto_nonaktif 0/1, auto_nonaktif_hari=90, default OFF): dicek saat login, buka Data User, dan startup; baseline max(last_login_at, created_at, reactivated_at); login nonaktif -> 403 pesan jelas
- Hak akses per CU (credit_unions.hak_akses: input_iuran, ubah_hapus_permohonan, lihat_hasil_analisis, lihat_laporan_permohonan; default semua ON) diatur admin di Data CU; enforced backend (can/require_perm) + menu/route frontend. Petugas selalu: input permohonan, lihat laporan pencairan/bantuan cair/saldo & penerima periode/tren/iuran CU sendiri. Admin only: analisis, pencairan, rekap/rating/perbandingan/usia/data CU, data induk, pengaturan
- Pengingat email 7 hari sebelum nonaktif otomatis; cron harian 08:00 WIB `.emergent/crons.yml` -> POST /api/cron/akun (Bearer WEBHOOK_CRON_SECRET, idempotent)
- Hak akses per user (users.hak_akses, efektif = hak CU AND hak user) + hak baru `lihat_laporan` (menu Laporan & Bantuan Cair; GET /api/pencairan & /api/laporan/permil)
- Angka kematian/CTT per mil: credit_unions.jumlah_anggota (terkini) + anggota_per_tahun {"2025": n}; per mil memakai jumlah tahun tsb, fallback ke terkini (ditandai *); CU tanpa jumlah anggota tidak dihitung; laporan /laporan/permil (GET /api/laporan/permil?tahun=) + kartu Dashboard
- (2026-10-10) Impor Jumlah Anggota dari Excel (Data Induk > Data Credit Union, admin): template .xlsx (Kode CU, Tahun, Jumlah Anggota; format panjang), parse di browser (xlsx), pratinjau baris valid/error, simpan via POST /api/cu/anggota-import {rows:[{kode,tahun,jumlah}]} — kode case-insensitive, menimpa tahun yang sudah ada, ditolak seluruhnya bila ada error
- (2026-10-10) Kop surat resmi PUSAKA (dari user, garis tepi 1px dipangkas) diunggah ke settings.kop_surat -> dipakai semua laporan cetak A4 via ReportShell
- (2026-10-10) Cetak multi-halaman: ReportShell membungkus konten dalam table.print-wrap (thead = kop, diulang tiap halaman; judul hanya halaman 1; tanda tangan setelah tabel di halaman terakhir); header kolom tabel ikut diulang, tfoot JUMLAH hanya di akhir; @page @bottom-center "Halaman X dari Y" (Chrome/Edge 131+); latar body putih saat cetak
- (2026-10-10) Pilihan orientasi cetak Potret/Lanskap (ToggleGroup di ReportShell, default Potret, diingat per judul laporan di localStorage `tudung-orientasi:<judul>`); Lanskap menyuntik `@page { size: A4 landscape }` + pratinjau .paper-landscape (297mm); kop dibatasi 180mm saat lanskap agar Chrome tetap mengulang kop tiap halaman
- (2026-10-10) Pilihan ukuran kertas A4 (210x297) / F4 (215x330 mm) di ReportShell, digabung dengan orientasi; `@page { size: Wmm Hmm }` disuntik dinamis, lebar pratinjau mengikuti; diingat per judul laporan (`tudung-kertas:<judul>`)
- (2026-10-10) Logo PUSAKA (public/logo-pusaka.png, favicon.ico, logo192, apple-touch-icon): sidebar (bulat putih, ring amber), header mobile, Login (panel kiri + di atas form), halaman reset password; judul tab "Tudung-Pusaka"
- (2026-10-10) Subjudul laporan "Format A4/F4"; input "Tgl. Tanda Tangan" di ReportShell (default hari ini, tidak disimpan) -> Signatures tanggal
- (2026-10-10) puskopdit.kota (default "Pontianak" via GET bila belum disimpan; diatur di Data PUSKOPDIT "Kota Tanda Tangan") -> blok tanda tangan "Kota, tanggal"; kosong = hanya tanggal
- (2026-10-10) Tanda tangan & stempel (settings.ttd_manager/stempel_manager/ttd_bagian/stempel_bagian, data URL PNG/JPG ≤1MB; POST/DELETE /api/settings/ttd/{slot}, admin) diunggah di Pengaturan (TtdUpload.jsx); dicetak di blok tanda tangan (stempel menumpuk di kiri tanda tangan); switch "Cetak dengan tanda tangan" di ReportShell (default aktif, tidak disimpan)
- (2026-10-10) Tanda tangan per CU: koleksi cu_ttd {cu_id, ttd_/stempel_ manager/bagian}; GET/POST/DELETE /api/cu/{cid}/ttd[/{slot}] (admin semua CU, petugas hanya CU sendiri via check_cu); menu "Tanda Tangan CU" (/tanda-tangan-cu, grup Pengaturan, semua role). ReportShell prop cuId (atau cu_id petugas): laporan satu CU memakai nama Manager/Bagian Tudung + gambar CU (kota tetap dari PUSKOPDIT); laporan semua CU memakai PUSKOPDIT. cuId dipasang di Lap. Permohonan/Analisis/Pencairan, Iuran, Bantuan Cair, Saldo/Penerima periode, Tidak Disetujui, Tren, Usia

## Backlog
- P2: Riwayat audit perubahan, notifikasi
