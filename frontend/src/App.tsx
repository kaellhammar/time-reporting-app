import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees';
import AdminReview from './pages/AdminReview';
import HoursEntry from './pages/HoursEntry';
import Expenses from './pages/Expenses';
import Layout from './components/Layout';

function ProtectedRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout><Outlet /></Layout>;
}

function AdminRoute() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/hours" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/employees" element={<Employees />} />
              <Route path="/admin/review" element={<AdminReview />} />
            </Route>
            <Route path="/hours" element={<HoursEntry />} />
            <Route path="/expenses" element={<Expenses />} />
          </Route>
          <Route path="/" element={<Navigate to="/hours" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
