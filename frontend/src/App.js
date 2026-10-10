import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import { LupaPassword, ResetPassword } from "@/pages/PasswordReset";
import Dashboard from "@/pages/Dashboard";
import PermohonanList from "@/pages/PermohonanList";
import PermohonanForm from "@/pages/PermohonanForm";
import PermohonanDetail from "@/pages/PermohonanDetail";
import AnalisisList from "@/pages/AnalisisList";
import AnalisisDetail from "@/pages/AnalisisDetail";
import Pencairan from "@/pages/Pencairan";
import BantuanCair from "@/pages/BantuanCair";
import Iuran from "@/pages/Iuran";
import Laporan from "@/pages/Laporan";
import DataInduk from "@/pages/DataInduk";
import Pengaturan from "@/pages/Pengaturan";
import TandaTanganCU from "@/pages/TandaTanganCU";

const Guard = ({ children, admin }) => {
  const { user, isAdmin } = useAuth();
  if (user === null) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
};

const A = (el) => <Guard admin>{el}</Guard>;

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/lupa-password" element={<LupaPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route index element={<Dashboard />} />
            <Route path="permohonan" element={<PermohonanList />} />
            <Route path="permohonan/tambah" element={<PermohonanForm />} />
            <Route path="permohonan/:id/ubah" element={<PermohonanForm />} />
            <Route path="permohonan/:id" element={<PermohonanDetail />} />
            <Route path="analisis" element={A(<AnalisisList />)} />
            <Route path="analisis/:id" element={A(<AnalisisDetail />)} />
            <Route path="pencairan" element={A(<Pencairan />)} />
            <Route path="bantuan-cair" element={<BantuanCair />} />
            <Route path="iuran" element={<Iuran />} />
            <Route path="laporan/:jenis" element={<Laporan />} />
            <Route path="data-induk" element={A(<DataInduk />)} />
            <Route path="pengaturan" element={A(<Pengaturan />)} />
            <Route path="tanda-tangan-cu" element={<TandaTanganCU />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

export default App;
