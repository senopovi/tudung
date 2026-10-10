"""New features: Seed demo, Batal Pencairan, Iuran-by-Petugas with CU scoping."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://tudung-pusaka.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "senopovi@gmail.com"
ADMIN_PW = "TudungAdmin#2026"

SEED_NOMOR = ["3", "1239", "2475", "3711", "4947", "6183", "7419", "8655", "9891"]
# Expected analysis preview results on CUG-001 seed
# idx -> (hasil, approx sanduk, approx lalau)
EXPECTED = {
    0: {"hasil": "Disetujui", "sanduk": 20_000_000, "lalau": 45_000_000},
    1: {"hasil": "Disetujui Sebagian", "sanduk": 50_000_000},  # capped at 50jt
    2: {"hasil": "Disetujui Sebagian", "sanduk": 37_500_000},  # age bracket 60 -> 37.5jt
    3: {"hasil": "Disetujui Sebagian", "lalau": 0},  # >70 lalau=0
    4: {"hasil": "Tidak Disetujui"},  # berkas >100 hari
    5: {"hasil": "Disetujui Sebagian"},  # simpanan lembaga -> sanduk 0
    6: {"hasil": "Tidak Disetujui"},  # cacat <180 hari
    7: {"hasil": "Tidak Disetujui"},  # <90 hari anggota
    8: {"hasil": "Ditunda"},  # berkas tidak lengkap
}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def cug001(admin_h):
    cus = requests.get(f"{BASE}/api/cu", headers=admin_h).json()
    cu = next((c for c in cus if c["kode"] == "CUG-001"), None)
    assert cu, "Seed CUG-001 missing"
    return cu


# ---------- SEED DATA ----------
class TestSeed:
    def test_six_cus_exist(self, admin_h):
        cus = requests.get(f"{BASE}/api/cu", headers=admin_h).json()
        kodes = [c["kode"] for c in cus]
        for n in range(1, 7):
            assert f"CUG-{n:03d}" in kodes
            cu = next(c for c in cus if c["kode"] == f"CUG-{n:03d}")
            assert cu["nama"] == f"Credit Union Contoh {n:02d}"

    def test_each_cu_has_9_permohonan(self, admin_h, cug001):
        cus = requests.get(f"{BASE}/api/cu", headers=admin_h).json()
        for cu in [c for c in cus if c["kode"].startswith("CUG-")]:
            rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h,
                                params={"cu_id": cu["id"]}).json()
            assert len(rows) == 9, f"{cu['kode']} has {len(rows)}"
            nos = sorted([r["nomor_anggota"] for r in rows], key=int)
            assert nos == sorted(SEED_NOMOR, key=int)
            for r in rows:
                assert r["status"] == "Antrian Analisis"

    def test_seed_pdf_viewable(self, admin_h, cug001):
        rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h,
                            params={"cu_id": cug001["id"]}).json()
        for r in rows[:3]:
            assert r.get("file_id"), f"{r['nomor_anggota']} has no file_id"
            fr = requests.get(f"{BASE}/api/files/{r['file_id']}", headers=admin_h)
            assert fr.status_code == 200
            assert fr.headers.get("content-type", "").startswith("application/pdf")
            assert fr.content.startswith(b"%PDF")


# ---------- ANALYSIS PREVIEW over CUG-001 ----------
class TestAnalysisPreview:
    @pytest.fixture(scope="class")
    def rows_by_no(self, admin_h):
        r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        cus = requests.get(f"{BASE}/api/cu", headers=h).json()
        cu = next(c for c in cus if c["kode"] == "CUG-001")
        rows = requests.get(f"{BASE}/api/permohonan", headers=h, params={"cu_id": cu["id"]}).json()
        return {r["nomor_anggota"]: r for r in rows}

    @pytest.mark.parametrize("idx", list(range(9)))
    def test_preview(self, admin_h, rows_by_no, idx):
        nomor = SEED_NOMOR[idx]
        p = rows_by_no[nomor]
        # Don't force berkas_lengkap – let engine auto-detect from syarat (idx 8 has identitas=tidak -> Ditunda)
        r = requests.post(f"{BASE}/api/analisis/{p['id']}/preview", json={}, headers=admin_h)
        assert r.status_code == 200, r.text
        res = r.json()
        exp = EXPECTED[idx]
        assert res["hasil"] == exp["hasil"], f"idx {idx} nomor {nomor}: expected {exp['hasil']}, got {res['hasil']} full={res}"
        if "sanduk" in exp:
            assert res["sanduk_disetujui"] == exp["sanduk"], f"idx {idx}: sanduk {res}"
        if "lalau" in exp:
            assert res["lalau_disetujui"] == exp["lalau"], f"idx {idx}: lalau {res}"

    def test_cacat_override_approves_idx6(self, admin_h, rows_by_no):
        p = rows_by_no["7419"]
        body = {"berkas_lengkap": True, "cacat_override": True, "cacat_alasan": "Verifikasi medis sudah lengkap"}
        r = requests.post(f"{BASE}/api/analisis/{p['id']}/preview", json=body, headers=admin_h)
        assert r.status_code == 200
        res = r.json()
        assert res["hasil"] in ("Disetujui", "Disetujui Sebagian"), f"cacat_override expected approved, got {res['hasil']} / full={res}"


# ---------- BATAL PENCAIRAN (uses isolated TEST_ data) ----------
@pytest.fixture(scope="module")
def test_cu_bp(admin_h):
    body = {"kode": f"TB{uuid.uuid4().hex[:5].upper()}", "nama": "TEST_BatalCU",
            "manager": "M", "bagian_tudung": "B", "alamat": "A", "telepon": "0"}
    r = requests.post(f"{BASE}/api/cu", json=body, headers=admin_h)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid
    # cleanup
    rows = requests.get(f"{BASE}/api/permohonan", headers=admin_h, params={"cu_id": cid}).json()
    for p in rows:
        requests.delete(f"{BASE}/api/permohonan/{p['id']}", headers=admin_h)
    requests.delete(f"{BASE}/api/cu/{cid}", headers=admin_h)


def _mk_perm(h, cu_id, nama, no):
    body = {
        "cu_id": cu_id, "tanggal_terima": "2026-10-05",
        "nama": f"TEST_{nama}", "nomor_anggota": no, "jenis_kelamin": "L",
        "tgl_lahir": "1980-01-15", "tgl_anggota": "2021-05-10", "tgl_pinjam": "2024-03-20",
        "tgl_kejadian": "2026-10-05",
        "sanduk": 15_000_000, "lalau": 25_000_000, "total": 40_000_000,
        "syarat": {"surat_kematian": "ada", "identitas": "ada", "buku_anggota": "ada", "buku_simpanan": "ada", "spp": "ada"},
    }
    r = requests.post(f"{BASE}/api/permohonan", json=body, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestBatalPencairan:
    def test_full_flow(self, admin_h, test_cu_bp):
        # create 2 permohonan, analyze, cairkan, then batal
        p1 = _mk_perm(admin_h, test_cu_bp, "BA1", "T001")
        p2 = _mk_perm(admin_h, test_cu_bp, "BA2", "T002")
        for pid in (p1, p2):
            r = requests.post(f"{BASE}/api/analisis/{pid}", json={"berkas_lengkap": True}, headers=admin_h)
            assert r.status_code == 200
            assert r.json()["hasil"] == "Disetujui"

        n = requests.get(f"{BASE}/api/pencairan/nomor-berikutnya", headers=admin_h).json()
        r = requests.post(f"{BASE}/api/pencairan",
                          json={"cu_id": test_cu_bp, "permohonan_ids": [p1, p2], "nomor": n["nomor"]},
                          headers=admin_h)
        assert r.status_code == 200, r.text
        pen_id = r.json()["id"]

        # verify both permohonan Dicairkan
        for pid in (p1, p2):
            p = requests.get(f"{BASE}/api/permohonan/{pid}", headers=admin_h).json()
            assert p["status"] == "Dicairkan"

        # BATAL
        r = requests.delete(f"{BASE}/api/pencairan/{pen_id}", headers=admin_h)
        assert r.status_code == 200, r.text
        assert r.json()["dikembalikan"] == 2

        # verify pencairan deleted
        rows = requests.get(f"{BASE}/api/pencairan", headers=admin_h).json()
        assert not any(x["id"] == pen_id for x in rows)

        # verify permohonan reverted to Sudah Dianalisis and no pencairan_id
        for pid in (p1, p2):
            p = requests.get(f"{BASE}/api/permohonan/{pid}", headers=admin_h).json()
            assert p["status"] == "Sudah Dianalisis", p
            assert not p.get("pencairan_id")
            assert not p.get("nomor_pencairan")
            assert not p.get("tanggal_cair")

    def test_batal_404(self, admin_h):
        r = requests.delete(f"{BASE}/api/pencairan/does-not-exist", headers=admin_h)
        assert r.status_code == 404

    def test_batal_petugas_forbidden(self, admin_h, test_cu_bp):
        # make a petugas tied to this CU
        email = f"test_bp_petugas_{uuid.uuid4().hex[:6]}@example.com"
        body = {"email": email, "name": "TEST_Petugas_BP", "password": "Petugas123!",
                "role": "petugas", "cu_id": test_cu_bp, "aktif": True}
        r = requests.post(f"{BASE}/api/users", json=body, headers=admin_h)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        try:
            tok = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Petugas123!"}).json()["token"]
            r = requests.delete(f"{BASE}/api/pencairan/anything",
                                headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 403
        finally:
            requests.delete(f"{BASE}/api/users/{uid}", headers=admin_h)


# ---------- IURAN by PETUGAS ----------
@pytest.fixture(scope="module")
def two_cus_and_petugas(admin_h):
    kode_a = f"TA{uuid.uuid4().hex[:5].upper()}"
    kode_b = f"TB{uuid.uuid4().hex[:5].upper()}"
    ra = requests.post(f"{BASE}/api/cu", json={"kode": kode_a, "nama": "TEST_IuranCU_A"}, headers=admin_h)
    rb = requests.post(f"{BASE}/api/cu", json={"kode": kode_b, "nama": "TEST_IuranCU_B"}, headers=admin_h)
    assert ra.status_code == 200 and rb.status_code == 200
    cu_a, cu_b = ra.json()["id"], rb.json()["id"]

    email = f"test_iuran_petugas_{uuid.uuid4().hex[:6]}@example.com"
    pw = "Petugas123!"
    pr = requests.post(f"{BASE}/api/users",
                      json={"email": email, "name": "TEST_PetugasIuran", "password": pw,
                            "role": "petugas", "cu_id": cu_a, "aktif": True}, headers=admin_h)
    assert pr.status_code == 200, pr.text
    uid = pr.json()["id"]
    tok = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    yield {"cu_a": cu_a, "cu_b": cu_b, "h": h, "uid": uid}
    # cleanup iuran for both CUs
    for cu in (cu_a, cu_b):
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h, params={"cu_id": cu}).json()
        for r in rows:
            requests.delete(f"{BASE}/api/iuran/{r['id']}", headers=admin_h)
    requests.delete(f"{BASE}/api/users/{uid}", headers=admin_h)
    requests.delete(f"{BASE}/api/cu/{cu_a}", headers=admin_h)
    requests.delete(f"{BASE}/api/cu/{cu_b}", headers=admin_h)


class TestIuranPetugas:
    def test_petugas_can_post_own_cu(self, two_cus_and_petugas):
        d = two_cus_and_petugas
        items = [
            {"cu_id": d["cu_a"], "tanggal": "2026-01-15", "sanduk": 100000, "lalau": 50000, "keterangan": "TEST_r1"},
            {"cu_id": d["cu_a"], "tanggal": "2026-02-20", "sanduk": 200000, "lalau": 0, "keterangan": "TEST_r2"},
        ]
        r = requests.post(f"{BASE}/api/iuran", json={"items": items}, headers=d["h"])
        assert r.status_code == 200, r.text
        assert r.json()["disimpan"] == 2

    def test_petugas_post_other_cu_forbidden(self, two_cus_and_petugas):
        d = two_cus_and_petugas
        r = requests.post(f"{BASE}/api/iuran",
                          json={"items": [{"cu_id": d["cu_b"], "tanggal": "2026-01-15", "sanduk": 1}]},
                          headers=d["h"])
        assert r.status_code == 403

    def test_petugas_list_scoped(self, two_cus_and_petugas, admin_h):
        d = two_cus_and_petugas
        # admin adds iuran to CU B
        requests.post(f"{BASE}/api/iuran",
                      json={"items": [{"cu_id": d["cu_b"], "tanggal": "2026-01-15", "sanduk": 999, "keterangan": "TEST_B"}]},
                      headers=admin_h)
        # petugas list should only return CU A
        rows = requests.get(f"{BASE}/api/iuran", headers=d["h"]).json()
        assert all(r["cu_id"] == d["cu_a"] for r in rows), rows

    def test_petugas_edit_delete_own(self, two_cus_and_petugas):
        d = two_cus_and_petugas
        rows = requests.get(f"{BASE}/api/iuran", headers=d["h"]).json()
        assert rows, "petugas has no iuran"
        iid = rows[0]["id"]
        # update
        r = requests.put(f"{BASE}/api/iuran/{iid}",
                        json={"cu_id": d["cu_a"], "tanggal": "2026-01-16", "sanduk": 150000, "lalau": 50000, "keterangan": "TEST_r1_upd"},
                        headers=d["h"])
        assert r.status_code == 200, r.text
        rows = requests.get(f"{BASE}/api/iuran", headers=d["h"]).json()
        upd = next(x for x in rows if x["id"] == iid)
        assert upd["sanduk"] == 150000
        assert upd["keterangan"] == "TEST_r1_upd"
        # delete
        r = requests.delete(f"{BASE}/api/iuran/{iid}", headers=d["h"])
        assert r.status_code == 200
        rows = requests.get(f"{BASE}/api/iuran", headers=d["h"]).json()
        assert not any(x["id"] == iid for x in rows)

    def test_petugas_cannot_edit_other_cu_iuran(self, two_cus_and_petugas, admin_h):
        d = two_cus_and_petugas
        # find a CU-B iuran
        rows = requests.get(f"{BASE}/api/iuran", headers=admin_h, params={"cu_id": d["cu_b"]}).json()
        assert rows, "need iuran on cu_b"
        iid = rows[0]["id"]
        # try to update with petugas (not his CU)
        r = requests.put(f"{BASE}/api/iuran/{iid}",
                        json={"cu_id": d["cu_b"], "tanggal": "2026-01-15", "sanduk": 1},
                        headers=d["h"])
        assert r.status_code == 403
        # try to delete
        r = requests.delete(f"{BASE}/api/iuran/{iid}", headers=d["h"])
        assert r.status_code == 403
