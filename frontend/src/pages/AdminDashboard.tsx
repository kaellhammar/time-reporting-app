import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { employeesApi, timeEntriesApi, salarySlipsApi } from '../api';
import Badge from '../components/Badge';

export default function AdminDashboard() {
  const now = new Date();
  const [stats, setStats] = useState({ employees: 0, pending: 0, slips: 0 });
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      employeesApi.list(),
      timeEntriesApi.list(now.getFullYear(), now.getMonth() + 1),
      salarySlipsApi.list(),
    ]).then(([emps, entries, slips]) => {
      const pending = entries.filter((e: any) => e.status === 'submitted').length;
      const monthSlips = slips.filter((s: any) => s.year === now.getFullYear() && s.month === now.getMonth() + 1).length;
      setStats({ employees: emps.length, pending, slips: monthSlips });
      setRecentEntries(entries.slice(0, 10));
    }).finally(() => setLoading(false));
  }, []);

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Översikt</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laddar...</div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatCard
              label="Anställda"
              value={stats.employees}
              icon="👥"
              href="/admin/employees"
            />
            <StatCard
              label="Väntar på granskning"
              value={stats.pending}
              icon="⏳"
              href="/admin/review"
              highlight={stats.pending > 0}
            />
            <StatCard
              label="Lönebesked denna månad"
              value={stats.slips}
              icon="📄"
              href="/admin/review"
            />
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <Link
              to="/admin/employees"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">👤</div>
              <div className="font-semibold text-gray-800 group-hover:text-brand-700">Hantera anställda</div>
              <div className="text-sm text-gray-500 mt-1">Lägg till, redigera och ta bort anställda</div>
            </Link>
            <Link
              to="/admin/review"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">📋</div>
              <div className="font-semibold text-gray-800 group-hover:text-brand-700">Granska & Lönebesked</div>
              <div className="text-sm text-gray-500 mt-1">Godkänn tidrapporter och generera lönebesked</div>
            </Link>
          </div>

          {/* Recent entries */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-700">
                Tidrapporter — {MONTHS[now.getMonth()]} {now.getFullYear()}
              </h2>
            </div>
            {recentEntries.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                Inga tidrapporter för denna period
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">Anställd</th>
                    <th className="px-6 py-3 text-left">Anst.nr</th>
                    <th className="px-6 py-3 text-right">Timmar</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentEntries.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-800">{entry.employee_name}</td>
                      <td className="px-6 py-3 text-gray-500">{entry.employee_number}</td>
                      <td className="px-6 py-3 text-right font-mono">{entry.hours}</td>
                      <td className="px-6 py-3 text-center"><Badge status={entry.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, href, highlight }: {
  label: string;
  value: number;
  icon: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      to={href}
      className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow ${
        highlight ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${highlight ? 'text-yellow-700' : 'text-gray-800'}`}>
            {value}
          </p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </Link>
  );
}
