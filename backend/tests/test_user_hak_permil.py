"""Tests for review iteration 6: per-user hak_akses + per-mil (mortality per 1000)."""
import os
import uuid
import requests
import pytest
from pathlib import Path
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env["REACT_APP_BACKEND_URL"]).rstrip("/")
ADMIN = {"email": "senopovi@gmail.com", "password": "TudungAdmin#2026"}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def seed(admin_tok):
    tag = uuid.uuid4().hex[:6]
    cu_body = {
        "kode": f"TEST-{tag}", "nama": f"TEST_CU_{tag}",
        "manager": "x", "bagian_tudung": "x", "alamat": "x", "telepon": "x",
        "hak_akses": {"input_iuran": True, "ubah_hapus_permohonan": True,
                      "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True,
                      "lihat_laporan": True},
        "jumlah_anggota": 2000,
    }
    r = requests.post(f"{BASE}/api/cu", json=cu_body, headers=_h(admin_tok))
    assert r.status_code == 200, r.text
    cu_id = r.json()["id"]

    def _mk_user(suffix, hak):
        body = {"email": f"test_{tag}_{suffix}@test.local", "name": f"T_{suffix}",
                "password": "petugas123", "role": "petugas", "cu_id": cu_id,
                "aktif": True, "hak_akses": hak}
        r = requests.post(f"{BASE}/api/users", json=body, headers=_h(admin_tok))
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        lr = requests.post(f"{BASE}/api/auth/login", json={"email": body["email"], "password": "petugas123"})
        assert lr.status_code == 200, lr.text
        return uid, lr.json()["token"]

    # A: lihat_laporan OFF, input_iuran OFF (others on)
    uidA, tokA = _mk_user("A", {"input_iuran": False, "ubah_hapus_permohonan": True,
                                 "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True,
                                 "lihat_laporan": False})
    # B: all on
    uidB, tokB = _mk_user("B", {"input_iuran": True, "ubah_hapus_permohonan": True,
                                 "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True,
                                 "lihat_laporan": True})

    # Create 3 TEST_ permohonan in 2026 for this CU (as admin to avoid hak checks)
    pids = []
    for i in range(3):
        pbody = {
            "cu_id": cu_id, "tanggal_terima": "2026-02-01",
            "nama": f"TEST_P{i}_{tag}", "nomor_anggota": f"BA{i}{tag}",
            "jenis_kelamin": "L" if i % 2 == 0 else "P",
            "tgl_lahir": "1960-01-01", "tgl_anggota": "2000-01-01",
            "tgl_kejadian": f"2026-0{i+1}-15",
            "sanduk": 1000000, "lalau": 500000, "total": 1500000,
            "syarat": {},
        }
        r = requests.post(f"{BASE}/api/permohonan", json=pbody, headers=_h(admin_tok))
        assert r.status_code == 200, r.text
        pids.append(r.json()["id"])

    data = {"tag": tag, "cu_id": cu_id, "uidA": uidA, "uidB": uidB,
            "tokA": tokA, "tokB": tokB, "pids": pids}
    yield data

    # Cleanup
    for pid in pids:
        requests.delete(f"{BASE}/api/permohonan/{pid}", headers=_h(admin_tok))
    for uid in (uidA, uidB):
        requests.delete(f"{BASE}/api/users/{uid}", headers=_h(admin_tok))
    requests.delete(f"{BASE}/api/cu/{cu_id}", headers=_h(admin_tok))


# ---------- hak_akses persistence ----------
class TestUserHakPersistence:
    def test_user_hak_akses_saved_default_all_true(self, admin_tok, seed):
        r = requests.get(f"{BASE}/api/users", headers=_h(admin_tok))
        assert r.status_code == 200
        uB = next(u for u in r.json() if u["id"] == seed["uidB"])
        assert uB.get("hak_akses") == {"input_iuran": True, "ubah_hapus_permohonan": True,
                                        "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True,
                                        "lihat_laporan": True}
        uA = next(u for u in r.json() if u["id"] == seed["uidA"])
        assert uA["hak_akses"]["input_iuran"] is False
        assert uA["hak_akses"]["lihat_laporan"] is False
        assert uA["hak_akses"]["lihat_hasil_analisis"] is True

    def test_admin_has_null_hak_akses(self, admin_tok):
        r = requests.get(f"{BASE}/api/users", headers=_h(admin_tok))
        admin = next(u for u in r.json() if u["role"] == "admin")
        assert admin.get("hak_akses") is None


