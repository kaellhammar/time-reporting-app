import { useState, useEffect } from 'react';
import { timeEntriesApi, salarySlipsApi, employeesApi } from '../api';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Modal from '../components/Modal';

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
];

export default function AdminReview() {
  const now = new Date();
  const [tab, setTab] = useState<'entries' | 'slips'>('entries');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState<any[]>([]);
  const [slips, setSlips] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [approving, setApproving] = useState<number | null>(null);

  // Generate form state
  const [genUserIds, setGenUserIds] = useState<Set<number>>(new Set());
  const [genYear, setGenYear] = useState(now.getFullYear());
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1);
  const [genPaymentDate, setGenPaymentDate] = useState('');
  const [genProgress, setGenProgress] = useState('');

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => {
    loadData();
  }, [year, month]);

  useEffect(() => {
    employeesApi.list().then(setEmployees);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        timeEntriesApi.list(year, month),
        salarySlipsApi.list(),
      ]);
      setEntries(e);
      setSlips(s.filter((s: any) => s.year === year && s.month === month));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    setApproving(id);
    try {
      await timeEntriesApi.approve(id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Kunde inte godkänna');
    } finally {
      setApproving(null);
    }
  };

  const toggleEmployee = (id: number) => {
    setGenUserIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (genUserIds.size === 0 || !genPaymentDate) {
      setGenError('Välj minst en anställd och utbetalningsdatum');
      return;
    }
    setGenerating(true);
    setGenError('');
    setGenProgress('');
    const ids = Array.from(genUserIds);
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const emp = employees.find((e: any) => e.id === ids[i]);
      setGenProgress(`Genererar ${i + 1} av ${ids.length}: ${emp?.name ?? ids[i]}...`);
      try {
        await salarySlipsApi.generate({
          userId: ids[i],
          year: genYear,
          month: genMonth,
          paymentDate: genPaymentDate,
        });
      } catch (err: any) {
        const msg = err.response?.data?.error || 'Okänt fel';
        errors.push(`${emp?.name ?? ids[i]}: ${msg}`);
      }
    }
    setGenerating(false);
    setGenProgress('');
    if (errors.length > 0) {
      setGenError(errors.join('\n'));
    } else {
      setShowGenerateModal(false);
      setGenUserIds(new Set());
      setGenPaymentDate('');
      setYear(genYear);
      setMonth(genMonth);
      setTab('slips');
      await loadData();
    }
  };

  const downloadPdf = (id: number) => {
    const token = localStorage.getItem('token');
    // Open with auth token in header isn't possible via window.open
    // so we fetch and create a blob URL
    fetch(salarySlipsApi.pdfUrl(id), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lonebesked-${id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Granskning & Lönebesked</h1>
        <Button onClick={() => { setShowGenerateModal(true); setGenError(''); setGenProgress(''); setGenUserIds(new Set()); }}>
          + Generera lönebesked
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('entries')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'entries' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Tidrapporter
        </button>
        <button
          onClick={() => setTab('slips')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'slips' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lönebesked
        </button>
      </div>

      {/* Period filter */}
      <div className="flex gap-3 mb-6">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laddar...</div>
      ) : tab === 'entries' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Inga tidrapporter för {MONTHS[month - 1]} {year}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Anställd</th>
                  <th className="px-6 py-3 text-left">Anst.nr</th>
                  <th className="px-6 py-3 text-right">Timmar</th>
                  <th className="px-6 py-3 text-right">Lön</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{entry.employee_name}</td>
                    <td className="px-6 py-3 text-gray-500">{entry.employee_number}</td>
                    <td className="px-6 py-3 text-right font-mono">{entry.hours}</td>
                    <td className="px-6 py-3 text-right text-gray-500 font-mono">
                      {entry.employment_type === 'monthly'
                        ? `${(entry.monthly_salary ?? 0).toLocaleString('sv-SE')} kr/mån`
                        : entry.hourly_rate ? `${entry.hourly_rate} kr/h` : '—'}
                    </td>
                    <td className="px-6 py-3 text-center"><Badge status={entry.status} /></td>
                    <td className="px-6 py-3 text-center">
                      {entry.status === 'submitted' && (
                        <Button
                          variant="secondary"
                          className="text-xs py-1 px-3"
                          onClick={() => handleApprove(entry.id)}
                          disabled={approving === entry.id}
                        >
                          {approving === entry.id ? '...' : 'Godkänn'}
                        </Button>
                      )}
                      {entry.status === 'approved' && (
                        <span className="text-green-600 text-xs font-medium">✓ Godkänd</span>
                      )}
                      {entry.status === 'draft' && (
                        <span className="text-gray-400 text-xs">Ej inskickad</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {slips.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Inga lönebesked för {MONTHS[month - 1]} {year}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Anställd</th>
                  <th className="px-6 py-3 text-left">Anst.nr</th>
                  <th className="px-6 py-3 text-right">Timmar / Lön</th>
                  <th className="px-6 py-3 text-right">Bruttolön</th>
                  <th className="px-6 py-3 text-right">Netto</th>
                  <th className="px-6 py-3 text-left">Utbetalas</th>
                  <th className="px-6 py-3 text-center">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {slips.map((slip: any) => (
                  <tr key={slip.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{slip.employee_name}</td>
                    <td className="px-6 py-3 text-gray-500">{slip.employee_number}</td>
                    <td className="px-6 py-3 text-right font-mono text-gray-600">
                      {slip.employment_type === 'monthly'
                        ? `${(slip.monthly_salary ?? 0).toLocaleString('sv-SE')} kr/mån`
                        : `${slip.hours} h`}
                    </td>
                    <td className="px-6 py-3 text-right font-mono">
                      {slip.total_brutto?.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-semibold text-green-700">
                      {slip.net_salary?.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{slip.payment_date}</td>
                    <td className="px-6 py-3 text-center">
                      <Button
                        variant="ghost"
                        className="text-xs py-1 px-3 text-brand-600"
                        onClick={() => downloadPdf(slip.id)}
                      >
                        ↓ PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <Modal title="Generera lönebesked" onClose={() => { setShowGenerateModal(false); setGenUserIds(new Set()); setGenError(''); setGenProgress(''); }}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Anställda</label>
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() => setGenUserIds(
                    genUserIds.size === employees.length
                      ? new Set()
                      : new Set(employees.map((e: any) => e.id))
                  )}
                >
                  {genUserIds.size === employees.length ? 'Avmarkera alla' : 'Välj alla'}
                </button>
              </div>
              <div className="border border-gray-300 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {employees.map((e: any) => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={genUserIds.has(e.id)}
                      onChange={() => toggleEmployee(e.id)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-800">{e.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{e.employee_number}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Månad</label>
                <select
                  value={genMonth}
                  onChange={e => setGenMonth(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">År</label>
                <select
                  value={genYear}
                  onChange={e => setGenYear(Number(e.target.value))}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Utbetalningsdatum</label>
              <input
                type="date"
                value={genPaymentDate}
                onChange={e => setGenPaymentDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {genProgress && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-sm">
                {genProgress}
              </div>
            )}

            {genError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm whitespace-pre-line">
                {genError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>
                Avbryt
              </Button>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? 'Genererar...' : 'Generera'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
