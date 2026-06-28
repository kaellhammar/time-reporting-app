import { useState, useEffect } from 'react';
import { expensesApi } from '../api';
import { useAuth } from '../context/AuthContext';

const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni',
                   'Juli','Augusti','September','Oktober','November','December'];

const fmt = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2 });

export default function Friskvard() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => { load(); }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await expensesApi.friskvard({ year }));
    } finally {
      setLoading(false);
    }
  };

  const total = rows.reduce((sum, r) => sum + (r.belopp || 0), 0);

  // Group by employee for admin view
  type EmpGroup = { name: string; number: string; rows: any[] };
  const byEmployee: EmpGroup[] | null = isAdmin
    ? Array.from(
        rows.reduce((map, r) => {
          const key = r.employee_number || r.employee_name;
          if (!map.has(key)) map.set(key, { name: r.employee_name, number: r.employee_number, rows: [] });
          map.get(key)!.rows.push(r);
          return map;
        }, new Map<string, EmpGroup>()).values()
      )
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Friskvård</h1>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-4 mb-6 flex items-center justify-between">
        <span className="text-emerald-800 font-medium">Total friskvård {year}</span>
        <span className="text-emerald-900 font-bold text-xl font-mono">{fmt(total)} kr</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laddar...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          Inga friskvårdskvitton registrerade för {year}.
        </div>
      ) : isAdmin && byEmployee ? (
        <div className="space-y-6">
          {byEmployee.map(emp => {
            const empTotal = emp.rows.reduce((s: number, r: any) => s + (r.belopp || 0), 0);
            return (
              <div key={emp.number || emp.name} className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <div>
                    <span className="font-semibold text-gray-800">{emp.name}</span>
                    {emp.number && <span className="ml-2 text-xs text-gray-400">{emp.number}</span>}
                  </div>
                  <span className="font-bold font-mono text-emerald-700">{fmt(empTotal)} kr</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Månad</th>
                      <th className="px-4 py-2 text-left">Inköpsställe</th>
                      <th className="px-4 py-2 text-left">Avser</th>
                      <th className="px-4 py-2 text-right">Belopp (SEK)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {emp.rows.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500 text-xs">{MONTHS_SV[r.month - 1]}</td>
                        <td className="px-4 py-2 text-gray-800">{r.inkops_stalle || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{r.avser || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono">
                          {r.belopp != null ? fmt(r.belopp) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Månad</th>
                <th className="px-4 py-3 text-left">Inköpsställe</th>
                <th className="px-4 py-3 text-left">Avser</th>
                <th className="px-4 py-3 text-right">Belopp (SEK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 text-xs">{MONTHS_SV[r.month - 1]}</td>
                  <td className="px-4 py-2 text-gray-800">{r.inkops_stalle || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{r.avser || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.belopp != null ? fmt(r.belopp) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-sm">
                <td colSpan={3} className="px-4 py-3 text-right text-gray-600">Totalt:</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
