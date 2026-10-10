import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";

const Shell = ({ title, subtitle, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#fafaf7] p-6">
    <div className="w-full max-w-sm space-y-5 rounded-lg border bg-white p-7 shadow-sm fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-600 font-extrabold text-[#0d3b2e]">T</div>
        <div>
          <h2 className="text-xl font-bold text-[#0d3b2e]">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
      <Link to="/login" className="flex items-center gap-1.5 text-sm font-medium text-[#155e46] hover:underline" data-testid="back-to-login-link">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Login
      </Link>
    </div>
  </div>
);

const Lbl = ({ children }) => <label className="text-xs font-semibold uppercase tracking-wide text-[#57534e]">{children}</label>;

export function LupaPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMsg(data.message);
    } catch (e2) {
      setErr(errMsg(e2, "Gagal mengirim permintaan"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Lupa Password" subtitle="Tautan reset akan dikirim ke email Anda">
      {msg ? (
        <p className="flex gap-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800" data-testid="forgot-success"><CheckCircle2 className="h-5 w-5 shrink-0" />{msg}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          <div className="space-y-1.5"><Lbl>Email Akun</Lbl><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" /></div>
          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="forgot-error">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="forgot-submit-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Kirim Tautan Reset
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 6) return setErr("Password minimal 6 karakter");
    if (pw !== pw2) return setErr("Konfirmasi password tidak sama");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, password: pw });
      setDone(data.message);
      setTimeout(() => nav("/login"), 2500);
    } catch (e2) {
      setErr(errMsg(e2, "Gagal mengubah password"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Atur Ulang Password" subtitle="Masukkan password baru Anda">
      {!token ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="reset-no-token">Tautan tidak valid. Silakan minta tautan reset baru.</p>
      ) : done ? (
        <p className="flex gap-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800" data-testid="reset-success"><CheckCircle2 className="h-5 w-5 shrink-0" />{done}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
          <div className="space-y-1.5"><Lbl>Password Baru</Lbl><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password-input" /></div>
          <div className="space-y-1.5"><Lbl>Ulangi Password Baru</Lbl><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="reset-password2-input" /></div>
          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="reset-error">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="reset-submit-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Simpan Password Baru
          </Button>
        </form>
      )}
    </Shell>
  );
}
