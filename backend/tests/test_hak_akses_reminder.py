"""Tests for review-request #5: hak_akses per CU + email reminder cron.

Creates fully isolated TEST_ workspace: TEST_ CU + petugas user + TEST_ permohonan/iuran.
Cleans up on teardown. Never emails real inbox: uses delivered@resend.dev.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ADMIN_EMAIL = "senopovi@gmail.com"
ADMIN_PASSWORD = "TudungAdmin#2026"
CRON_SECRET = "3bf8072d1b6a5c900497c4b672baeb303fedb9c8f0608f2a"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def ah(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw})
    return r


@pytest.fixture(scope="module")
def workspace(ah):
    # create TEST_ CU
    kode = f"TEST_{uuid.uuid4().hex[:6].upper()}"
    r = requests.post(f"{BASE}/cu", headers=ah,
                      json={"kode": kode, "nama": f"TEST_CU_{kode}", "manager": "T", "bagian_tudung": "T",
                            "alamat": "x", "telepon": "0",
                            "hak_akses": {"input_iuran": True, "ubah_hapus_permohonan": True,
                                          "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True}})
    assert r.status_code == 200, r.text
    cu_id = r.json()["id"]

    # create petugas user using delivered@resend.dev
    pet_email = f"TEST_pet_{uuid.uuid4().hex[:6]}@delivered.resend.dev"
    # Actually use the sandbox email convention: "delivered@resend.dev" variations with +tags
    pet_email = f"delivered+{uuid.uuid4().hex[:6]}@resend.dev"
    r = requests.post(f"{BASE}/users", headers=ah, json={
        "email": pet_email, "name": "TEST_Petugas", "password": "petugas123",
        "role": "petugas", "cu_id": cu_id, "aktif": True})
    assert r.status_code == 200, r.text
    uid = r.json()["id"]

    # login as petugas
    r2 = _login(pet_email, "petugas123")
    assert r2.status_code == 200, r2.text
    ph = {"Authorization": f"Bearer {r2.json()['token']}"}

    data = {"cu_id": cu_id, "uid": uid, "pet_email": pet_email, "pet_headers": ph, "kode": kode,
            "permohonan_ids": [], "iuran_ids": []}
    yield data

    # ---------- teardown ----------
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    async def cleanup():
        await db.permohonan.delete_many({"cu_id": cu_id})
        await db.iuran.delete_many({"cu_id": cu_id})
        await db.pencairan.delete_many({"cu_id": cu_id})
        await db.users.delete_many({"id": uid})
        await db.notif_log.delete_many({"penerima": pet_email})
        await db.credit_unions.delete_many({"id": cu_id})
        await db.login_attempts.delete_many({})
        # restore settings
        await db.settings.update_one({"key": "app"}, {"$set": {"auto_nonaktif": 0, "nomor_berikutnya": 1}}, upsert=True)
        await db.cron_runs.delete_many({})

    asyncio.get_event_loop().run_until_complete(cleanup())
    client.close()


# ---------- helpers ----------
def _create_permohonan(headers, cu_id):
    body = {
        "cu_id": cu_id, "tanggal_terima": "2026-05-01", "nama": "TEST_Nama",
        "nomor_anggota": "BA999", "jenis_kelamin": "L", "tgl_lahir": "1970-01-01",
        "tgl_anggota": "2010-01-01", "tgl_pinjam": "2024-01-01", "tgl_kejadian": "2026-01-01",
        "sanduk": 1000000, "lalau": 500000, "total": 1500000,
    }
    r = requests.post(f"{BASE}/permohonan", headers=headers, json=body)
    return r


def _set_cu_hak(ah, cu_id, kode, hak_akses):
    body = {"kode": kode, "nama": f"TEST_CU_{kode}", "manager": "T", "bagian_tudung": "T",
            "alamat": "x", "telepon": "0", "hak_akses": hak_akses}
    r = requests.put(f"{BASE}/cu/{cu_id}", headers=ah, json=body)
    assert r.status_code == 200, r.text


# ============== TESTS ==============

# --- hak_akses persist on CU ---
def test_cu_hak_akses_persists(ah, workspace):
    r = requests.get(f"{BASE}/cu", headers=ah)
    cu = next((c for c in r.json() if c["id"] == workspace["cu_id"]), None)
    assert cu is not None
    assert cu["hak_akses"] == {"input_iuran": True, "ubah_hapus_permohonan": True,
                               "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True}


# --- petugas 403 on admin-only endpoints ---
def test_petugas_forbidden_endpoints(workspace):
    ph = workspace["pet_headers"]
    # /api/users (list)
    assert requests.get(f"{BASE}/users", headers=ph).status_code == 403
    # /api/cu POST
    r = requests.post(f"{BASE}/cu", headers=ph, json={"kode": "X", "nama": "x"})
    assert r.status_code == 403
    # /api/settings PUT
    r = requests.put(f"{BASE}/settings", headers=ph, json={"auto_nonaktif": 0})
    assert r.status_code == 403
    # /api/analisis preview
    r = requests.post(f"{BASE}/analisis/zzz/preview", headers=ph, json={})
    assert r.status_code == 403
    # /api/pencairan POST
    r = requests.post(f"{BASE}/pencairan", headers=ph, json={"cu_id": workspace["cu_id"], "permohonan_ids": [], "nomor": "x"})
    assert r.status_code == 403
    # /api/pencairan DELETE
    r = requests.delete(f"{BASE}/pencairan/zzz", headers=ph)
    assert r.status_code == 403
    # /api/permohonan/{id}/tunda
    r = requests.post(f"{BASE}/permohonan/zzz/tunda", headers=ph, json={"tunda": True})
    assert r.status_code == 403


# --- input_iuran=False blocks petugas iuran CRUD ---
def test_input_iuran_unchecked_blocks_write(ah, workspace):
    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": False, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True})
    ph = workspace["pet_headers"]
    r = requests.post(f"{BASE}/iuran", headers=ph, json={"items": [
        {"cu_id": workspace["cu_id"], "tanggal": "2026-05-01", "sanduk": 100, "lalau": 50}]})
    assert r.status_code == 403, r.text

    # list still allowed (read)
    r = requests.get(f"{BASE}/iuran", headers=ph)
    assert r.status_code == 200


def test_input_iuran_checked_allows_write(ah, workspace):
    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": True, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True})
    ph = workspace["pet_headers"]
    r = requests.post(f"{BASE}/iuran", headers=ph, json={"items": [
        {"cu_id": workspace["cu_id"], "tanggal": "2026-05-02", "sanduk": 100, "lalau": 50}]})
    assert r.status_code == 200, r.text
    # fetch and remember
    r2 = requests.get(f"{BASE}/iuran", headers=ph, params={"cu_id": workspace["cu_id"]})
    assert any(i["tanggal"] == "2026-05-02" for i in r2.json())


# --- ubah_hapus_permohonan ---
def test_ubah_hapus_permohonan_unchecked_blocks(ah, workspace):
    # create a permohonan (always allowed input)
    r = _create_permohonan(workspace["pet_headers"], workspace["cu_id"])
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    workspace["permohonan_ids"].append(pid)

    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": True, "ubah_hapus_permohonan": False, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True})
    ph = workspace["pet_headers"]
    # PUT/DELETE -> 403
    body = {"cu_id": workspace["cu_id"], "tanggal_terima": "2026-05-01", "nama": "x", "nomor_anggota": "BA999",
            "jenis_kelamin": "L", "tgl_lahir": "1970-01-01", "tgl_anggota": "2010-01-01",
            "tgl_kejadian": "2026-01-01", "sanduk": 1, "lalau": 1, "total": 2}
    assert requests.put(f"{BASE}/permohonan/{pid}", headers=ph, json=body).status_code == 403
    assert requests.delete(f"{BASE}/permohonan/{pid}", headers=ph).status_code == 403


def test_ubah_hapus_blocked_after_analyzed(ah, workspace):
    # restore hak and ensure permohonan is analyzed
    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": True, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True})
    # create new one
    r = _create_permohonan(workspace["pet_headers"], workspace["cu_id"])
    pid = r.json()["id"]
    workspace["permohonan_ids"].append(pid)
    # admin analyzes
    ar = requests.post(f"{BASE}/analisis/{pid}", headers=ah, json={})
    assert ar.status_code == 200, ar.text
    # petugas DELETE should 403 (not Antrian Analisis anymore)
    assert requests.delete(f"{BASE}/permohonan/{pid}", headers=workspace["pet_headers"]).status_code == 403


# --- lihat_hasil_analisis hides analisis field ---
def test_lihat_hasil_analisis_hides_field(ah, workspace):
    # analyze a permohonan first
    r = _create_permohonan(workspace["pet_headers"], workspace["cu_id"])
    pid = r.json()["id"]
    workspace["permohonan_ids"].append(pid)
    requests.post(f"{BASE}/analisis/{pid}", headers=ah, json={})

    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": True, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": False, "lihat_laporan_permohonan": True})
    ph = workspace["pet_headers"]
    r_list = requests.get(f"{BASE}/permohonan", headers=ph, params={"cu_id": workspace["cu_id"]})
    assert r_list.status_code == 200
    for row in r_list.json():
        assert "analisis" not in row, f"analisis should be hidden: {row.get('analisis')}"
    r_one = requests.get(f"{BASE}/permohonan/{pid}", headers=ph)
    assert r_one.status_code == 200
    assert "analisis" not in r_one.json()

    # restore
    _set_cu_hak(ah, workspace["cu_id"], workspace["kode"],
                {"input_iuran": True, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True})
    r_one = requests.get(f"{BASE}/permohonan/{pid}", headers=ph)
    assert "analisis" in r_one.json()


# --- cron /api/cron/akun auth + idempotency ---
def test_cron_requires_bearer():
    r = requests.post(f"{BASE}/cron/akun")
    assert r.status_code == 401
    r = requests.post(f"{BASE}/cron/akun", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_cron_success_and_duplicate():
    hdr = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": f"test-{uuid.uuid4().hex}"}
    r1 = requests.post(f"{BASE}/cron/akun", headers=hdr)
    assert r1.status_code == 200
    assert r1.json().get("ok") is True
    r2 = requests.post(f"{BASE}/cron/akun", headers=hdr)
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


# --- reminder email at 85 days, deactivation at 95 days ---
def _set_user_last_login(uid, days_ago):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(db.users.update_one(
        {"id": uid},
        {"$set": {"last_login_at": ts, "created_at": ts, "aktif": True},
         "$unset": {"reminder_for": "", "reactivated_at": "", "nonaktif_otomatis": "", "nonaktif_at": ""}}))
    loop.run_until_complete(db.notif_log.delete_many({"jenis": "pengingat"}))
    client.close()


def _get_user(uid):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    loop = asyncio.get_event_loop()
    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    client.close()
    return u


def test_reminder_at_85_days(ah, workspace):
    # enable auto_nonaktif
    r = requests.put(f"{BASE}/settings", headers=ah, json={"auto_nonaktif": 1, "auto_nonaktif_hari": 90})
    assert r.status_code == 200
    _set_user_last_login(workspace["uid"], 85)

    # Trigger auto_deactivate synchronously by calling list_users (admin)
    r = requests.get(f"{BASE}/users", headers=ah)
    assert r.status_code == 200

    u = _get_user(workspace["uid"])
    assert u["aktif"] is True, "petugas should still be active at day 85"
    assert u.get("reminder_for"), "reminder_for should be set"

    # notif_log entry
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    loop = asyncio.get_event_loop()
    log = loop.run_until_complete(db.notif_log.find_one({"jenis": "pengingat", "penerima": workspace["pet_email"]}))
    client.close()
    assert log is not None, "pengingat notif_log entry should exist"

    # Call again - should NOT create a second reminder (same baseline)
    requests.get(f"{BASE}/users", headers=ah)
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    loop = asyncio.get_event_loop()
    cnt = loop.run_until_complete(db.notif_log.count_documents({"jenis": "pengingat", "penerima": workspace["pet_email"]}))
    client.close()
    assert cnt == 1, f"expected 1 reminder, got {cnt}"


def test_deactivation_at_95_days(ah, workspace):
    _set_user_last_login(workspace["uid"], 95)
    r = requests.get(f"{BASE}/users", headers=ah)
    assert r.status_code == 200
    u = _get_user(workspace["uid"])
    assert u["aktif"] is False
    assert u.get("nonaktif_otomatis") is True

    # reactivate for cleanup
    body = {"email": workspace["pet_email"], "name": "TEST_Petugas", "role": "petugas",
            "cu_id": workspace["cu_id"], "aktif": True}
    requests.put(f"{BASE}/users/{workspace['uid']}", headers=ah, json=body)
    # disable auto_nonaktif
    requests.put(f"{BASE}/settings", headers=ah, json={"auto_nonaktif": 0})
