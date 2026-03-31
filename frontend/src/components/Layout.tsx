import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        location.pathname === to || location.pathname.startsWith(to + '/')
          ? 'bg-brand-700 text-white'
          : 'text-brand-100 hover:bg-brand-600 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-brand-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="text-white font-bold text-lg tracking-tight">
                Kaellhammarone AB
              </span>
              <div className="flex gap-1">
                {isAdmin && navLink('/admin', 'Översikt')}
                {isAdmin && navLink('/admin/employees', 'Anställda')}
                {isAdmin && navLink('/admin/review', 'Granskning')}
                {!isAdmin && navLink('/hours', 'Mina timmar')}
                {navLink('/expenses', 'Utlägg')}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-brand-100 text-sm">{user?.name}</span>
              <button
                onClick={logout}
                className="text-brand-100 hover:text-white text-sm px-3 py-1 rounded border border-brand-600 hover:border-white transition-colors"
              >
                Logga ut
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
