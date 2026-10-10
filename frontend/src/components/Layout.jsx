import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileStack, FilePlus2, ScanSearch, HandCoins, ReceiptText, Wallet, FileBarChart, Database, Settings, LogOut, Menu, ShieldCheck, Building2, PenLine } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { UbahPassword } from "@/components/UbahPassword";

const NAV = [
  { group: "Dashboard", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    group: "Transaksi",
    items: [
      { to: "/permohonan", label: "Daftar Permohonan", icon: FileStack, end: true },
      { to: "/permohonan/tambah", label: "Tambah Permohonan", icon: FilePlus2 },
      { to: "/analisis", label: "Analisis Permohonan", icon: ScanSearch, admin: true },
      { to: "/permohonan-ditunda", label: "Permohonan Ditunda", icon: FileStack, perm: "ubah_hapus_permohonan" },
      { to: "/permohonan-tidak-disetujui", label: "Permohonan Tidak Disetujui", icon: FileStack, perm: "ubah_hapus_permohonan" },
      { to: "/pencairan", label: "Pencairan Tudung", icon: HandCoins, admin: true },
      { to: "/bantuan-cair", label: "Daftar Bantuan Cair", icon: ReceiptText },
      { to: "/iuran", label: "Iuran Credit Union", icon: Wallet },
    ],
  },
  {
    group: "Laporan",
    items: [
      { to: "/laporan/permohonan", label: "Lap. Data Permohonan", icon: FileBarChart, perm: "lihat_laporan_permohonan" },
      { to: "/laporan/analisis", label: "Lap. Data Analisis", icon: FileBarChart, perm: "lihat_hasil_analisis" },
      { to: "/laporan/pencairan", label: "Lap. Pencairan", icon: FileBarChart },
      { to: "/laporan/rekap", label: "Rekap Pencairan per CU", icon: FileBarChart, admin: true },
      { to: "/laporan/cu", label: "Lap. Data Credit Union", icon: FileBarChart, admin: true },
      { to: "/laporan/iuran", label: "Lap. Iuran Tudung", icon: FileBarChart },
      { to: "/laporan/rekap-iuran", label: "Rekap Iuran Semua CU", icon: FileBarChart, admin: true },
      { to: "/laporan/saldo-periode", label: "Saldo Pencairan per Periode", icon: FileBarChart },
      { to: "/laporan/tidak-disetujui", label: "Permohonan Tidak Disetujui", icon: FileBarChart, perm: "lihat_hasil_analisis" },
      { to: "/laporan/tren", label: "Tren Iuran & Pencairan", icon: FileBarChart },
      { to: "/laporan/usia", label: "Anggota per Usia", icon: FileBarChart, admin: true },
      { to: "/laporan/rating", label: "Rating Credit Union", icon: FileBarChart, admin: true },
      { to: "/laporan/perbandingan", label: "Iuran vs Pencairan", icon: FileBarChart, admin: true },
      { to: "/laporan/permil", label: "Angka Kematian per Mil", icon: FileBarChart },
    ],
  },
  { group: "Data Induk", items: [{ to: "/data-induk", label: "Data Induk", icon: Database, admin: true }] },
  { group: "Pengaturan", items: [{ to: "/pengaturan", label: "Pengaturan Aplikasi", icon: Settings, admin: true }, { to: "/tanda-tangan-cu", label: "Tanda Tangan CU", icon: PenLine }] },
];

const NavList = ({ isAdmin, can, onNav }) => (
  <nav className="space-y-5 px-3 py-4">
    {NAV.map((g) => {
      const items = g.items.filter((i) => allowed(i, isAdmin, can));
      if (!items.length) return null;
      return (
        <div key={g.group}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">{g.group}</p>
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              onClick={onNav}
              data-testid={`nav-${i.to.replace(/\//g, "-").replace(/^-/, "") || "dashboard"}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-white/12 text-white shadow-[inset_3px_0_0_#f59e0b]" : "text-emerald-100/80 hover:bg-white/5 hover:text-white"}`
              }
            >
              <i.icon className="h-4 w-4 shrink-0" />
              {i.label}
            </NavLink>
          ))}
        </div>
      );
    })}
  </nav>
);

const Brand = () => (
  <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
    <img src="/logo-pusaka.png" alt="Logo PUSAKA" className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 shadow-sm ring-2 ring-amber-400/70" data-testid="sidebar-logo" />
    <div>
      <p className="text-lg font-extrabold leading-none tracking-tight text-white">Tudung</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">Pusaka</p>
    </div>
  </div>
);

export const allowed = (i, isAdmin, can) => {
  if (isAdmin) return true;
  if (i.admin || (i.perm && !can(i.perm))) return false;
  return !(i.to.startsWith("/laporan") || i.to === "/bantuan-cair") || can("lihat_laporan");
};

export { NAV };

export default function Layout() {
  const { user, logout, isAdmin, org, can } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const cuName = org.cus.find((c) => c.id === user?.cu_id)?.nama;

  const Side = ({ onNav }) => (
    <div className="flex h-full flex-col bg-[#0d3b2e]">
      <Brand />
      <div className="flex-1 overflow-y-auto"><NavList isAdmin={isAdmin} can={can} onNav={onNav} /></div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Side /></aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0"><Side onNav={() => setOpen(false)} /></SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur-md md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-btn"><Menu className="h-5 w-5" /></Button>
          <img src="/logo-pusaka.png" alt="Logo PUSAKA" className="h-9 w-9 lg:hidden" data-testid="mobile-header-logo" />
          <div className="flex-1" />
          <span className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 sm:flex" data-testid="user-role-badge">
            {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
            {isAdmin ? "Admin Pusat" : `Petugas • ${cuName || "-"}`}
          </span>
          <span className="hidden text-sm font-medium md:block" data-testid="user-name">{user?.name}</span>
          <UbahPassword />
          <Button variant="outline" size="sm" onClick={() => { logout(); nav("/login"); }} data-testid="logout-btn">
            <LogOut className="mr-1.5 h-4 w-4" /> Keluar
          </Button>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
