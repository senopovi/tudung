from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import os
import re
import uuid
import base64
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, List

import bcrypt
import jwt
from bson import Binary
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Response, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from calc import analyze, DEFAULT_SETTINGS, format_nomor, rp
from email_service import send_email, EMAIL_FROM_NAME
from html import escape

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="Tudung-Pusaka")
api = APIRouter(prefix="/api")
JWT_ALG = "HS256"
MAX_PDF = 3 * 1024 * 1024
S_DIANALISIS, S_ANTRIAN, S_CAIR = "Sudah Dianalisis", "Antrian Analisis", "Dicairkan"
logger = logging.getLogger("tudung")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today():
    return datetime.now(ZoneInfo(os.environ["APP_TZ"])).date()


def new_id():
    return str(uuid.uuid4())


def hash_pw(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(p, h):
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(uid):
    payload = {"sub": uid, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


async def current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Belum login")
    try:
        payload = jwt.decode(auth[7:], os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesi berakhir, silakan login kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("aktif", True):
        raise HTTPException(401, "Pengguna tidak ditemukan / nonaktif")
    return user


async def admin_user(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Hanya Admin Pusat")
    return user


def scope_cu(user, cu_id=None):
    return cu_id if user["role"] == "admin" else user.get("cu_id")


def check_cu(user, cu_id):
    if user["role"] != "admin" and cu_id != user.get("cu_id"):
        raise HTTPException(403, "Akses ditolak untuk Credit Union ini")


async def get_settings():
    doc = await db.settings.find_one({"key": "app"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(doc or {})}


async def cu_map():
    return {c["id"]: c for c in await db.credit_unions.find({}, {"_id": 0}).to_list(2000)}


async def persist_temp(temp_id, cu_id):
    t = await db.temp_files.find_one({"id": temp_id})
    if not t:
        raise HTTPException(400, "Berkas sementara tidak ditemukan, silakan upload ulang")
    fid = new_id()
    await db.files.insert_one({"id": fid, "filename": t["filename"], "size": t["size"], "data": t["data"], "cu_id": cu_id, "created_at": now_iso()})
    await db.temp_files.delete_one({"id": temp_id})
    return fid


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else ''}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("until", "") > now_iso():
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.")
    await auto_deactivate()
    user = await db.users.find_one({"email": email})
    if user and verify_pw(body.password, user["password_hash"]) and not user.get("aktif", True):
        raise HTTPException(403, "Akun Anda nonaktif" + (" karena tidak login lebih dari batas hari yang ditentukan" if user.get("nonaktif_otomatis") else "") + ". Hubungi Admin Pusat.")
    if not user or not verify_pw(body.password, user["password_hash"]) or not user.get("aktif", True):
        cnt = (att or {}).get("count", 0) + 1
        until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": cnt, "until": until}}, upsert=True)
        raise HTTPException(401, "Email atau password salah")
    await db.login_attempts.delete_one({"identifier": ident})
    at = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": at}, "$inc": {"login_count": 1}})
    await db.login_history.insert_one({"user_id": user["id"], "at": at, "ip": request.client.host if request.client else "",
                                       "agent": request.headers.get("user-agent", "")[:200]})
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": make_token(user["id"]), "user": user}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


class ChangePwIn(BaseModel):
    password_lama: str
    password_baru: str


@api.post("/auth/change-password")
async def change_password(body: ChangePwIn, user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not verify_pw(body.password_lama, doc["password_hash"]):
        raise HTTPException(400, "Password lama salah")
    if len(body.password_baru) < 6:
        raise HTTPException(400, "Password baru minimal 6 karakter")
    if body.password_baru == body.password_lama:
        raise HTTPException(400, "Password baru harus berbeda dari password lama")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.password_baru)}})
    await db.password_reset_tokens.update_many({"user_id": user["id"]}, {"$set": {"used": True}})
    return {"message": "Password berhasil diubah"}


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


def _tok_hash(t):
    return hashlib.sha256(t.encode()).hexdigest()


RESET_MSG = "Jika email terdaftar, tautan reset password telah dikirim. Periksa inbox/spam Anda."


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email, "aktif": {"$ne": False}})
    if not user:
        return {"message": RESET_MSG}
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    if await db.password_reset_tokens.count_documents({"user_id": user["id"], "created_at": {"$gte": hour_ago}}) >= 3:
        return {"message": RESET_MSG}
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({"token_hash": _tok_hash(token), "user_id": user["id"], "used": False,
                                               "created_at": now, "expires_at": now + timedelta(hours=1)})
    link = f"{os.environ['FRONTEND_URL'].rstrip('/')}/reset-password?token={token}"
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1c1917">'
        f'<h2 style="color:#155e46;margin:0 0 12px">Reset Password {escape(EMAIL_FROM_NAME)}</h2>'
        f'<p>Halo {escape(user.get("name", ""))}, kami menerima permintaan untuk mengatur ulang password akun Anda.</p>'
        f'<p><a href="{escape(link)}" style="display:inline-block;background:#155e46;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Atur Ulang Password</a></p>'
        '<p>Tautan berlaku 1 jam dan hanya bisa dipakai sekali. Jika Anda tidak meminta reset, abaikan email ini; password Anda tidak berubah.</p>'
        f'<p style="font-size:12px;color:#888">Email otomatis dari {escape(EMAIL_FROM_NAME)}. Kami tidak pernah meminta password Anda melalui email.</p>'
        '</td></tr></table>')
    ok, info = await send_email(to=[email], subject=f"Reset Password {EMAIL_FROM_NAME}", html=html)
    if not ok:
        logger.warning(f"Reset email gagal untuk {email}: {info}")
    return {"message": RESET_MSG}


