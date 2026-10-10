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

## Backlog
- P2: Riwayat audit perubahan, notifikasi
