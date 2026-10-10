from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import os
import re
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, List

import bcrypt
import jwt
from bson import Binary
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from calc import analyze, DEFAULT_SETTINGS, format_nomor

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
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]) or not user.get("aktif", True):
        cnt = (att or {}).get("count", 0) + 1
        until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": cnt, "until": until}}, upsert=True)
        raise HTTPException(401, "Email atau password salah")
    await db.login_attempts.delete_one({"identifier": ident})
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": make_token(user["id"]), "user": user}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


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
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(2000)


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
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Password minimal 6 karakter")
        doc["password_hash"] = hash_pw(body.password)
    await db.users.update_one({"id": uid}, {"$set": doc})
    return {"ok": True}


@api.delete("/users/{uid}")
async def delete_user(uid: str, admin=Depends(admin_user)):
    if uid == admin["id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    await db.users.delete_one({"id": uid})
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


@api.get("/cu")
async def list_cu(user=Depends(current_user)):
    q = {} if user["role"] == "admin" else {"id": user.get("cu_id")}
    return await db.credit_unions.find(q, {"_id": 0}).sort("kode", 1).to_list(2000)


@api.post("/cu")
async def create_cu(body: CUIn, _=Depends(admin_user)):
    if await db.credit_unions.find_one({"kode": body.kode}):
        raise HTTPException(400, "Kode Credit Union sudah ada")
    doc = {**body.model_dump(), "id": new_id(), "created_at": now_iso()}
    await db.credit_unions.insert_one(doc)
    return {"id": doc["id"]}


@api.put("/cu/{cid}")
async def update_cu(cid: str, body: CUIn, _=Depends(admin_user)):
    if await db.credit_unions.find_one({"kode": body.kode, "id": {"$ne": cid}}):
        raise HTTPException(400, "Kode Credit Union sudah ada")
    await db.credit_unions.update_one({"id": cid}, {"$set": body.model_dump()})
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
    if f.get("hasil"):
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
    rows = await db.permohonan.find(q, {"_id": 0}).sort("created_at", -1).to_list(10000)
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
    return p


@api.post("/permohonan")
async def create_permohonan(body: PermohonanIn, user=Depends(current_user)):
    doc = await _p_doc(body, user)
    doc.update({"id": new_id(), "status": S_ANTRIAN, "created_at": now_iso(), "created_by": user["email"]})
    await db.permohonan.insert_one(doc)
    return {"id": doc["id"]}


@api.put("/permohonan/{pid}")
async def update_permohonan(pid: str, body: PermohonanIn, user=Depends(current_user)):
    old = await _get_p(pid, user)
    if old["status"] == S_CAIR:
        raise HTTPException(400, "Data yang sudah dicairkan tidak bisa diubah")
    doc = await _p_doc(body, user, old)
    doc.update({"status": S_ANTRIAN, "updated_at": now_iso(), "tunda_pencairan": False})
    await db.permohonan.update_one({"id": pid}, {"$set": doc, "$unset": {"analisis": ""}})
    return {"ok": True}


@api.delete("/permohonan/{pid}")
async def delete_permohonan(pid: str, user=Depends(current_user)):
    p = await _get_p(pid, user)
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
async def cairkan(body: CairIn, user=Depends(admin_user)):
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
    return doc


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
async def create_iuran(body: IuranBatch, _=Depends(admin_user)):
    if not body.items:
        raise HTTPException(400, "Tidak ada data iuran")
    docs = [{**_iuran(i), "id": new_id(), "created_at": now_iso()} for i in body.items]
    await db.iuran.insert_many(docs)
    return {"disimpan": len(docs)}


@api.put("/iuran/{iid}")
async def update_iuran(iid: str, body: IuranIn, _=Depends(admin_user)):
    await db.iuran.update_one({"id": iid}, {"$set": _iuran(body)})
    return {"ok": True}


@api.delete("/iuran/{iid}")
async def delete_iuran(iid: str, _=Depends(admin_user)):
    await db.iuran.delete_one({"id": iid})
    return {"ok": True}


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
            "jumlah_cu": len(cus) if user["role"] == "admin" else 1, "recent": recent}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ["CORS_ORIGINS"].split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.permohonan.create_index("id", unique=True)
    await db.permohonan.create_index([("cu_id", 1), ("status", 1)])
    await db.pencairan.create_index("nomor", unique=True)
    email, pw = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": email, "name": "Admin Pusat", "role": "admin", "cu_id": None,
                                   "aktif": True, "password_hash": hash_pw(pw), "created_at": now_iso()})
    elif not verify_pw(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_pw(pw)}})
    old = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    await db.temp_files.delete_many({"created_at": {"$lt": old}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