@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    if len(body.password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter")
    t = await db.password_reset_tokens.find_one({"token_hash": _tok_hash(body.token)})
    exp = t and t["expires_at"].replace(tzinfo=t["expires_at"].tzinfo or timezone.utc)
    if not t or t["used"] or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta ulang.")
    await db.users.update_one({"id": t["user_id"]}, {"$set": {"password_hash": hash_pw(body.password)}})
    await db.password_reset_tokens.update_many({"user_id": t["user_id"]}, {"$set": {"used": True}})
    user = await db.users.find_one({"id": t["user_id"]}, {"email": 1})
    if user:
        await db.login_attempts.delete_many({"identifier": {"$regex": f":{re.escape(user['email'])}$"}})
    return {"message": "Password berhasil diubah. Silakan login dengan password baru."}


# ---------- Users ----------
class UserIn(BaseModel):
    email: str
    name: str
    password: Optional[str] = None
    role: str = "petugas"
    cu_id: Optional[str] = None
    aktif: bool = True


@api.get("/users")
async def list_users(_=Depends(admin_user)):
    await auto_deactivate()
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(2000)


async def auto_deactivate():
    s = await get_settings()
    if not s.get("auto_nonaktif"):
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(s["auto_nonaktif_hari"]))).isoformat()
    remind = (datetime.now(timezone.utc) - timedelta(days=max(int(s["auto_nonaktif_hari"]) - 7, 0))).isoformat()
    n = 0
    for u in await db.users.find({"role": "petugas", "aktif": {"$ne": False}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "last_login_at": 1, "created_at": 1, "reactivated_at": 1, "reminder_for": 1}).to_list(5000):
        base = max(u.get("last_login_at") or "", u.get("created_at") or "", u.get("reactivated_at") or "")
        if base < cutoff:
            await db.users.update_one({"id": u["id"]}, {"$set": {"aktif": False, "nonaktif_otomatis": True, "nonaktif_at": now_iso()}})
            n += 1
        elif base < remind and u.get("reminder_for") != base:
            await db.users.update_one({"id": u["id"]}, {"$set": {"reminder_for": base}})
            await _kirim_pengingat(u, base, int(s["auto_nonaktif_hari"]))
    return n


async def _kirim_pengingat(u, base, hari):
    batas = (datetime.fromisoformat(base) + timedelta(days=hari)).astimezone(ZoneInfo(os.environ["APP_TZ"]))
    tgl = f"{batas.day} {BULAN_ID[batas.month - 1]} {batas.year}"
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1c1917">'
        f'<h2 style="color:#b45309;margin:0 0 12px">Akun {escape(EMAIL_FROM_NAME)} Akan Dinonaktifkan</h2>'
        f'<p>Halo {escape(u.get("name", ""))}, akun petugas Anda belum digunakan untuk login dalam waktu lama.</p>'
        f'<p>Demi keamanan, akun akan <b>dinonaktifkan otomatis pada {tgl}</b> jika tidak ada login sebelum tanggal tersebut.</p>'
        '<p>Cukup login seperti biasa ke aplikasi untuk menjaga akun tetap aktif. Jika akun sudah nonaktif, hubungi Admin Pusat.</p>'
        f'<p style="font-size:12px;color:#888">Email otomatis dari {escape(EMAIL_FROM_NAME)}. Kami tidak pernah meminta password Anda melalui email.</p>'
        '</td></tr></table>')
    ok, info = await send_email(to=[u["email"]], subject=f"[{EMAIL_FROM_NAME}] Pengingat: akun akan dinonaktifkan {tgl}", html=html)
    await db.notif_log.insert_one({"id": new_id(), "jenis": "pengingat", "tahun": today().year, "cu": [f"Pengingat akun {u['email']}"],
                                   "penerima": [u["email"]], "terkirim": ok, "info": info, "created_at": now_iso()})


@api.post("/cron/akun")
async def cron_akun(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or new_id()
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "at": now_iso()})
    background.add_task(auto_deactivate)
    return {"ok": True}


def _user_doc(body: UserIn):
    if body.role not in ("admin", "petugas"):
        raise HTTPException(400, "Role tidak valid")
    if body.role == "petugas" and not body.cu_id:
        raise HTTPException(400, "Petugas wajib memilih Credit Union")
    return {"email": body.email.strip().lower(), "name": body.name, "role": body.role,
            "cu_id": body.cu_id if body.role == "petugas" else None, "aktif": body.aktif}


@api.post("/users")
async def create_user(body: UserIn, _=Depends(admin_user)):
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter")
    doc = _user_doc(body)
    if await db.users.find_one({"email": doc["email"]}):
        raise HTTPException(400, "Email sudah terdaftar")
    doc.update({"id": new_id(), "password_hash": hash_pw(body.password), "created_at": now_iso()})
    await db.users.insert_one(doc)
    return {"id": doc["id"]}


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserIn, admin=Depends(admin_user)):
    doc = _user_doc(body)
    if await db.users.find_one({"email": doc["email"], "id": {"$ne": uid}}):
        raise HTTPException(400, "Email sudah terdaftar")
    if uid == admin["id"] and (doc["role"] != "admin" or not doc["aktif"]):
        raise HTTPException(400, "Tidak bisa menurunkan/menonaktifkan akun sendiri")
    old = await db.users.find_one({"id": uid}, {"aktif": 1})
    if doc["aktif"] and old and old.get("aktif") is False:
        doc.update({"reactivated_at": now_iso(), "nonaktif_otomatis": False})
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Password minimal 6 karakter")
        doc["password_hash"] = hash_pw(body.password)
    await db.users.update_one({"id": uid}, {"$set": doc})
    return {"ok": True}


@api.get("/users/{uid}/login-history")
async def login_history(uid: str, _=Depends(admin_user)):
    return await db.login_history.find({"user_id": uid}, {"_id": 0}).sort("at", -1).to_list(20)


