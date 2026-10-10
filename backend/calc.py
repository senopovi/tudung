import calendar
from datetime import date

DEFAULT_SETTINGS = {
    "max_hari_berkas": 100,
    "min_hari_anggota": 90,
    "usia_max": 70,
    "usia_min_pinjam": 17,
    "hari_cacat": 180,
    "sanduk_brackets": [
        {"sampai": 55, "max": 50000000},
        {"sampai": 60, "max": 37500000},
        {"sampai": 65, "max": 25000000},
        {"sampai": 70, "max": 12500000},
    ],
    "sanduk_max_anggota_baru": 12500000,
    "lalau_max": 300000000,
    "nomor_berikutnya": 1,
}

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


def rp(n):
    return f"{int(n or 0):,}".replace(",", ".")


def to_date(s):
    return date.fromisoformat(s[:10]) if s else None


def ymd(a, b):
    if not a or not b:
        return None
    y, m, d = b.year - a.year, b.month - a.month, b.day - a.day
    if d < 0:
        m -= 1
        pm, py = (b.month - 1, b.year) if b.month > 1 else (12, b.year - 1)
        d += calendar.monthrange(py, pm)[1]
    if m < 0:
        y -= 1
        m += 12
    return {"tahun": y, "bulan": m, "hari": d, "desimal": y + m / 12 + d / 365.25}


def add_years(a, n):
    try:
        return a.replace(year=a.year + n)
    except ValueError:
        return a.replace(year=a.year + n, day=28)


def format_nomor(n, d):
    return f"{n}/T/PUSAKA/{ROMAN[d.month - 1]}/{d.year}"


def berkas_lengkap_default(p):
    s = p.get("syarat") or {}
    keys = ["surat_kematian", "identitas", "buku_anggota", "buku_simpanan"]
    if p.get("tgl_pinjam"):
        keys.append("spp")
    return all(s.get(k) == "ada" for k in keys) and bool(p.get("file_id"))


def _has(inp, alasan_key, file_key):
    return bool((inp.get(alasan_key) or "").strip() or inp.get(file_key))


