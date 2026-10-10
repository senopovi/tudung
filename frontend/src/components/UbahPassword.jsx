import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field } from "@/components/Common";
import { api, errMsg } from "@/lib/api";

const EMPTY = { lama: "", baru: "", ulang: "" };

export const UbahPassword = () => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const close = (v) => { setOpen(v); if (!v) { setF(EMPTY); setErr(""); } };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (f.baru.length < 6) return setErr("Password baru minimal 6 karakter");
    if (f.baru !== f.ulang) return setErr("Konfirmasi password baru tidak sama");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { password_lama: f.lama, password_baru: f.baru });
      toast.success("Password berhasil diubah");
      close(false);
    } catch (e2) {
      setErr(errMsg(e2, "Gagal mengubah password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="ubah-password-btn">
        <KeyRound className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Ubah Password</span>
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-sm" data-testid="ubah-password-dialog">
          <DialogHeader>
            <DialogTitle>Ubah Password</DialogTitle>
            <DialogDescription>Masukkan password lama dan password baru Anda.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3" id="ubah-password-form">
            <Field label="Password Lama"><Input type="password" value={f.lama} onChange={set("lama")} required data-testid="pw-lama-input" /></Field>
            <Field label="Password Baru"><Input type="password" value={f.baru} onChange={set("baru")} required data-testid="pw-baru-input" /></Field>
            <Field label="Ulangi Password Baru"><Input type="password" value={f.ulang} onChange={set("ulang")} required data-testid="pw-ulang-input" /></Field>
            {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="ubah-password-error">{err}</p>}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>Batal</Button>
            <Button type="submit" form="ubah-password-form" disabled={busy} className="bg-[#155e46] hover:bg-[#0d3b2e]" data-testid="ubah-password-submit">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
