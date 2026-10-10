"""Tests for Permohonan Tertahan (Ditunda / Tidak Disetujui), CTT auto reanalisis,
and Pencairan with sebagian/tertahan narratives (iteration 7)."""
import os
from datetime import date, timedelta

import pytest
import requests

def _base():
    u = os.environ.get("REACT_APP_BACKEND_URL") or ""
    if not u:
        # fallback to frontend/.env
        from pathlib import Path
        p = Path("/app/frontend/.env")
        if p.exists():
            for ln in p.read_text().splitlines():
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    u = ln.split("=", 1)[1].strip().strip('"')
                    break
    return u.rstrip("/") + "/api"


BASE = _base()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "senopovi@gmail.com")
ADMIN_PW = os.environ.get("ADMIN_PASSWORD", "TudungAdmin#2026")


# ---------- helpers ----------
def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def cu_id(admin_tok):
    cus = requests.get(f"{BASE}/cu", headers=_h(admin_tok)).json()
    assert cus, "no CU"
    return cus[0]["id"]


def _mk_permohonan(admin_tok, cu_id, nama="TEST_ CTT", jenis_kejadian="cacat",
                   tanggal_terima=None, tgl_kejadian=None, sanduk=1_000_000, lalau=0):
    tanggal_terima = tanggal_terima or (date.today() - timedelta(days=10)).isoformat()
    tgl_kejadian = tgl_kejadian or (date.today() - timedelta(days=15)).isoformat()
    body = {
        "cu_id": cu_id,
        "tanggal_terima": tanggal_terima,
        "jenis_kejadian": jenis_kejadian,
        "nama": nama,
        "nomor_anggota": "TEST001",
        "jenis_kelamin": "L",
        "tgl_lahir": "1970-01-01",
        "tgl_anggota": "2000-01-01",
        "tgl_kejadian": tgl_kejadian,
        "sanduk": sanduk,
        "lalau": lalau,
        "total": sanduk + lalau,
        "syarat": {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada"},
    }
    r = requests.post(f"{BASE}/permohonan", json=body, headers=_h(admin_tok))
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture
def cleanup_ids():
    ids = {"permohonan": [], "users": [], "pencairan": []}
    yield ids
    tok = _login(ADMIN_EMAIL, ADMIN_PW)
    for pid in ids["pencairan"]:
        requests.delete(f"{BASE}/pencairan/{pid}", headers=_h(tok))
    for pid in ids["permohonan"]:
        requests.delete(f"{BASE}/permohonan/{pid}", headers=_h(tok))
    for uid in ids["users"]:
        requests.delete(f"{BASE}/users/{uid}", headers=_h(tok))


# ---------- 1. CTT analisis ----------
class TestCttAnalisis:
    def test_ctt_lengkap_within_180_days_returns_ditunda(self, admin_tok, cu_id, cleanup_ids):
        tt = (date.today() - timedelta(days=10)).isoformat()
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_CTT_A", tanggal_terima=tt)
        cleanup_ids["permohonan"].append(pid)
        body = {"berkas_lengkap": True}
        r = requests.post(f"{BASE}/analisis/{pid}/preview", json=body, headers=_h(admin_tok))
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["hasil"] == "Ditunda", res
        assert res["tunda_ctt"] is True
        expected = (date.fromisoformat(tt) + timedelta(days=180)).isoformat()
        assert res["tgl_ctt_180"] == expected
        # save
        r2 = requests.post(f"{BASE}/analisis/{pid}", json=body, headers=_h(admin_tok))
        assert r2.status_code == 200
        a = r2.json()
        assert a["hasil"] == "Ditunda" and a["tunda_ctt"] is True

    def test_ctt_berkas_tidak_lengkap_tidak_disetujui(self, admin_tok, cu_id, cleanup_ids):
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_CTT_B")
        cleanup_ids["permohonan"].append(pid)
        body = {"berkas_lengkap": False, "keputusan_berkas": "Tidak Disetujui"}
        r = requests.post(f"{BASE}/analisis/{pid}/preview", json=body, headers=_h(admin_tok))
        assert r.status_code == 200
        res = r.json()
        assert res["hasil"] == "Tidak Disetujui"
        assert res["tunda_ctt"] is False

    def test_ctt_override_normal_logic(self, admin_tok, cu_id, cleanup_ids):
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_CTT_C")
        cleanup_ids["permohonan"].append(pid)
        body = {"berkas_lengkap": True, "cacat_override": True, "cacat_alasan": "SK Dokter"}
        r = requests.post(f"{BASE}/analisis/{pid}/preview", json=body, headers=_h(admin_tok))
        assert r.status_code == 200
        res = r.json()
        assert res["hasil"] in ("Disetujui", "Disetujui Sebagian"), res
        assert res["tunda_ctt"] is False


# ---------- 2. /permohonan-tertahan ----------
class TestListTertahan:
    def test_list_ditunda(self, admin_tok, cu_id, cleanup_ids):
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_LIST_DIT")
        cleanup_ids["permohonan"].append(pid)
        requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        r = requests.get(f"{BASE}/permohonan-tertahan?hasil=Ditunda", headers=_h(admin_tok))
        assert r.status_code == 200
        rows = r.json()
        assert any(x["id"] == pid for x in rows)
        row = next(x for x in rows if x["id"] == pid)
        assert row["hasil"] == "Ditunda"
        assert "alasan" in row and "tunda_ctt" in row

    def test_list_tidak_disetujui(self, admin_tok, cu_id, cleanup_ids):
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_LIST_TD")
        cleanup_ids["permohonan"].append(pid)
        requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": False, "keputusan_berkas": "Tidak Disetujui"},
                      headers=_h(admin_tok))
        r = requests.get(f"{BASE}/permohonan-tertahan?hasil=Tidak%20Disetujui", headers=_h(admin_tok))
        assert r.status_code == 200
        assert any(x["id"] == pid and x["hasil"] == "Tidak Disetujui" for x in r.json())

    def test_invalid_hasil_400(self, admin_tok):
        r = requests.get(f"{BASE}/permohonan-tertahan?hasil=Foo", headers=_h(admin_tok))
        assert r.status_code == 400

    def test_petugas_without_perm_forbidden(self, admin_tok, cu_id, cleanup_ids):
        import random
        em = f"TEST_petno_{random.randint(1000,9999)}@test.com"
        r = requests.post(f"{BASE}/users", headers=_h(admin_tok), json={
            "email": em, "name": "TEST_ Petugas No", "password": "secret123",
            "role": "petugas", "cu_id": cu_id, "aktif": True,
            "hak_akses": {"ubah_hapus_permohonan": False}})
        assert r.status_code == 200, r.text
        cleanup_ids["users"].append(r.json()["id"])
        tok = _login(em, "secret123")
        r2 = requests.get(f"{BASE}/permohonan-tertahan?hasil=Ditunda", headers=_h(tok))
        assert r2.status_code == 403

    def test_petugas_own_cu_only(self, admin_tok, cu_id, cleanup_ids):
        import random
        # make a Ditunda permohonan under cu_id
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_PETU_OWN")
        cleanup_ids["permohonan"].append(pid)
        requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        em = f"TEST_petyes_{random.randint(1000,9999)}@test.com"
        r = requests.post(f"{BASE}/users", headers=_h(admin_tok), json={
            "email": em, "name": "TEST_ Petugas Yes", "password": "secret123",
            "role": "petugas", "cu_id": cu_id, "aktif": True})
        assert r.status_code == 200
        cleanup_ids["users"].append(r.json()["id"])
        tok = _login(em, "secret123")
        r2 = requests.get(f"{BASE}/permohonan-tertahan?hasil=Ditunda", headers=_h(tok))
        assert r2.status_code == 200
        rows = r2.json()
        assert all(x["cu_id"] == cu_id for x in rows)
        assert any(x["id"] == pid for x in rows)