def analyze(p, inp, s, today):
    tl, ta, tp = to_date(p["tgl_lahir"]), to_date(p["tgl_anggota"]), to_date(p.get("tgl_pinjam"))
    tk, tt = to_date(p["tgl_kejadian"]), to_date(p["tanggal_terima"])
    sanduk_aju, lalau_aju = int(p.get("sanduk") or 0), int(p.get("lalau") or 0)
    usia_max = s["usia_max"]
    lama_berkas = (tt - tk).days
    u_ang, u_pin, u_kej = ymd(tl, ta), ymd(tl, tp), ymd(tl, tk)
    lama_anggota = (tk - ta).days
    hari_mengendap = (today - tt).days
    umum, cs, cl = [], [], []
    tolak = False

    if lama_berkas > s["max_hari_berkas"]:
        if inp.get("kelonggaran_berkas"):
            umum.append(f"Lama terima berkas {lama_berkas} hari melebihi batas {s['max_hari_berkas']} hari, diberikan kelonggaran.")
        else:
            tolak = True
            umum.append(f"Lama terima berkas {lama_berkas} hari melebihi batas {s['max_hari_berkas']} hari: Pencairan Tudung Tidak Disetujui.")

    if p.get("jenis_kejadian") == "cacat" and hari_mengendap < s["hari_cacat"]:
        if inp.get("cacat_override") and _has(inp, "cacat_alasan", "has_cacat_file"):
            umum.append(f"Cacat Total Tetap baru mengendap {hari_mengendap} hari, disetujui lebih cepat berdasarkan alasan/berkas keputusan.")
        else:
            tolak = True
            umum.append(f"Cacat Total Tetap baru mengendap {hari_mengendap} dari {s['hari_cacat']} hari sejak terima berkas: Tidak Disetujui.")

    sanduk = 0
    if sanduk_aju > 0:
        if p.get("jenis_simpanan") == "lembaga":
            cs.append("Saldo Simpanan Lembaga atas Nama Perorangan: Sanduk Tidak Disetujui.")
        elif u_ang["desimal"] > usia_max:
            cs.append(f"Usia jadi anggota di atas {usia_max} tahun: Sanduk Tidak Disetujui.")
        elif lama_anggota < s["min_hari_anggota"]:
            cs.append(f"Lama jadi anggota {lama_anggota} hari (kurang dari {s['min_hari_anggota']} hari): Sanduk Tidak Disetujui.")
        else:
            base = sanduk_aju
            if u_kej["desimal"] > usia_max:
                v = inp.get("sanduk_saldo_70")
                if v is not None:
                    base = min(int(v), sanduk_aju)
                    cs.append(f"Meninggal/CTT di atas usia {usia_max} tahun: dipakai Saldo Simpanan saat usia {usia_max} tahun Rp {rp(base)}.")
                else:
                    cs.append(f"Meninggal/CTT di atas usia {usia_max} tahun: isi Saldo Simpanan saat usia {usia_max} tahun.")
            cap = 0
            for b in sorted(s["sanduk_brackets"], key=lambda x: x["sampai"]):
                if u_ang["desimal"] <= b["sampai"]:
                    cap = int(b["max"])
                    break
            if lama_anggota <= 365 and s["sanduk_max_anggota_baru"] < cap:
                cap = int(s["sanduk_max_anggota_baru"])
                cs.append(f"Lama jadi anggota {lama_anggota} hari (sampai 1 tahun): maksimal Rp {rp(cap)}.")
            sanduk = min(base, cap)
            if sanduk < base:
                cs.append(f"Maksimal Sanduk disetujui Rp {rp(cap)}; kelebihan Rp {rp(base - sanduk)} Tidak Disetujui.")
            if sanduk == sanduk_aju:
                cs.append("Sanduk Disetujui sesuai Saldo Permohonan.")

    lalau = 0
    if lalau_aju > 0:
        if not tp:
            cl.append("Tidak ada Tanggal Pinjam: Lalau Tidak Disetujui.")
        elif p.get("jenis_pinjaman") == "lembaga":
            cl.append("Saldo Pinjaman Lembaga atas Nama Perorangan: Lalau Tidak Disetujui.")
        elif u_pin["desimal"] > usia_max or u_pin["tahun"] < s["usia_min_pinjam"]:
            cl.append(f"Usia pinjam di atas {usia_max} tahun atau kurang dari {s['usia_min_pinjam']} tahun: Lalau Tidak Disetujui.")
        else:
            base = lalau_aju
            if u_kej["desimal"] > usia_max:
                if inp.get("lalau_override") and _has(inp, "lalau_alasan", "has_lalau_file"):
                    if inp.get("lalau_manual") is not None:
                        base = int(inp["lalau_manual"])
                    cl.append(f"Usia meninggal/CTT di atas {usia_max} tahun: Lalau Disetujui berdasarkan alasan/surat keputusan.")
                else:
                    base = 0
                    cl.append(f"Usia meninggal/CTT di atas {usia_max} tahun dan masih memiliki pinjaman: Lalau Tidak Disetujui.")
            lalau = min(base, int(s["lalau_max"]))
            if base > lalau:
                cl.append(f"Maksimal Lalau Rp {rp(s['lalau_max'])}; kelebihan Rp {rp(base - lalau)} Tidak Disetujui.")
            if lalau and lalau == lalau_aju:
                cl.append("Lalau Disetujui sesuai Saldo Permohonan.")

    lengkap = inp.get("berkas_lengkap")
    if lengkap is None:
        lengkap = berkas_lengkap_default(p)
    if tolak:
        sanduk = lalau = 0
        hasil = "Tidak Disetujui"
    elif not lengkap:
        hasil = inp.get("keputusan_berkas") if inp.get("keputusan_berkas") in ("Ditunda", "Tidak Disetujui") else "Ditunda"
        umum.append(f"Berkas tidak lengkap: Data Permohonan {hasil}.")
        if hasil == "Tidak Disetujui":
            sanduk = lalau = 0
    else:
        total = sanduk + lalau
        if total > 0 and total >= sanduk_aju + lalau_aju:
            hasil = "Disetujui"
        elif total > 0:
            hasil = "Disetujui Sebagian"
        else:
            hasil = "Tidak Disetujui"

    return {
        "lama_berkas": lama_berkas,
        "hari_mengendap": hari_mengendap,
        "lama_anggota_hari": lama_anggota,
        "usia_anggota": u_ang,
        "usia_pinjam": u_pin,
        "usia_kejadian": u_kej,
        "tgl_70": add_years(tl, usia_max).isoformat(),
        "lewat_70": u_kej["desimal"] > usia_max,
        "sanduk_diajukan": sanduk_aju,
        "lalau_diajukan": lalau_aju,
        "total_diajukan": sanduk_aju + lalau_aju,
        "sanduk_disetujui": sanduk,
        "lalau_disetujui": lalau,
        "total_disetujui": sanduk + lalau,
        "berkas_lengkap": lengkap,
        "catatan_umum": umum,
        "catatan_sanduk": cs,
        "catatan_lalau": cl,
        "hasil": hasil,
    }
