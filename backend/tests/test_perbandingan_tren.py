"""Tests for Laporan Perbandingan report data + Dashboard /dashboard/tren CU filter.

Creates isolated TEST_ data (CU, iuran, permohonan, pencairan, petugas user)
and verifies:
  - GET /api/iuran filtered by cu_id returns the right totals per month
  - GET /api/permohonan status=Dicairkan with cair_dari/cair_sampai filters work
  - Rows sum correctly for both 'per-CU' and 'per-month' views
  - /api/dashboard/tren with cu_id scopes to that CU
  - /api/dashboard/tren for petugas is scoped to own CU (ignores cu_id leak)
Cleans up everything at the end + resets settings.nomor_berikutnya=1.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://tudung-pusaka.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "senopovi@gmail.com", "password": "TudungAdmin#2026"}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def workspace(admin_h):
    """Create isolated TEST_ CU + iuran + 1 cair permohonan; teardown everything."""
    kode_a = f"TC{uuid.uuid4().hex[:5].upper()}"
    kode_b = f"TD{uuid.uuid4().hex[:5].upper()}"
    cu_a = requests.post(f"{BASE}/api/cu", json={"kode": kode_a, "nama": "TEST_PerbandinganA"}, headers=admin_h).json()["id"]
    cu_b = requests.post(f"{BASE}/api/cu", json={"kode": kode_b, "nama": "TEST_PerbandinganB"}, headers=admin_h).json()["id"]

    # Iuran: CU-A 2026-03 total 10.000.000 (sanduk 7jt + lalau 3jt); 2026-05 total 5.000.000
    iuran_items = [
        {"cu_id": cu_a, "tanggal": "2026-03-15", "sanduk": 7_000_000, "lalau": 3_000_000, "keterangan": "TEST_iuran1"},
        {"cu_id": cu_a, "tanggal": "2026-05-10", "sanduk": 3_000_000, "lalau": 2_000_000, "keterangan": "TEST_iuran2"},
        {"cu_id": cu_b, "tanggal": "2026-04-10", "sanduk": 1_000_000, "lalau": 0, "keterangan": "TEST_iuranB"},
    ]
    r = requests.post(f"{BASE}/api/iuran", json={"items": iuran_items}, headers=admin_h)
    assert r.status_code == 200, r.text

    # Permohonan on CU-A: create, analyze, disburse (today ~ 2026-10-10)
    pbody = {
        "cu_id": cu_a, "tanggal_terima": "2026-10-05",
        "nama": "TEST_PerbandinganPerm", "nomor_anggota": "T900", "jenis_kelamin": "L",
        "tgl_lahir": "1980-01-15", "tgl_anggota": "2021-05-10", "tgl_pinjam": "2024-03-20",
        "tgl_kejadian": "2026-10-05",
        "sanduk": 20_000_000, "lalau": 30_000_000, "total": 50_000_000,
        "syarat": {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada", "spp": "ada"},
    }
    pid = requests.post(f"{BASE}/api/permohonan", json=pbody, headers=admin_h).json()["id"]
    r = requests.post(f"{BASE}/api/analisis/{pid}", json={"berkas_lengkap": True}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json()["hasil"] == "Disetujui"
    total_disetujui = r.json()["total_disetujui"]

    nmr = requests.get(f"{BASE}/api/pencairan/nomor-berikutnya", headers=admin_h).json()["nomor"]
    r = requests.post(f"{BASE}/api/pencairan", json={"cu_id": cu_a, "permohonan_ids": [pid], "nomor": nmr}, headers=admin_h)
    assert r.status_code == 200, r.text
    pen_id = r.json()["id"]

    data = {"cu_a": cu_a, "cu_b": cu_b, "pid": pid, "pen_id": pen_id, "total_disetujui": total_disetujui}
    yield data

    # teardown
    requests.delete(f"{BASE}/api/pencairan/{pen_id}", headers=admin_h)
    for cu in (cu_a, cu_b):
        rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h, params={"cu_id": cu}).json()
        for p in rows:
            requests.delete(f"{BASE}/api/permohonan/{p['id']}", headers=admin_h)
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h, params={"cu_id": cu}).json()
        for i in rows:
            requests.delete(f"{BASE}/api/iuran/{i['id']}", headers=admin_h)
        requests.delete(f"{BASE}/api/cu/{cu}", headers=admin_h)
    # reset settings nomor_berikutnya=1
    try:
        s = requests.get(f"{BASE}/api/settings", headers=admin_h).json()
        s["nomor_berikutnya"] = 1
        requests.put(f"{BASE}/api/settings", json=s, headers=admin_h)
    except Exception:
        pass


class TestPerbandinganData:
    def test_iuran_per_cu(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h,
                            params={"cu_id": workspace["cu_a"],
                                    "dari": "2026-01-01", "sampai": "2026-12-31"}).json()
        assert len(rows) == 2
        total = sum(r["total"] for r in rows)
        assert total == 15_000_000

    def test_iuran_monthly_oktober_empty(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h,
                            params={"cu_id": workspace["cu_a"],
                                    "dari": "2026-10-01", "sampai": "2026-10-31"}).json()
        assert rows == []

    def test_iuran_march(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h,
                            params={"cu_id": workspace["cu_a"],
                                    "dari": "2026-03-01", "sampai": "2026-03-31"}).json()
        assert len(rows) == 1 and rows[0]["total"] == 10_000_000

    def test_pencairan_in_october(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h,
                            params={"status": "Dicairkan",
                                    "cair_dari": "2026-10-01",
                                    "cair_sampai": "2026-10-31",
                                    "cu_id": workspace["cu_a"]}).json()
        assert any(r["id"] == workspace["pid"] for r in rows), rows
        row = next(r for r in rows if r["id"] == workspace["pid"])
        assert row["analisis"]["total_disetujui"] == workspace["total_disetujui"]
        assert row["tanggal_cair"].startswith("2026-10")

    def test_pencairan_in_march_empty(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h,
                            params={"status": "Dicairkan",
                                    "cair_dari": "2026-03-01",
                                    "cair_sampai": "2026-03-31",
                                    "cu_id": workspace["cu_a"]}).json()
        assert not any(r["id"] == workspace["pid"] for r in rows)


class TestDashboardTren:
    def test_tren_all(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/dashboard/tren", headers=admin_h).json()
        assert isinstance(rows, list) and len(rows) == 12
        total_iuran = sum(r["iuran"] for r in rows)
        total_cair = sum(r["cair"] for r in rows)
        # All CUs including seed + our TEST_ ones -> must include our 16M iuran and 50M cair
        assert total_iuran >= 16_000_000
        assert total_cair >= workspace["total_disetujui"]

    def test_tren_filter_cu_a(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/dashboard/tren", headers=admin_h,
                            params={"cu_id": workspace["cu_a"]}).json()
        assert len(rows) == 12
        iuran_sum = sum(r["iuran"] for r in rows)
        cair_sum = sum(r["cair"] for r in rows)
        assert iuran_sum == 15_000_000, rows
        assert cair_sum == workspace["total_disetujui"], rows
        # Pencairan should sit in the current month bucket
        cair_months = [r["bulan"] for r in rows if r["cair"] > 0]
        assert cair_months and all(m.startswith("2026-10") for m in cair_months), cair_months

    def test_tren_filter_cu_b(self, admin_h, workspace):
        rows = requests.get(f"{BASE}/api/dashboard/tren", headers=admin_h,
                            params={"cu_id": workspace["cu_b"]}).json()
        iuran_sum = sum(r["iuran"] for r in rows)
        cair_sum = sum(r["cair"] for r in rows)
        assert iuran_sum == 1_000_000
        assert cair_sum == 0


class TestTrenPetugasScoping:
    def test_petugas_scoped_to_own_cu(self, admin_h, workspace):
        email = f"test_tren_petugas_{uuid.uuid4().hex[:6]}@example.com"
        pw = "Petugas123!"
        pr = requests.post(f"{BASE}/api/users",
                           json={"email": email, "name": "TEST_PetugasTren", "password": pw,
                                 "role": "petugas", "cu_id": workspace["cu_a"], "aktif": True},
                           headers=admin_h)
        assert pr.status_code == 200, pr.text
        uid = pr.json()["id"]
        try:
            tok = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}).json()["token"]
            ph = {"Authorization": f"Bearer {tok}"}
            # No cu_id param -> must be scoped to own CU (cu_a) regardless
            rows = requests.get(f"{BASE}/api/dashboard/tren", headers=ph).json()
            assert sum(r["iuran"] for r in rows) == 15_000_000
            assert sum(r["cair"] for r in rows) == workspace["total_disetujui"]
            # Even if petugas tries to pass cu_id=cu_b, backend should ignore and stay scoped
            rows2 = requests.get(f"{BASE}/api/dashboard/tren", headers=ph,
                                 params={"cu_id": workspace["cu_b"]}).json()
            assert sum(r["iuran"] for r in rows2) == 15_000_000, "Petugas should not see other CU"
        finally:
            requests.delete(f"{BASE}/api/users/{uid}", headers=admin_h)