@api.delete("/users/{uid}")
async def delete_user(uid: str, admin=Depends(admin_user)):
    if uid == admin["id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    await db.users.delete_one({"id": uid})
    await db.login_history.delete_many({"user_id": uid})
    return {"ok": True}


# ---------- Puskopdit & CU ----------
class PuskopditIn(BaseModel):
    nomor: str = ""
    nama: str = ""
    alamat: str = ""
    manager: str = ""
    bagian_tudung: str = ""
    telepon: str = ""


@api.get("/puskopdit")
async def get_puskopdit(_=Depends(current_user)):
    return await db.puskopdit.find_one({"key": "profile"}, {"_id": 0}) or {}


@api.put("/puskopdit")
async def put_puskopdit(body: PuskopditIn, _=Depends(admin_user)):
    await db.puskopdit.update_one({"key": "profile"}, {"$set": body.model_dump()}, upsert=True)
    return {"ok": True}


class CUIn(BaseModel):
    kode: str
    nama: str
    manager: str = ""
    bagian_tudung: str = ""
    alamat: str = ""
    telepon: str = ""
    hak_akses: dict = {}


HAK_DEFAULT = {"input_iuran": True, "ubah_hapus_permohonan": True, "lihat_hasil_analisis": True, "lihat_laporan_permohonan": True}
BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def _cu_doc(body: CUIn):
    d = body.model_dump()
    d["hak_akses"] = {k: bool(body.hak_akses.get(k, v)) for k, v in HAK_DEFAULT.items()}
    return d


async def can(user, perm):
    if user["role"] == "admin":
        return True
    cu = await db.credit_unions.find_one({"id": user.get("cu_id")}, {"hak_akses": 1}) or {}
    return {**HAK_DEFAULT, **(cu.get("hak_akses") or {})}.get(perm, False)


async def require_perm(user, perm):
    if not await can(user, perm):
        raise HTTPException(403, "Credit Union Anda tidak memiliki hak akses untuk tindakan ini")

@api.get("/cu")
async def list_cu(user=Depends(current_user)):
    q = {} if user["role"] == "admin" else {"id": user.get("cu_id")}
    return await db.credit_unions.find(q, {"_id": 0}).sort("kode", 1).to_list(2000)


@api.post("/cu")
async def create_cu(body: CUIn, _=Depends(admin_user)):
    if await db.credit_unions.find_one({"kode": body.kode}):
        raise HTTPException(400, "Kode Credit Union sudah ada")
    doc = {**_cu_doc(body), "id": new_id(), "created_at": now_iso()}
    await db.credit_unions.insert_one(doc)
    return {"id": doc["id"]}


@api.put("/cu/{cid}")
async def update_cu(cid: str, body: CUIn, _=Depends(admin_user)):
    if await db.credit_unions.find_one({"kode": body.kode, "id": {"$ne": cid}}):
        raise HTTPException(400, "Kode Credit Union sudah ada")
    await db.credit_unions.update_one({"id": cid}, {"$set": _cu_doc(body)})
    return {"ok": True}


@api.delete("/cu/{cid}")
async def delete_cu(cid: str, _=Depends(admin_user)):
    if await db.permohonan.find_one({"cu_id": cid}) or await db.iuran.find_one({"cu_id": cid}):
        raise HTTPException(400, "Credit Union masih memiliki data permohonan/iuran")
    await db.credit_unions.delete_one({"id": cid})
    return {"ok": True}


# ---------- Settings ----------
@api.get("/settings")
async def read_settings(_=Depends(current_user)):
    s = await get_settings()
    s.pop("key", None)
    return s


@api.put("/settings")
async def write_settings(body: dict, _=Depends(admin_user)):
    data = {k: v for k, v in body.items() if k in DEFAULT_SETTINGS}
    try:
        return await _write_settings(data)
    except (ValueError, TypeError, KeyError):
        raise HTTPException(400, "Nilai pengaturan tidak valid")


async def _write_settings(data):
    if "sanduk_brackets" in data:
        data["sanduk_brackets"] = sorted(
            [{"sampai": float(b["sampai"]), "max": int(b["max"])} for b in data["sanduk_brackets"]], key=lambda b: b["sampai"])
    for k in data:
        if k != "sanduk_brackets":
            data[k] = int(data[k])
    await db.settings.update_one({"key": "app"}, {"$set": data}, upsert=True)
    return {"ok": True}


@api.post("/settings/kop")
async def upload_kop(file: UploadFile = File(...), _=Depends(admin_user)):
    if file.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(400, "Kop surat harus JPG atau PNG")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(400, "Ukuran kop surat maksimal 2 MB")
    url = f"data:{file.content_type};base64,{base64.b64encode(data).decode()}"
    await db.settings.update_one({"key": "app"}, {"$set": {"kop_surat": url}}, upsert=True)
    return {"kop_surat": url}


@api.delete("/settings/kop")
async def delete_kop(_=Depends(admin_user)):
    await db.settings.update_one({"key": "app"}, {"$unset": {"kop_surat": ""}})
    return {"ok": True}


# ---------- Files ----------
@api.post("/temp-files")
async def upload_temp(file: UploadFile = File(...), _=Depends(current_user)):
    data = await file.read()
    if not (file.filename or "").lower().endswith(".pdf") or not data.startswith(b"%PDF"):
        raise HTTPException(400, "Berkas harus berformat PDF")
    if len(data) > MAX_PDF:
        raise HTTPException(400, "Ukuran berkas maksimal 3 MB")
    tid = new_id()
    await db.temp_files.insert_one({"id": tid, "filename": file.filename, "size": len(data), "data": Binary(data), "created_at": now_iso()})
    return {"id": tid, "filename": file.filename, "size": len(data)}


def _pdf(doc):
    return Response(content=bytes(doc["data"]), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'})


@api.get("/temp-files/{tid}")
async def get_temp(tid: str, _=Depends(current_user)):
    doc = await db.temp_files.find_one({"id": tid})
    if not doc:
        raise HTTPException(404, "Berkas tidak ditemukan")
    return _pdf(doc)


@api.get("/files/{fid}")
async def get_file(fid: str, user=Depends(current_user)):
    doc = await db.files.find_one({"id": fid})
    if not doc:
        raise HTTPException(404, "Berkas tidak ditemukan")
    check_cu(user, doc.get("cu_id"))
    return _pdf(doc)


# ---------- Permohonan ----------
class PermohonanIn(BaseModel):
    cu_id: str
    tanggal_terima: str
    jenis_simpanan: str = "perorangan"
    jenis_pinjaman: str = "perorangan"
    pernah_bantuan: str = "belum"
    jenis_kejadian: str = "meninggal"
    nama: str
    nomor_anggota: str
    jenis_kelamin: str
    tgl_lahir: str
    tgl_anggota: str
    tgl_pinjam: Optional[str] = None
    tujuan_pinjaman: str = ""
    tgl_kejadian: str
    penyebab: str = ""
    sanduk: int = 0
    lalau: int = 0
    total: int = 0
    syarat: dict = {}
    file_id: Optional[str] = None
    temp_file_id: Optional[str] = None
    file_name: Optional[str] = None


async def _get_p(pid, user):
    p = await db.permohonan.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Data Permohonan tidak ditemukan")
    check_cu(user, p["cu_id"])
    return p


async def _p_doc(body: PermohonanIn, user, old=None):
    check_cu(user, body.cu_id)
    if not await db.credit_unions.find_one({"id": body.cu_id}):
        raise HTTPException(400, "Credit Union tidak valid")
    if body.jenis_kelamin not in ("L", "P"):
        raise HTTPException(400, "Jenis kelamin tidak valid")
    doc = body.model_dump(exclude={"temp_file_id"})
    doc["tgl_pinjam"] = body.tgl_pinjam or None
    if not doc["tgl_pinjam"]:
        doc["syarat"] = {**doc["syarat"], "spp": "tidak"}
    if body.temp_file_id:
        doc["file_id"] = await persist_temp(body.temp_file_id, body.cu_id)
        if old and old.get("file_id"):
            await db.files.delete_one({"id": old["file_id"]})
    return doc


@api.get("/permohonan")
async def list_permohonan(request: Request, user=Depends(current_user)):
    f = request.query_params
    q = {}
    cu = scope_cu(user, f.get("cu_id"))
    if cu:
        q["cu_id"] = cu
    if f.get("status"):
        q["status"] = {"$in": f.get("status").split(",")}
    lihat_hasil = await can(user, "lihat_hasil_analisis")
    if f.get("hasil") and lihat_hasil:
        q["analisis.hasil"] = f.get("hasil")
    if f.get("jk"):
        q["jenis_kelamin"] = f.get("jk")
    if f.get("pencairan_id"):
        q["pencairan_id"] = f.get("pencairan_id")
    if f.get("q"):
        rx = {"$regex": re.escape(f.get("q")), "$options": "i"}
        q["$or"] = [{"nama": rx}, {"nomor_anggota": rx}]
    for field, a, b in (("tanggal_terima", "terima_dari", "terima_sampai"), ("tanggal_cair", "cair_dari", "cair_sampai")):
        rng = {}
        if f.get(a):
            rng["$gte"] = f.get(a)
        if f.get(b):
            rng["$lte"] = f.get(b)
        if rng:
            q[field] = rng
    rows = await db.permohonan.find(q, {"_id": 0, **({} if lihat_hasil else {"analisis": 0})}).sort("created_at", -1).to_list(10000)
    cus = await cu_map()
    for r in rows:
        r["cu_nama"] = cus.get(r["cu_id"], {}).get("nama", "-")
        r["cu_kode"] = cus.get(r["cu_id"], {}).get("kode", "-")
    return rows


@api.get("/permohonan/{pid}")
async def get_permohonan(pid: str, user=Depends(current_user)):
    p = await _get_p(pid, user)
    cu = await db.credit_unions.find_one({"id": p["cu_id"]}, {"_id": 0}) or {}
    p["cu_nama"] = cu.get("nama", "-")
    if not await can(user, "lihat_hasil_analisis"):
        p.pop("analisis", None)
    return p


async def _petugas_edit(user, p):
    if user["role"] != "admin":
        await require_perm(user, "ubah_hapus_permohonan")
        if p["status"] != S_ANTRIAN:
            raise HTTPException(403, "Petugas hanya bisa mengubah/menghapus permohonan yang masih Antrian Analisis")


@api.post("/permohonan")
async def create_permohonan(body: PermohonanIn, user=Depends(current_user)):
    doc = await _p_doc(body, user)
    doc.update({"id": new_id(), "status": S_ANTRIAN, "created_at": now_iso(), "created_by": user["email"]})
    await db.permohonan.insert_one(doc)
    return {"id": doc["id"]}


@api.put("/permohonan/{pid}")
async def update_permohonan(pid: str, body: PermohonanIn, user=Depends(current_user)):
    old = await _get_p(pid, user)
    await _petugas_edit(user, old)
    if old["status"] == S_CAIR:
        raise HTTPException(400, "Data yang sudah dicairkan tidak bisa diubah")
    doc = await _p_doc(body, user, old)
    doc.update({"status": S_ANTRIAN, "updated_at": now_iso(), "tunda_pencairan": False})
    await db.permohonan.update_one({"id": pid}, {"$set": doc, "$unset": {"analisis": ""}})
    return {"ok": True}


@api.delete("/permohonan/{pid}")
async def delete_permohonan(pid: str, user=Depends(current_user)):
    p = await _get_p(pid, user)
    await _petugas_edit(user, p)
    if p["status"] == S_CAIR:
        raise HTTPException(400, "Data yang sudah dicairkan tidak bisa dihapus")
    a = p.get("analisis") or {}
    ids = [i for i in (p.get("file_id"), a.get("lalau_file_id"), a.get("cacat_file_id")) if i]
    await db.files.delete_many({"id": {"$in": ids}})
    await db.permohonan.delete_one({"id": pid})
    return {"ok": True}


class TundaIn(BaseModel):
    tunda: bool


@api.post("/permohonan/{pid}/tunda")
async def tunda(pid: str, body: TundaIn, _=Depends(admin_user)):
    await db.permohonan.update_one({"id": pid, "status": S_DIANALISIS}, {"$set": {"tunda_pencairan": body.tunda}})
    return {"ok": True}


# ---------- Analisis ----------
class AnalisisIn(BaseModel):
    kelonggaran_berkas: bool = False
    sanduk_saldo_70: Optional[int] = None
    sanduk_alasan: str = ""
    lalau_override: bool = False
    lalau_alasan: str = ""
    lalau_manual: Optional[int] = None
    lalau_file_id: Optional[str] = None
    lalau_temp_id: Optional[str] = None
    lalau_file_name: Optional[str] = None
    cacat_override: bool = False
    cacat_alasan: str = ""
    cacat_file_id: Optional[str] = None
    cacat_temp_id: Optional[str] = None
    cacat_file_name: Optional[str] = None
    berkas_lengkap: Optional[bool] = None
    keputusan_berkas: str = "Ditunda"
    catatan: str = ""


def _inp(body: AnalisisIn):
    d = body.model_dump()
    d["has_lalau_file"] = bool(body.lalau_file_id or body.lalau_temp_id)
    d["has_cacat_file"] = bool(body.cacat_file_id or body.cacat_temp_id)
    return d


@api.post("/analisis/{pid}/preview")
async def preview_analisis(pid: str, body: AnalisisIn, user=Depends(admin_user)):
    p = await _get_p(pid, user)
    return analyze(p, _inp(body), await get_settings(), today())


async def _save_analisis(p, body: AnalisisIn, user, s):
    inp = _inp(body)
    res = analyze(p, inp, s, today())
    for k in ("lalau", "cacat"):
        if inp[f"{k}_temp_id"]:
            old = (p.get("analisis") or {}).get(f"{k}_file_id")
            inp[f"{k}_file_id"] = await persist_temp(inp[f"{k}_temp_id"], p["cu_id"])
            if old:
                await db.files.delete_one({"id": old})
        inp.pop(f"{k}_temp_id")
    inp.pop("has_lalau_file")
    inp.pop("has_cacat_file")
    analisis = {**inp, **res, "tanggal_analisis": today().isoformat(), "analis": user["email"]}
    await db.permohonan.update_one({"id": p["id"]}, {"$set": {"analisis": analisis, "status": S_DIANALISIS, "tunda_pencairan": False}})
    return analisis


@api.post("/analisis/{pid}")
async def save_analisis(pid: str, body: AnalisisIn, user=Depends(admin_user)):
    p = await _get_p(pid, user)
    if p["status"] == S_CAIR:
        raise HTTPException(400, "Data sudah dicairkan")
    return await _save_analisis(p, body, user, await get_settings())


class BatchIn(BaseModel):
    ids: List[str]


@api.post("/analisis-batch")
async def batch_analisis(body: BatchIn, user=Depends(admin_user)):
    s = await get_settings()
    done = 0
    for p in await db.permohonan.find({"id": {"$in": body.ids}, "status": S_ANTRIAN}, {"_id": 0}).to_list(5000):
        await _save_analisis(p, AnalisisIn(), user, s)
        done += 1
    return {"dianalisis": done}


# ---------- Pencairan ----------
@api.get("/pencairan/nomor-berikutnya")
async def nomor_berikutnya(_=Depends(admin_user)):
    s = await get_settings()
    return {"nomor": format_nomor(s["nomor_berikutnya"], today()), "tanggal": today().isoformat()}


class CairIn(BaseModel):
    cu_id: str
    permohonan_ids: List[str]
    nomor: str


@api.post("/pencairan")
async def cairkan(body: CairIn, background: BackgroundTasks, user=Depends(admin_user)):
    nomor = body.nomor.strip()
    if not nomor or not body.permohonan_ids:
        raise HTTPException(400, "Nomor pencairan dan data wajib diisi")
    if await db.pencairan.find_one({"nomor": nomor}):
        raise HTTPException(400, "Nomor pencairan sudah digunakan")
    rows = await db.permohonan.find({"id": {"$in": body.permohonan_ids}}, {"_id": 0}).to_list(5000)
    if len(rows) != len(set(body.permohonan_ids)):
        raise HTTPException(400, "Sebagian data tidak ditemukan")
    for r in rows:
        a = r.get("analisis") or {}
        if r["cu_id"] != body.cu_id:
            raise HTTPException(400, "Pencairan tidak bisa digabung antar Credit Union")
        if r["status"] != S_DIANALISIS or r.get("tunda_pencairan"):
            raise HTTPException(400, f"{r['nama']}: belum siap dicairkan")
        if a.get("hasil") not in ("Disetujui", "Disetujui Sebagian") or not a.get("total_disetujui"):
            raise HTTPException(400, f"{r['nama']}: hasil analisis {a.get('hasil')} tidak bisa dicairkan")
    tgl = today().isoformat()
    doc = {"id": new_id(), "nomor": nomor, "tanggal": tgl, "cu_id": body.cu_id, "jumlah_anggota": len(rows),
           "sanduk": sum(r["analisis"]["sanduk_disetujui"] for r in rows),
           "lalau": sum(r["analisis"]["lalau_disetujui"] for r in rows),
           "created_by": user["email"], "created_at": now_iso()}
    doc["total"] = doc["sanduk"] + doc["lalau"]
    await db.pencairan.insert_one(doc)
    await db.permohonan.update_many({"id": {"$in": body.permohonan_ids}}, {"$set": {
        "status": S_CAIR, "pencairan_id": doc["id"], "nomor_pencairan": nomor, "tanggal_cair": tgl}})
    m = re.match(r"^\s*(\d+)", nomor)
    s = await get_settings()
    if m and int(m.group(1)) >= s["nomor_berikutnya"]:
        await db.settings.update_one({"key": "app"}, {"$set": {"nomor_berikutnya": int(m.group(1)) + 1}}, upsert=True)
    doc.pop("_id", None)
    background.add_task(check_defisit)
    return doc


@api.delete("/pencairan/{cid}")
async def batal_pencairan(cid: str, background: BackgroundTasks, _=Depends(admin_user)):
    doc = await db.pencairan.find_one({"id": cid})
    if not doc:
        raise HTTPException(404, "Pencairan tidak ditemukan")
    r = await db.permohonan.update_many({"pencairan_id": cid}, {
        "$set": {"status": S_DIANALISIS, "tunda_pencairan": False},
        "$unset": {"pencairan_id": "", "nomor_pencairan": "", "tanggal_cair": ""}})
    await db.pencairan.delete_one({"id": cid})
    background.add_task(check_defisit)
    return {"dikembalikan": r.modified_count}


@api.get("/pencairan")
async def list_pencairan(request: Request, user=Depends(current_user)):
    f = request.query_params
    q = {}
    cu = scope_cu(user, f.get("cu_id"))
    if cu:
        q["cu_id"] = cu
    rng = {}
    if f.get("dari"):
        rng["$gte"] = f.get("dari")
    if f.get("sampai"):
        rng["$lte"] = f.get("sampai")
    if rng:
        q["tanggal"] = rng
    rows = await db.pencairan.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    cus = await cu_map()
    for r in rows:
        r["cu_nama"] = cus.get(r["cu_id"], {}).get("nama", "-")
    return rows


# ---------- Iuran ----------
class IuranIn(BaseModel):
    cu_id: str
    tanggal: str
    sanduk: int = 0
    lalau: int = 0
    keterangan: str = ""
    biris: int = 0
    gppk: int = 0
    keterangan2: str = ""


class IuranBatch(BaseModel):
    items: List[IuranIn]


def _iuran(i: IuranIn):
    d = i.model_dump()
    d["total"] = i.sanduk + i.lalau
    return d


async def _own_iuran(iid, user):
    doc = await db.iuran.find_one({"id": iid})
    if not doc:
        raise HTTPException(404, "Iuran tidak ditemukan")
    check_cu(user, doc["cu_id"])


@api.get("/iuran")
async def list_iuran(request: Request, user=Depends(current_user)):
    f = request.query_params
    q = {}
    cu = scope_cu(user, f.get("cu_id"))
    if cu:
        q["cu_id"] = cu
    rng = {}
    if f.get("dari"):
        rng["$gte"] = f.get("dari")
    if f.get("sampai"):
        rng["$lte"] = f.get("sampai")
    if rng:
        q["tanggal"] = rng
    rows = await db.iuran.find(q, {"_id": 0}).sort([("tanggal", 1), ("created_at", 1)]).to_list(10000)
    cus = await cu_map()
    for r in rows:
        r["cu_nama"] = cus.get(r["cu_id"], {}).get("nama", "-")
    return rows


@api.post("/iuran")
async def create_iuran(body: IuranBatch, background: BackgroundTasks, user=Depends(current_user)):
    if not body.items:
        raise HTTPException(400, "Tidak ada data iuran")
    await require_perm(user, "input_iuran")
    for i in body.items:
        check_cu(user, i.cu_id)
    docs = [{**_iuran(i), "id": new_id(), "created_at": now_iso()} for i in body.items]
    await db.iuran.insert_many(docs)
    background.add_task(check_defisit)
    return {"disimpan": len(docs)}


@api.put("/iuran/{iid}")
async def update_iuran(iid: str, body: IuranIn, background: BackgroundTasks, user=Depends(current_user)):
    background.add_task(check_defisit)
    await require_perm(user, "input_iuran")
    await _own_iuran(iid, user)
    check_cu(user, body.cu_id)
    await db.iuran.update_one({"id": iid}, {"$set": _iuran(body)})
    return {"ok": True}


@api.delete("/iuran/{iid}")
async def delete_iuran(iid: str, background: BackgroundTasks, user=Depends(current_user)):
    background.add_task(check_defisit)
    await require_perm(user, "input_iuran")
    await _own_iuran(iid, user)
    await db.iuran.delete_one({"id": iid})
    return {"ok": True}


# ---------- Data Contoh ----------
DEMO_Q = {"created_by": "seed-demo"}


@api.get("/demo-data")
async def demo_info(_=Depends(admin_user)):
    return {"cu": await db.credit_unions.count_documents({"demo": True}), "permohonan": await db.permohonan.count_documents(DEMO_Q)}


@api.delete("/demo-data")
async def demo_reset(_=Depends(admin_user)):
    rows = await db.permohonan.find(DEMO_Q, {"_id": 0, "id": 1, "file_id": 1, "analisis": 1, "pencairan_id": 1}).to_list(10000)
    fids = [i for r in rows for i in (r.get("file_id"), (r.get("analisis") or {}).get("lalau_file_id"), (r.get("analisis") or {}).get("cacat_file_id")) if i]
    await db.files.delete_many({"id": {"$in": fids}})
    await db.permohonan.delete_many(DEMO_Q)
    pids = {r["pencairan_id"] for r in rows if r.get("pencairan_id")}
    for pid in pids:
        if not await db.permohonan.find_one({"pencairan_id": pid}):
            await db.pencairan.delete_one({"id": pid})
    removed, kept = 0, []
    for cu in await db.credit_unions.find({"demo": True}, {"_id": 0}).to_list(100):
        busy = await db.permohonan.find_one({"cu_id": cu["id"]}) or await db.iuran.find_one({"cu_id": cu["id"]}) \
            or await db.users.find_one({"cu_id": cu["id"]}) or await db.pencairan.find_one({"cu_id": cu["id"]})
        if busy:
            kept.append(cu["kode"])
        else:
            await db.credit_unions.delete_one({"id": cu["id"]})
            removed += 1
    return {"permohonan": len(rows), "cu": removed, "cu_dipertahankan": kept}


# ---------- Notifikasi Defisit ----------
async def check_defisit():
    try:
        d = await _defisit({}, await cu_map())
        tahun = d["tahun"]
        now = {i["cu_id"]: i for i in d["items"]}
        prev = {s["cu_id"] for s in await db.defisit_state.find({"tahun": tahun, "defisit": True}).to_list(1000)}
        for cid in prev - now.keys():
            await db.defisit_state.update_one({"cu_id": cid, "tahun": tahun}, {"$set": {"defisit": False}})
        new = [now[c] for c in now if c not in prev]
        if not new:
            return
        for i in new:
            await db.defisit_state.update_one({"cu_id": i["cu_id"], "tahun": tahun}, {"$set": {"defisit": True, "at": now_iso()}}, upsert=True)
        admins = [u["email"] for u in await db.users.find({"role": "admin", "aktif": {"$ne": False}}, {"email": 1}).to_list(100)]
        if not admins:
            return
        rows = "".join(
            f'<tr><td style="padding:6px 10px;border:1px solid #e5e3dc">{escape(i["kode"])} - {escape(i["nama"])}</td>'
            f'<td style="padding:6px 10px;border:1px solid #e5e3dc;text-align:right">Rp {rp(i["iuran"])}</td>'
            f'<td style="padding:6px 10px;border:1px solid #e5e3dc;text-align:right">Rp {rp(i["cair"])}</td>'
            f'<td style="padding:6px 10px;border:1px solid #e5e3dc;text-align:right;color:#b91c1c;font-weight:bold">Rp {rp(i["selisih"])}</td></tr>'
            for i in new)
        subject = f"[{EMAIL_FROM_NAME}] Peringatan Defisit: {len(new)} Credit Union tahun {tahun}"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1c1917">'
            f'<h2 style="color:#b91c1c;margin:0 0 12px">Peringatan Defisit Tudung {tahun}</h2>'
            '<p>Credit Union berikut baru masuk status <b>defisit</b>: total pencairan Tudung melebihi total iuran pada tahun berjalan.</p>'
            '<table style="border-collapse:collapse;font-size:14px"><tr style="background:#eef3ef">'
            '<th style="padding:6px 10px;border:1px solid #e5e3dc;text-align:left">Credit Union</th>'
            '<th style="padding:6px 10px;border:1px solid #e5e3dc">Total Iuran</th>'
            '<th style="padding:6px 10px;border:1px solid #e5e3dc">Total Pencairan</th>'
            f'<th style="padding:6px 10px;border:1px solid #e5e3dc">Selisih</th></tr>{rows}</table>'
            '<p>Silakan buka aplikasi dan lihat menu Laporan, Iuran vs Pencairan, untuk detail bulan per bulan.</p>'
            f'<p style="font-size:12px;color:#888">Email otomatis dari {escape(EMAIL_FROM_NAME)}.</p></td></tr></table>')
        ok, info = await send_email(to=admins, subject=subject, html=html)
        await db.notif_log.insert_one({"id": new_id(), "jenis": "defisit", "tahun": tahun, "cu": [f"{i['kode']} - {i['nama']}" for i in new],
                                       "penerima": admins, "terkirim": ok, "info": info, "created_at": now_iso()})
    except Exception as e:
        logger.error(f"check_defisit error: {e}")


@api.get("/notifikasi")
async def list_notif(_=Depends(admin_user)):
    return await db.notif_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)


