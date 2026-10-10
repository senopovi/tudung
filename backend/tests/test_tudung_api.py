"""Backend regression tests for Tudung-Pusaka"""
import os
import io
import pytest
import requests
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://tudung-pusaka.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "senopovi@gmail.com"
ADMIN_PW = "TudungAdmin#2026"
TODAY = date(2026, 10, 10)  # Asia/Jakarta "today" expected

PDF_BYTES = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- auth ----------------
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG_PW_xx"})
        assert r.status_code in (401, 429)

    def test_me(self, admin_h):
        r = requests.get(f"{BASE}/api/auth/me", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        assert requests.get(f"{BASE}/api/auth/me").status_code == 401


# ---------------- Credit Union ----------------
@pytest.fixture(scope="session")
def test_cu(admin_h):
    body = {"kode": "TEST01", "nama": "TEST_CU_Alpha", "manager": "Pak Mgr", "bagian_tudung": "Bu Tudung",
            "alamat": "Jl Test 1", "telepon": "0811"}
    r = requests.post(f"{BASE}/api/cu", json=body, headers=admin_h)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid
    requests.delete(f"{BASE}/api/cu/{cid}", headers=admin_h)


class TestCU:
    def test_list_cu(self, admin_h, test_cu):
        r = requests.get(f"{BASE}/api/cu", headers=admin_h)
        assert r.status_code == 200
        assert any(c["id"] == test_cu for c in r.json())

    def test_duplicate_kode(self, admin_h, test_cu):
        r = requests.post(f"{BASE}/api/cu", json={"kode": "TEST01", "nama": "TEST_dup"}, headers=admin_h)
        assert r.status_code == 400

    def test_update_cu(self, admin_h, test_cu):
        r = requests.put(f"{BASE}/api/cu/{test_cu}",
                         json={"kode": "TEST01", "nama": "TEST_CU_Alpha2", "manager": "M2",
                               "bagian_tudung": "B2", "alamat": "A", "telepon": "0"}, headers=admin_h)
        assert r.status_code == 200


# ---------------- Puskopdit ----------------
class TestPuskopdit:
    def test_update_profile(self, admin_h):
        body = {"nomor": "PK01", "nama": "TEST_Puskopdit", "alamat": "A", "manager": "Mgr", "bagian_tudung": "BT", "telepon": "0"}
        r = requests.put(f"{BASE}/api/puskopdit", json=body, headers=admin_h)
        assert r.status_code == 200
        got = requests.get(f"{BASE}/api/puskopdit", headers=admin_h).json()
        assert got["manager"] == "Mgr" and got["bagian_tudung"] == "BT"


# ---------------- Users ----------------
@pytest.fixture(scope="session")
def petugas(admin_h, test_cu):
    body = {"email": "test_petugas1@example.com", "name": "TEST_Petugas",
            "password": "Petugas123!", "role": "petugas", "cu_id": test_cu, "aktif": True}
    r = requests.post(f"{BASE}/api/users", json=body, headers=admin_h)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    yield {"id": uid, "email": body["email"], "password": body["password"]}
    requests.delete(f"{BASE}/api/users/{uid}", headers=admin_h)


class TestUsers:
    def test_petugas_requires_cu(self, admin_h):
        r = requests.post(f"{BASE}/api/users",
                          json={"email": "tp_no_cu@example.com", "name": "x", "password": "abc123", "role": "petugas"},
                          headers=admin_h)
        assert r.status_code == 400

    def test_petugas_login(self, petugas):
        r = requests.post(f"{BASE}/api/auth/login", json={"email": petugas["email"], "password": petugas["password"]})
        assert r.status_code == 200
        petugas["token"] = r.json()["token"]

    def test_petugas_cannot_list_users(self, petugas):
        tok = requests.post(f"{BASE}/api/auth/login",
                            json={"email": petugas["email"], "password": petugas["password"]}).json()["token"]
        r = requests.get(f"{BASE}/api/users", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403

    def test_petugas_cannot_create_cu(self, petugas):
        tok = requests.post(f"{BASE}/api/auth/login",
                            json={"email": petugas["email"], "password": petugas["password"]}).json()["token"]
        r = requests.post(f"{BASE}/api/cu", json={"kode": "ZZZ", "nama": "x"},
                          headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403


# ---------------- Settings ----------------
class TestSettings:
    def test_get_settings(self, admin_h):
        r = requests.get(f"{BASE}/api/settings", headers=admin_h)
        assert r.status_code == 200
        s = r.json()
        assert s["lalau_max"] == 300000000
        assert s["max_hari_berkas"] == 100

    def test_update_settings(self, admin_h):
        r = requests.put(f"{BASE}/api/settings",
                         json={"max_hari_berkas": 100, "lalau_max": 300000000, "nomor_berikutnya": 1,
                               "sanduk_brackets": [{"sampai": 55, "max": 50000000},
                                                   {"sampai": 60, "max": 37500000},
                                                   {"sampai": 65, "max": 25000000},
                                                   {"sampai": 70, "max": 12500000}]},
                         headers=admin_h)
        assert r.status_code == 200


# ---------------- Temp file upload ----------------
class TestFiles:
    def test_upload_non_pdf_rejected(self, admin_h):
        files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{BASE}/api/temp-files", files=files, headers=admin_h)
        assert r.status_code == 400

    def test_upload_pdf_ok(self, admin_h):
        files = {"file": ("doc.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}
        r = requests.post(f"{BASE}/api/temp-files", files=files, headers=admin_h)
        assert r.status_code == 200
        assert "id" in r.json()


# ---------------- Permohonan + Analisis + Pencairan happy flow ----------------
@pytest.fixture(scope="session")
def permohonan_id(admin_h, test_cu):
    # Create permohonan: age ~ 45, member for 5 years, loan 2 years ago, event = today
    body = {
        "cu_id": test_cu,
        "tanggal_terima": TODAY.isoformat(),
        "nama": "TEST_Anggota1",
        "nomor_anggota": "A001",
        "jenis_kelamin": "L",
        "tgl_lahir": "1980-01-15",
        "tgl_anggota": "2021-05-10",
        "tgl_pinjam": "2024-03-20",
        "tgl_kejadian": (TODAY - timedelta(days=5)).isoformat(),
        "sanduk": 20000000,
        "lalau": 50000000,
        "total": 70000000,
        "syarat": {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada", "spp": "ada"},
    }
    # Upload PDF and attach
    files = {"file": ("berkas.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}
    tr = requests.post(f"{BASE}/api/temp-files", files=files, headers=admin_h)
    assert tr.status_code == 200
    body["temp_file_id"] = tr.json()["id"]
    body["file_name"] = "berkas.pdf"
    r = requests.post(f"{BASE}/api/permohonan", json=body, headers=admin_h)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    requests.delete(f"{BASE}/api/permohonan/{pid}", headers=admin_h)


class TestPermohonan:
    def test_list(self, admin_h, permohonan_id):
        r = requests.get(f"{BASE}/api/permohonan", headers=admin_h)
        assert r.status_code == 200
        assert any(p["id"] == permohonan_id for p in r.json())

    def test_get_detail(self, admin_h, permohonan_id):
        r = requests.get(f"{BASE}/api/permohonan/{permohonan_id}", headers=admin_h)
        assert r.status_code == 200
        p = r.json()
        assert p["status"] == "Antrian Analisis"
        assert p["file_id"]  # temp was persisted

    def test_invalid_cu(self, admin_h):
        body = {"cu_id": "nonexistent", "tanggal_terima": TODAY.isoformat(), "nama": "x",
                "nomor_anggota": "A", "jenis_kelamin": "L", "tgl_lahir": "1980-01-01",
                "tgl_anggota": "2020-01-01", "tgl_kejadian": TODAY.isoformat()}
        r = requests.post(f"{BASE}/api/permohonan", json=body, headers=admin_h)
        assert r.status_code == 400


class TestAnalisis:
    def test_preview(self, admin_h, permohonan_id):
        r = requests.post(f"{BASE}/api/analisis/{permohonan_id}/preview",
                          json={"berkas_lengkap": True}, headers=admin_h)
        assert r.status_code == 200
        res = r.json()
        assert res["sanduk_disetujui"] == 20000000
        assert res["lalau_disetujui"] == 50000000
        assert res["hasil"] == "Disetujui"

    def test_save_analisis(self, admin_h, permohonan_id):
        r = requests.post(f"{BASE}/api/analisis/{permohonan_id}",
                          json={"berkas_lengkap": True}, headers=admin_h)
        assert r.status_code == 200
        p = requests.get(f"{BASE}/api/permohonan/{permohonan_id}", headers=admin_h).json()
        assert p["status"] == "Sudah Dianalisis"
        assert p["analisis"]["hasil"] == "Disetujui"

    def test_batch_analisis(self, admin_h, test_cu):
        # create a second permohonan then batch
        body = {
            "cu_id": test_cu, "tanggal_terima": TODAY.isoformat(),
            "nama": "TEST_Batch1", "nomor_anggota": "B001", "jenis_kelamin": "P",
            "tgl_lahir": "1985-05-05", "tgl_anggota": "2022-01-01",
            "tgl_pinjam": "2024-01-01",
            "tgl_kejadian": (TODAY - timedelta(days=10)).isoformat(),
            "sanduk": 10000000, "lalau": 20000000, "total": 30000000,
            "syarat": {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada", "spp": "ada"},
        }
        pid = requests.post(f"{BASE}/api/permohonan", json=body, headers=admin_h).json()["id"]
        r = requests.post(f"{BASE}/api/analisis-batch", json={"ids": [pid]}, headers=admin_h)
        assert r.status_code == 200
        assert r.json()["dianalisis"] >= 1
        requests.delete(f"{BASE}/api/permohonan/{pid}", headers=admin_h)


class TestPencairan:
    def test_nomor_berikutnya(self, admin_h):
        r = requests.get(f"{BASE}/api/pencairan/nomor-berikutnya", headers=admin_h)
        assert r.status_code == 200
        nomor = r.json()["nomor"]
        assert "/T/PUSAKA/" in nomor
        assert nomor.endswith("/2026")

    def test_cairkan_flow(self, admin_h, test_cu, permohonan_id):
        # Ensure analyzed (done above)
        n = requests.get(f"{BASE}/api/pencairan/nomor-berikutnya", headers=admin_h).json()
        r = requests.post(f"{BASE}/api/pencairan",
                          json={"cu_id": test_cu, "permohonan_ids": [permohonan_id], "nomor": n["nomor"]},
                          headers=admin_h)
        assert r.status_code == 200, r.text
        pen = r.json()
        assert pen["total"] == pen["sanduk"] + pen["lalau"]
        p = requests.get(f"{BASE}/api/permohonan/{permohonan_id}", headers=admin_h).json()
        assert p["status"] == "Dicairkan"
        # Delete pencairan and permohonan cleanup
        # pencairan has no delete endpoint; cleanup leftover
        # mark fixture to clean the permohonan — but it's "Dicairkan", backend blocks delete
        # So manually remove via db? We'll leave as test artifact
        # Actually fixture tries DELETE and expects 400 => still fine, cleanup via Mongo direct would be needed

    def test_duplicate_nomor(self, admin_h, test_cu):
        r = requests.post(f"{BASE}/api/pencairan",
                          json={"cu_id": test_cu, "permohonan_ids": [], "nomor": "1/T/PUSAKA/X/2026"},
                          headers=admin_h)
        assert r.status_code == 400


# ---------------- Iuran ----------------
class TestIuran:
    def test_create_batch_and_list(self, admin_h, test_cu):
        items = [{"cu_id": test_cu, "tanggal": "2026-01-15", "sanduk": 100000, "lalau": 50000, "keterangan": "TEST_rapel1"},
                 {"cu_id": test_cu, "tanggal": "2026-01-20", "sanduk": 200000, "lalau": 0, "keterangan": "TEST_rapel2"}]
        r = requests.post(f"{BASE}/api/iuran", json={"items": items}, headers=admin_h)
        assert r.status_code == 200
        assert r.json()["disimpan"] == 2
        rows = requests.get(f"{BASE}/api/iuran?cu_id=" + test_cu, headers=admin_h).json()
        iuran_ids = [r["id"] for r in rows if r.get("keterangan", "").startswith("TEST_rapel")]
        assert len(iuran_ids) >= 2
        for iid in iuran_ids:
            requests.delete(f"{BASE}/api/iuran/{iid}", headers=admin_h)


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard(self, admin_h):
        r = requests.get(f"{BASE}/api/dashboard", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "status", "hasil", "cair", "per_cu", "jumlah_cu", "recent"):
            assert k in d
