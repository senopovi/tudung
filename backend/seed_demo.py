"""Seed demo: 6 Credit Union (CUG-001..006) x 9 permohonan berbagai kriteria."""
import asyncio
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from bson import Binary
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
TODAY = date(2026, 10, 10)
NAMES = [("Agustinus Lawing", "L"), ("Maria Ujan", "P"), ("Yohanes Bilung", "L"), ("Theresia Ding", "P"), ("Paulus Ajang", "L"),
         ("Veronika Hunyang", "P"), ("Stefanus Lejau", "L"), ("Katarina Ipui", "P"), ("Fransiskus Usat", "L")]
FULL = {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada", "spp": "ada"}
PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
       b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
       b"4 0 obj<</Length 58>>stream\nBT /F1 18 Tf 60 760 Td (Berkas Contoh Permohonan Tudung) Tj ET\nendstream endobj\n"
       b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")


def ago(days=0, years=0):
    d = TODAY - timedelta(days=days)
    try:
        return d.replace(year=d.year - years).isoformat()
    except ValueError:
        return d.replace(year=d.year - years, day=28).isoformat()


def cases():
    return [
        # 1 normal: disetujui penuh
        dict(tgl_lahir=ago(0, 52), tgl_anggota=ago(0, 22), tgl_pinjam=ago(0, 3), tgl_kejadian=ago(40), terima=ago(10), sanduk=20_000_000, lalau=45_000_000, penyebab="Sakit jantung"),
        # 2 sanduk melebihi plafon 50 jt
        dict(tgl_lahir=ago(0, 60), tgl_anggota=ago(0, 20), tgl_pinjam=ago(0, 2), tgl_kejadian=ago(30), terima=ago(5), sanduk=72_500_000, lalau=30_000_000, penyebab="Stroke"),
        # 3 usia jadi anggota 58 th, plafon 37,5 jt
        dict(tgl_lahir=ago(0, 66), tgl_anggota=ago(0, 8), tgl_pinjam=ago(0, 1), tgl_kejadian=ago(60), terima=ago(20), sanduk=45_000_000, lalau=15_000_000, penyebab="Diabetes"),
        # 4 meninggal usia > 70 masih punya pinjaman
        dict(tgl_lahir=ago(0, 74), tgl_anggota=ago(0, 30), tgl_pinjam=ago(0, 6), tgl_kejadian=ago(25), terima=ago(7), sanduk=38_000_000, lalau=60_000_000, penyebab="Usia lanjut"),
        # 5 lama terima berkas > 100 hari
        dict(tgl_lahir=ago(0, 45), tgl_anggota=ago(0, 15), tgl_pinjam=None, tgl_kejadian=ago(170), terima=ago(30), sanduk=18_000_000, lalau=0, penyebab="Kecelakaan lalu lintas"),
        # 6 simpanan lembaga atas nama perorangan
        dict(tgl_lahir=ago(0, 48), tgl_anggota=ago(0, 12), tgl_pinjam=ago(0, 2), tgl_kejadian=ago(35), terima=ago(12), sanduk=25_000_000, lalau=40_000_000, penyebab="Kanker", jenis_simpanan="lembaga"),
        # 7 cacat total tetap, belum 180 hari
        dict(tgl_lahir=ago(0, 41), tgl_anggota=ago(0, 10), tgl_pinjam=ago(0, 1), tgl_kejadian=ago(50), terima=ago(20), sanduk=15_000_000, lalau=25_000_000, penyebab="Kecelakaan kerja, lumpuh permanen", jenis_kejadian="cacat"),
        # 8 lama jadi anggota < 90 hari, tanpa pinjaman
        dict(tgl_lahir=ago(0, 35), tgl_anggota=ago(80), tgl_pinjam=None, tgl_kejadian=ago(20), terima=ago(5), sanduk=3_000_000, lalau=0, penyebab="Demam berdarah"),
        # 9 berkas tidak lengkap (identitas tidak ada), pinjaman lembaga
        dict(tgl_lahir=ago(0, 63), tgl_anggota=ago(0, 1), tgl_pinjam=ago(200), tgl_kejadian=ago(45), terima=ago(15), sanduk=20_000_000, lalau=35_000_000, penyebab="Gagal ginjal", jenis_pinjaman="lembaga", identitas="tidak"),
    ]


async def main():
    if await db.credit_unions.find_one({"kode": "CUG-001"}):
        print("Seed sudah ada, dilewati")
        return
    now = datetime.now(timezone.utc).isoformat()
    for n in range(1, 7):
        cid = str(uuid.uuid4())
        await db.credit_unions.insert_one({"id": cid, "kode": f"CUG-{n:03d}", "nama": f"Credit Union Contoh {n:02d}", "manager": f"[Manager CU {n:02d}]",
                                           "bagian_tudung": f"[Bagian Tudung CU {n:02d}]", "alamat": "[Alamat Credit Union]", "telepon": "[Telepon]", "created_at": now})
        for k, c in enumerate(cases()):
            nama, jk = NAMES[k]
            syarat = {**FULL, "spp": "ada" if c["tgl_pinjam"] else "tidak", "identitas": c.get("identitas", "ada")}
            fid = str(uuid.uuid4())
            fname = f"berkas_{nama.split()[0].lower()}_{n:02d}.pdf"
            await db.files.insert_one({"id": fid, "filename": fname, "size": len(PDF), "data": Binary(PDF), "cu_id": cid, "created_at": now})
            await db.permohonan.insert_one({
                "id": str(uuid.uuid4()), "cu_id": cid, "tanggal_terima": c["terima"], "jenis_simpanan": c.get("jenis_simpanan", "perorangan"),
                "jenis_pinjaman": c.get("jenis_pinjaman", "perorangan"), "pernah_bantuan": "belum", "jenis_kejadian": c.get("jenis_kejadian", "meninggal"),
                "nama": nama, "nomor_anggota": str(3 + 1236 * k), "jenis_kelamin": jk, "tgl_lahir": c["tgl_lahir"], "tgl_anggota": c["tgl_anggota"],
                "tgl_pinjam": c["tgl_pinjam"], "tujuan_pinjaman": "Modal usaha" if c["tgl_pinjam"] else "", "tgl_kejadian": c["tgl_kejadian"],
                "penyebab": c["penyebab"], "sanduk": c["sanduk"], "lalau": c["lalau"], "total": c["sanduk"] + c["lalau"], "syarat": syarat,
                "file_id": fid, "file_name": fname, "status": "Antrian Analisis", "created_at": now, "created_by": "seed-demo"})
    print("6 CU + 54 permohonan dibuat")


asyncio.run(main())