@api.post("/notifikasi/uji")
async def kirim_uji(user=Depends(admin_user)):
    minute_ago = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    if await db.notif_log.find_one({"jenis": "uji", "created_at": {"$gte": minute_ago}}):
        raise HTTPException(429, "Tunggu 1 menit sebelum mengirim email uji lagi")
    admins = [u["email"] for u in await db.users.find({"role": "admin", "aktif": {"$ne": False}}, {"email": 1}).to_list(100)]
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1c1917">'
        f'<h2 style="color:#155e46;margin:0 0 12px">Email Uji {escape(EMAIL_FROM_NAME)}</h2>'
        '<p>Ini adalah email uji. Jika Anda menerima email ini, notifikasi peringatan defisit Credit Union akan sampai ke inbox Anda.</p>'
        f'<p>Dikirim atas permintaan {escape(user["name"])}.</p>'
        f'<p style="font-size:12px;color:#888">Email otomatis dari {escape(EMAIL_FROM_NAME)}.</p></td></tr></table>')
    ok, info = await send_email(to=admins, subject=f"[{EMAIL_FROM_NAME}] Email Uji Notifikasi", html=html)
    await db.notif_log.insert_one({"id": new_id(), "jenis": "uji", "tahun": today().year, "cu": ["Email Uji"], "penerima": admins,
                                   "terkirim": ok, "info": info, "created_at": now_iso()})
    if not ok:
        raise HTTPException(502, f"Email uji gagal dikirim ({info})")
    return {"penerima": admins}


# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    q = {}
    cu = scope_cu(user)
    if cu:
        q["cu_id"] = cu
    rows = await db.permohonan.find(q, {"_id": 0, "status": 1, "analisis.hasil": 1, "analisis.sanduk_disetujui": 1,
                                        "analisis.lalau_disetujui": 1, "cu_id": 1, "tanggal_cair": 1}).to_list(50000)
    status = {S_ANTRIAN: 0, S_DIANALISIS: 0, S_CAIR: 0}
    hasil = {}
    cair = {"sanduk": 0, "lalau": 0}
    per_cu = {}
    cus = await cu_map()
    for r in rows:
        status[r["status"]] = status.get(r["status"], 0) + 1
        a = r.get("analisis") or {}
        if a.get("hasil") and r["status"] == S_DIANALISIS:
            hasil[a["hasil"]] = hasil.get(a["hasil"], 0) + 1
        if r["status"] == S_CAIR:
            cair["sanduk"] += a.get("sanduk_disetujui", 0)
            cair["lalau"] += a.get("lalau_disetujui", 0)
            name = cus.get(r["cu_id"], {}).get("nama", "-")
            per_cu[name] = per_cu.get(name, 0) + a.get("sanduk_disetujui", 0) + a.get("lalau_disetujui", 0)
    recent = await db.permohonan.find(q, {"_id": 0, "id": 1, "nama": 1, "nomor_anggota": 1, "cu_id": 1, "tanggal_terima": 1, "status": 1}).sort("created_at", -1).to_list(6)
    for r in recent:
        r["cu_nama"] = cus.get(r["cu_id"], {}).get("nama", "-")
    return {"total": len(rows), "status": status, "hasil": hasil, "cair": {**cair, "total": cair["sanduk"] + cair["lalau"]},
            "per_cu": [{"nama": k, "total": v} for k, v in sorted(per_cu.items(), key=lambda x: -x[1])],
            "jumlah_cu": len(cus) if user["role"] == "admin" else 1, "recent": recent, "tren": await _tren(q), "defisit": await _defisit(q, cus)}


