import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e2) {
      setErr(errMsg(e2, "Login gagal"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#0d3b2e] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#f59e0b 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-xl font-extrabold text-[#0d3b2e]">T</div>
          <div>
            <p className="text-xl font-extrabold leading-none">Tudung</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300">Pusaka</p>
          </div>
        </div>
        <div className="relative max-w-lg fade-up">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Solidaritas Anggota Credit Union</p>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">Pengelolaan klaim Tudung yang rapi, cepat, dan terpercaya.</h1>
          <p className="mt-5 text-emerald-100/80">Permohonan, analisis Sanduk & Lalau, pencairan bantuan, hingga laporan iuran dalam satu aplikasi.</p>
        </div>
        <p className="relative text-xs text-emerald-100/60">© {new Date().getFullYear()} Tudung-Pusaka</p>
      </div>
      <div className="flex items-center justify-center bg-[#fafaf7] p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 fade-up" data-testid="login-form">
          <div>
            <h2 className="text-2xl font-bold text-[#0d3b2e]">Masuk ke Tudung</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gunakan akun yang diberikan Admin Pusat.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#57534e]">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input" className="bg-white" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#57534e]">Password</label>
              <Link to="/lupa-password" className="text-xs font-semibold text-amber-700 hover:underline" data-testid="forgot-password-link">Lupa password?</Link>
            </div>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input" className="bg-white" />
          </div>
          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="login-error">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="login-submit-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Masuk
          </Button>
        </form>
      </div>
    </div>
  );
}