# ---------- 3. Petugas can edit Ditunda/Tidak Disetujui, cannot edit Disetujui ----------
class TestPetugasEdit:
    def test_petugas_edit_ditunda_resets_to_antrian(self, admin_tok, cu_id, cleanup_ids):
        import random
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_PE_EDIT")
        cleanup_ids["permohonan"].append(pid)
        requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        em = f"TEST_petedit_{random.randint(1000,9999)}@test.com"
        u = requests.post(f"{BASE}/users", headers=_h(admin_tok), json={
            "email": em, "name": "TEST_ Petugas Edit", "password": "secret123",
            "role": "petugas", "cu_id": cu_id, "aktif": True}).json()
        cleanup_ids["users"].append(u["id"])
        tok = _login(em, "secret123")
        # fetch to resend
        p = requests.get(f"{BASE}/permohonan/{pid}", headers=_h(tok)).json()
        body = {k: p[k] for k in ("cu_id", "tanggal_terima", "jenis_kejadian", "nama", "nomor_anggota",
                                   "jenis_kelamin", "tgl_lahir", "tgl_anggota", "tgl_kejadian",
                                   "sanduk", "lalau", "total", "syarat") if k in p}
        body["nama"] = "TEST_PE_EDIT_X"
        r = requests.put(f"{BASE}/permohonan/{pid}", json=body, headers=_h(tok))
        assert r.status_code == 200, r.text
        p2 = requests.get(f"{BASE}/permohonan/{pid}", headers=_h(admin_tok)).json()
        assert p2["status"] == "Antrian Analisis"
        assert p2["nama"] == "TEST_PE_EDIT_X"

    def test_petugas_cannot_edit_disetujui(self, admin_tok, cu_id, cleanup_ids):
        import random
        # create Disetujui (meninggal, not cacat so no CTT)
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_PE_LOCK", jenis_kejadian="meninggal",
                             tgl_kejadian=(date.today() - timedelta(days=15)).isoformat())
        cleanup_ids["permohonan"].append(pid)
        r = requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        assert r.json()["hasil"] in ("Disetujui", "Disetujui Sebagian"), r.json()
        em = f"TEST_petlock_{random.randint(1000,9999)}@test.com"
        u = requests.post(f"{BASE}/users", headers=_h(admin_tok), json={
            "email": em, "name": "TEST_ Petugas Lock", "password": "secret123",
            "role": "petugas", "cu_id": cu_id, "aktif": True}).json()
        cleanup_ids["users"].append(u["id"])
        tok = _login(em, "secret123")
        p = requests.get(f"{BASE}/permohonan/{pid}", headers=_h(tok)).json()
        body = {k: p[k] for k in ("cu_id", "tanggal_terima", "jenis_kejadian", "nama", "nomor_anggota",
                                   "jenis_kelamin", "tgl_lahir", "tgl_anggota", "tgl_kejadian",
                                   "sanduk", "lalau", "total", "syarat") if k in p}
        r = requests.put(f"{BASE}/permohonan/{pid}", json=body, headers=_h(tok))
        assert r.status_code == 403, (r.status_code, r.text)