async def _defisit(q, cus):
    y = str(today().year)
    cair, iuran = {}, {}
    cq = {**q, "status": S_CAIR, "tanggal_cair": {"$gte": f"{y}-01-01", "$lte": f"{y}-12-31"}}
    for r in await db.permohonan.find(cq, {"_id": 0, "cu_id": 1, "analisis.total_disetujui": 1}).to_list(50000):
        cair[r["cu_id"]] = cair.get(r["cu_id"], 0) + (r.get("analisis") or {}).get("total_disetujui", 0)
    for i in await db.iuran.find({**q, "tanggal": {"$gte": f"{y}-01-01", "$lte": f"{y}-12-31"}}, {"_id": 0, "cu_id": 1, "total": 1}).to_list(50000):
        iuran[i["cu_id"]] = iuran.get(i["cu_id"], 0) + i.get("total", 0)
    out = [{"cu_id": k, "nama": cus.get(k, {}).get("nama", "-"), "kode": cus.get(k, {}).get("kode", "-"), "cair": v, "iuran": iuran.get(k, 0),
            "selisih": iuran.get(k, 0) - v} for k, v in cair.items() if v > iuran.get(k, 0)]
    return {"tahun": int(y), "items": sorted(out, key=lambda x: x["selisih"])}


async def _tren(q):
    t = today()
    months = [((t.year * 12 + t.month - 1 - i) // 12, (t.year * 12 + t.month - 1 - i) % 12 + 1) for i in range(11, -1, -1)]
    keys = [f"{y}-{m:02d}" for y, m in months]
    tren = {k: {"bulan": k, "iuran": 0, "cair": 0, "anggota": 0} for k in keys}
    cq = {**q, "status": S_CAIR, "tanggal_cair": {"$gte": f"{keys[0]}-01"}}
    for r in await db.permohonan.find(cq, {"_id": 0, "tanggal_cair": 1, "analisis.total_disetujui": 1}).to_list(50000):
        k = r["tanggal_cair"][:7]
        if k in tren:
            tren[k]["cair"] += (r.get("analisis") or {}).get("total_disetujui", 0)
            tren[k]["anggota"] += 1
    iq = {**q, "tanggal": {"$gte": f"{keys[0]}-01", "$lte": f"{keys[-1]}-31"}}
    for i in await db.iuran.find(iq, {"_id": 0, "tanggal": 1, "total": 1}).to_list(50000):
        if i["tanggal"][:7] in tren:
            tren[i["tanggal"][:7]]["iuran"] += i.get("total", 0)
    return list(tren.values())


@api.get("/dashboard/tren")
async def dashboard_tren(cu_id: Optional[str] = None, user=Depends(current_user)):
    cu = scope_cu(user, cu_id)
    return await _tren({"cu_id": cu} if cu else {})


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ["CORS_ORIGINS"].split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_history.create_index([("user_id", 1), ("at", -1)])
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token_hash")
    await db.permohonan.create_index("id", unique=True)
    await db.permohonan.create_index([("cu_id", 1), ("status", 1)])
    await db.pencairan.create_index("nomor", unique=True)
    email, pw = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": email, "name": "Admin Pusat", "role": "admin", "cu_id": None,
                                   "aktif": True, "password_hash": hash_pw(pw), "created_at": now_iso()})
    old = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    await db.temp_files.delete_many({"created_at": {"$lt": old}})
    await auto_deactivate()


@app.on_event("shutdown")
async def shutdown():
    client.close()
