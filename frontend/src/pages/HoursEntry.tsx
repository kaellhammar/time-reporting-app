import { useState, useEffect } from 'react';
import { timeEntriesApi } from '../api';
import Badge from '../components/Badge';
import Button from '../components/Button';

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
];

export default function HoursEntry() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [assignment, setAssignment] = useState('');
  const [hours, setHours] = useState('');
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => {
    loadEntry();
  }, [year, month]);

  const loadEntry = async () => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const entries = await timeEntriesApi.list(year, month);
      const found = entries[0] || null;
      setEntry(found);
      setHours(found ? String(found.hours) : '');
      setAssignment(found?.assignment || '');
    } catch {
      setError('Kunde inte hämta tidrapport');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!hours || isNaN(Number(hours))) {
      setError('Ange ett giltigt antal timmar');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await timeEntriesApi.upsert({ year, month, hours: Number(hours), assignment });
      setEntry(saved);
      setMessage('Sparad som utkast');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!entry) {
      setError('Spara rapporten innan du skickar in');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const updated = await timeEntriesApi.submit(entry.id);
      setEntry(updated);
      setMessage('Tidrapport inskickad!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kunde inte skicka in');
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = entry?.status === 'submitted' || entry?.status === 'approved';

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Mina timmar</h1>

      {/* Period selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Välj period</h2>
        <div className="flex gap-3">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Hours input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {MONTHS[month - 1]} {year}
          </h2>
          {entry && <Badge status={entry.status} />}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Laddar...</div>
        ) : (
          <>
            {entry?.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
                ✓ Tidrapport godkänd — lönebesked genereras av admin
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Antal timmar
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  disabled={isLocked}
                  step="0.5"
                  min="0"
                  max="744"
                  className="w-full border border-gray-300 rounded-lg px-4 py-4 text-4xl font-bold text-center text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">tim</span>
              </div>
            </div>

            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uppdrag
              </label>
              <input
                type="text"
                value={assignment}
                onChange={e => setAssignment(e.target.value)}
                disabled={isLocked}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Ange uppdrag eller kund..."
              />
            </div>

            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm mb-4">
                {message}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={saving || isLocked}
                className="flex-1"
              >
                {saving ? 'Sparar...' : 'Spara utkast'}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || isLocked || !entry}
                className="flex-1"
              >
                {submitting ? 'Skickar...' : 'Skicka in'}
              </Button>
            </div>

            {entry && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                {entry.submitted_at
                  ? `Inskickad ${new Date(entry.submitted_at).toLocaleDateString('sv-SE')}`
                  : `Senast sparad ${new Date(entry.id ? entry.id : Date.now()).toLocaleDateString('sv-SE')}`
                }
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