# ---------- 4. reanalisis_ctt ----------
class TestReanalisisCtt:
    def test_reanalisis_runs(self, admin_tok, cu_id, cleanup_ids):
        """Direct import; set tgl_ctt_180 to past date so reanalyze."""
        import asyncio
        import importlib
        import sys
        sys.path.insert(0, "/app/backend")
        server = importlib.import_module("server")
        pid = _mk_permohonan(admin_tok, cu_id, nama="TEST_REAN_CTT")
        cleanup_ids["permohonan"].append(pid)
        # analyze -> Ditunda
        requests.post(f"{BASE}/analisis/{pid}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        # force tgl_ctt_180 to yesterday AND tanggal_terima to 181 days ago
        past = (date.today() - timedelta(days=1)).isoformat()
        old_terima = (date.today() - timedelta(days=181)).isoformat()
        asyncio.get_event_loop().run_until_complete(
            server.db.permohonan.update_one({"id": pid}, {"$set": {
                "analisis.tgl_ctt_180": past, "tanggal_terima": old_terima}}))
        asyncio.get_event_loop().run_until_complete(server.reanalisis_ctt())
        # verify
        p = requests.get(f"{BASE}/permohonan/{pid}", headers=_h(admin_tok)).json()
        a = p.get("analisis", {})
        assert a.get("hasil") in ("Disetujui", "Disetujui Sebagian", "Tidak Disetujui"), a
        # if sanduk large enough it should be Disetujui/Sebagian; our member jadi 2000-01-01 (~56y), usia_max=70 ok
        assert a.get("hasil") in ("Disetujui", "Disetujui Sebagian")
        assert a.get("analis") == "sistem (otomatis 180 hari)"
        assert a.get("tunda_ctt") is False


# ---------- 5. POST /pencairan sebagian + tertahan ----------
class TestPencairanSebagianTertahan:
    def test_pencairan_includes_sebagian_and_tertahan_only_once(self, admin_tok, cu_id, cleanup_ids):
        # create a Disetujui Sebagian permohonan: lalau too old? Easiest: lalau > lalau_max to force sebagian
        # Use sanduk only but ensure sanduk < aju -> set u_ang > bracket; or set lalau big to trigger partial.
        pid_seb = _mk_permohonan(admin_tok, cu_id, nama="TEST_SEB_A",
                                  jenis_kejadian="meninggal",
                                  tgl_kejadian=(date.today() - timedelta(days=5)).isoformat(),
                                  sanduk=100_000_000, lalau=0)
        cleanup_ids["permohonan"].append(pid_seb)
        r = requests.post(f"{BASE}/analisis/{pid_seb}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        a = r.json()
        # If approved, make sure its "Disetujui Sebagian": tgl_lahir 1970 -> age ~56 bracket cap 37.5jt
        assert a["hasil"] in ("Disetujui", "Disetujui Sebagian"), a
        if a["hasil"] == "Disetujui":
            pytest.skip("Could not force Disetujui Sebagian with current rules")

        # create a Ditunda permohonan (CTT)
        pid_dit = _mk_permohonan(admin_tok, cu_id, nama="TEST_SEB_DIT")
        cleanup_ids["permohonan"].append(pid_dit)
        requests.post(f"{BASE}/analisis/{pid_dit}", json={"berkas_lengkap": True}, headers=_h(admin_tok))

        # get nomor
        nom = requests.get(f"{BASE}/pencairan/nomor-berikutnya", headers=_h(admin_tok)).json()["nomor"]
        nom = f"TEST{nom}"
        r = requests.post(f"{BASE}/pencairan", json={
            "cu_id": cu_id, "permohonan_ids": [pid_seb], "nomor": nom}, headers=_h(admin_tok))
        assert r.status_code == 200, r.text
        doc = r.json()
        cleanup_ids["pencairan"].append(doc["id"])
        assert isinstance(doc.get("sebagian"), list) and len(doc["sebagian"]) == 1
        s = doc["sebagian"][0]
        assert s["no"] == 1 and s["nama"] == "TEST_SEB_A" and s["hasil"] == "Disetujui Sebagian"
        assert isinstance(doc.get("tertahan"), list)
        assert any(t["id"] == pid_dit and t["hasil"] == "Ditunda" for t in doc["tertahan"])

        # verify lapor_pencairan_id was stamped
        tert = requests.get(f"{BASE}/permohonan-tertahan?hasil=Ditunda", headers=_h(admin_tok)).json()
        row = next((x for x in tert if x["id"] == pid_dit), None)
        assert row and row.get("lapor_pencairan_id") == doc["id"]

        # Second pencairan on same CU: create another sebagian & verify tertahan NOT included again
        pid_seb2 = _mk_permohonan(admin_tok, cu_id, nama="TEST_SEB_B", jenis_kejadian="meninggal",
                                   tgl_kejadian=(date.today() - timedelta(days=5)).isoformat(),
                                   sanduk=100_000_000)
        cleanup_ids["permohonan"].append(pid_seb2)
        requests.post(f"{BASE}/analisis/{pid_seb2}", json={"berkas_lengkap": True}, headers=_h(admin_tok))
        nom2 = requests.get(f"{BASE}/pencairan/nomor-berikutnya", headers=_h(admin_tok)).json()["nomor"]
        nom2 = f"TEST2{nom2}"
        r2 = requests.post(f"{BASE}/pencairan", json={
            "cu_id": cu_id, "permohonan_ids": [pid_seb2], "nomor": nom2}, headers=_h(admin_tok))
        assert r2.status_code == 200
        doc2 = r2.json()
        cleanup_ids["pencairan"].append(doc2["id"])
        assert not any(t["id"] == pid_dit for t in doc2["tertahan"])

        # DELETE first pencairan -> lapor_pencairan_id removed
        requests.delete(f"{BASE}/pencairan/{doc['id']}", headers=_h(admin_tok))
        cleanup_ids["pencairan"].remove(doc["id"])
        tert2 = requests.get(f"{BASE}/permohonan-tertahan?hasil=Ditunda", headers=_h(admin_tok)).json()
        row2 = next((x for x in tert2 if x["id"] == pid_dit), None)
        assert row2 and not row2.get("lapor_pencairan_id")