# ---------- Effective perm = CU AND User ----------
class TestEffectivePerm:
    def test_petugas_A_lihat_laporan_off_blocks_pencairan_list(self, seed):
        r = requests.get(f"{BASE}/api/pencairan", headers=_h(seed["tokA"]))
        assert r.status_code == 403

    def test_petugas_A_lihat_laporan_off_blocks_permil(self, seed):
        r = requests.get(f"{BASE}/api/laporan/permil?tahun=2026", headers=_h(seed["tokA"]))
        assert r.status_code == 403

    def test_petugas_B_can_list_pencairan(self, seed):
        r = requests.get(f"{BASE}/api/pencairan", headers=_h(seed["tokB"]))
        assert r.status_code == 200

    def test_petugas_B_can_permil(self, seed):
        r = requests.get(f"{BASE}/api/laporan/permil?tahun=2026", headers=_h(seed["tokB"]))
        assert r.status_code == 200
        rows = r.json()
        # petugas scope -> only own CU
        assert len(rows) == 1
        assert rows[0]["id"] == seed["cu_id"]

    def test_input_iuran_off_blocks_post(self, seed):
        body = {"items": [{"cu_id": seed["cu_id"], "tanggal": "2026-02-01",
                           "sanduk": 100, "lalau": 50, "biris": 0, "gppk": 0}]}
        r = requests.post(f"{BASE}/api/iuran", json=body, headers=_h(seed["tokA"]))
        assert r.status_code == 403

    def test_input_iuran_on_allows_post(self, seed, admin_tok):
        body = {"items": [{"cu_id": seed["cu_id"], "tanggal": "2026-02-01",
                           "sanduk": 100, "lalau": 50, "biris": 0, "gppk": 0}]}
        r = requests.post(f"{BASE}/api/iuran", json=body, headers=_h(seed["tokB"]))
        assert r.status_code == 200
        # cleanup iuran
        iur = requests.get(f"{BASE}/api/iuran", params={"cu_id": seed["cu_id"]},
                           headers=_h(admin_tok)).json()
        for i in iur:
            requests.delete(f"{BASE}/api/iuran/{i['id']}", headers=_h(admin_tok))

    def test_cu_hak_lihat_laporan_off_blocks_even_user_on(self, admin_tok, seed):
        # Flip CU lihat_laporan off
        cu_body = {"kode": f"TEST-{seed['tag']}", "nama": f"TEST_CU_{seed['tag']}",
                   "manager": "x", "bagian_tudung": "x", "alamat": "x", "telepon": "x",
                   "hak_akses": {"input_iuran": True, "ubah_hapus_permohonan": True,
                                 "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True,
                                 "lihat_laporan": False},
                   "jumlah_anggota": 2000}
        r = requests.put(f"{BASE}/api/cu/{seed['cu_id']}", json=cu_body, headers=_h(admin_tok))
        assert r.status_code == 200
        r = requests.get(f"{BASE}/api/pencairan", headers=_h(seed["tokB"]))
        assert r.status_code == 403
        r = requests.get(f"{BASE}/api/laporan/permil?tahun=2026", headers=_h(seed["tokB"]))
        assert r.status_code == 403
        # Restore
        cu_body["hak_akses"]["lihat_laporan"] = True
        requests.put(f"{BASE}/api/cu/{seed['cu_id']}", json=cu_body, headers=_h(admin_tok))


# ---------- Per Mil ----------
class TestPerMil:
    def test_permil_computed_correctly(self, admin_tok, seed):
        r = requests.get(f"{BASE}/api/laporan/permil?tahun=2026", headers=_h(admin_tok))
        assert r.status_code == 200
        rows = r.json()
        row = next(x for x in rows if x["id"] == seed["cu_id"])
        assert row["meninggal"] == 3
        assert row["anggota"] == 2000
        assert row["permil"] == 1.5
        # L=2, P=1 from seed loop (i=0,2 => L; i=1 => P)
        assert row["l"] == 2
        assert row["p"] == 1

    def test_permil_null_when_no_jumlah_anggota(self, admin_tok):
        tag = uuid.uuid4().hex[:6]
        body = {"kode": f"TEST-NA-{tag}", "nama": f"TEST_NA_{tag}",
                "manager": "", "bagian_tudung": "", "alamat": "", "telepon": "",
                "hak_akses": {}, "jumlah_anggota": 0}
        r = requests.post(f"{BASE}/api/cu", json=body, headers=_h(admin_tok))
        cid = r.json()["id"]
        r = requests.get(f"{BASE}/api/laporan/permil?tahun=2026", headers=_h(admin_tok))
        row = next(x for x in r.json() if x["id"] == cid)
        assert row["anggota"] == 0
        assert row["permil"] is None
        requests.delete(f"{BASE}/api/cu/{cid}", headers=_h(admin_tok))

    def test_dashboard_includes_permil(self, admin_tok, seed):
        r = requests.get(f"{BASE}/api/dashboard", headers=_h(admin_tok))
        assert r.status_code == 200
        assert "permil" in r.json()
        permil = r.json()["permil"]
        assert "meninggal" in permil and "anggota" in permil and "permil" in permil and "tahun" in permil

    def test_dashboard_permil_scoped_to_petugas_cu(self, seed):
        r = requests.get(f"{BASE}/api/dashboard", headers=_h(seed["tokB"]))
        assert r.status_code == 200
        permil = r.json()["permil"]
        # Only this CU: anggota should be 2000, meninggal depends on this year;
        # but anggota reflects CU's jumlah_anggota (scope cu_id present)
        assert permil["anggota"] == 2000


# ---------- CU field persistence ----------
class TestCUFields:
    def test_cu_hak_lihat_laporan_and_jumlah_anggota_saved(self, admin_tok, seed):
        r = requests.get(f"{BASE}/api/cu", headers=_h(admin_tok))
        cu = next(c for c in r.json() if c["id"] == seed["cu_id"])
        assert cu["jumlah_anggota"] == 2000
        assert cu["hak_akses"]["lihat_laporan"] is True
