import { useState, useEffect } from 'react';
import { traktamenteApi } from '../api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Modal from '../components/Modal';

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

const TYP_OPTIONS = [
  { value: 'hel_dag', label: 'Hel dag' },
  { value: 'halv_dag', label: 'Halv dag' },
  { value: 'natt', label: 'Natt' },
];

const SKATTEVERKET_URL =
  'https://skatteverket.entryscape.net/rowstore/dataset/70ccea31-b64c-4bf5-84c7-673f04f32505/json';

const emptyForm = {
  datum: '',
  land: '',
  ort: '',
  syfte: '',
  typ: 'hel_dag',
  belopp: '',
  klar: false,
};

function calculateBelopp(normalbelopp: number, typ: string): number {
  if (typ === 'halv_dag') return Math.round(normalbelopp / 2);
  return normalbelopp;
}

export default function Traktamente() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [normalbelopp, setNormalbelopp] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => { load(); }, [year, month]);

  // Fetch traktamente amount from Skatteverket when land changes
  useEffect(() => {
    if (!showModal) return;
    const land = form.land.trim();
    if (!land) {
      setNormalbelopp(null);
      setLookupError('');
      return;
    }
    const timer = setTimeout(async () => {
      setLookupLoading(true);
      setLookupError('');
      try {
        const params = new URLSearchParams();
        params.set('land eller område', land);
        params.set('år', String(year));
        const res = await fetch(`${SKATTEVERKET_URL}?${params}`);
        const data = await res.json();
        if (data.results?.length > 0) {
          const nb = Number(data.results[0]['normalbelopp']);
          setNormalbelopp(nb);
          setForm(prev => ({ ...prev, belopp: String(calculateBelopp(nb, prev.typ)) }));
          setLookupError('');
        } else {
          setNormalbelopp(null);
          setLookupError(`"${land}" hittades inte i Skatteverkets register för ${year}`);
        }
      } catch {
        setNormalbelopp(null);
        setLookupError('Kunde inte hämta belopp från Skatteverket');
      } finally {
        setLookupLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.land, showModal]);

  // Recalculate belopp when typ changes if a lookup has been done
  useEffect(() => {
    if (normalbelopp !== null) {
      setForm(prev => ({ ...prev, belopp: String(calculateBelopp(normalbelopp, prev.typ)) }));
    }
  }, [form.typ, normalbelopp]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await traktamenteApi.list({ year, month });
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setNormalbelopp(null);
    setLookupError('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      datum: row.datum || '',
      land: row.land || '',
      ort: row.ort || '',
      syfte: row.syfte || '',
      typ: row.typ || 'hel_dag',
      belopp: row.belopp != null ? String(row.belopp) : '',
      klar: !!row.klar,
    });
    setNormalbelopp(null);
    setLookupError('');
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.datum) { setError('Datum krävs'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        year,
        month,
        datum: form.datum,
        land: form.land || null,
        ort: form.ort || null,
        syfte: form.syfte || null,
        typ: form.typ,
        belopp: form.belopp !== '' ? Number(form.belopp) : null,
        klar: form.klar,
      };
      if (editing) {
        await traktamenteApi.update(editing.id, payload);
      } else {
        await traktamenteApi.create(payload);
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await traktamenteApi.delete(id);
      setDeleteConfirm(null);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Kunde inte ta bort');
    }
  };

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const url = traktamenteApi.exportUrl({ year, month });
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Traktamente-${year}-${String(month).padStart(2, '0')}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const total = rows.reduce((sum, r) => sum + (r.belopp || 0), 0);
  const f = (key: keyof typeof emptyForm, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Traktamente</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>
            ↓ Exportera Excel
          </Button>
          <Button onClick={openCreate}>+ Lägg till traktamente</Button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={selectCls}>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laddar...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Inga traktamenten för {MONTHS[month - 1]} {year}.{' '}
              <button onClick={openCreate} className="text-brand-600 hover:underline">
                Lägg till det första
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10">Nr</th>
                  {isAdmin && <th className="px-4 py-3 text-left">Anställd</th>}
                  <th className="px-4 py-3 text-left">Datum</th>
                  <th className="px-4 py-3 text-left">Land</th>
                  <th className="px-4 py-3 text-left">Ort</th>
                  <th className="px-4 py-3 text-left">Syfte</th>
                  <th className="px-4 py-3 text-left">Typ</th>
                  <th className="px-4 py-3 text-right">Belopp (SEK)</th>
                  <th className="px-4 py-3 text-center">Klar</th>
                  <th className="px-4 py-3 text-center">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 font-mono">{row.nr}</td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {row.employee_name}<br />
                        <span className="text-gray-400">{row.employee_number}</span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-gray-800">{row.datum}</td>
                    <td className="px-4 py-2 text-gray-600">{row.land || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.ort || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.syfte || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {TYP_OPTIONS.find(t => t.value === row.typ)?.label || row.typ}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.belopp != null
                        ? row.belopp.toLocaleString('sv-SE', { minimumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.klar
                        ? <span className="text-green-600 font-bold">✓</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!isAdmin && (
                          <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => openEdit(row)}>
                            Redigera
                          </Button>
                        )}
                        {deleteConfirm === row.id ? (
                          <>
                            <Button variant="danger" className="text-xs py-1 px-2" onClick={() => handleDelete(row.id)}>
                              Bekräfta
                            </Button>
                            <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => setDeleteConfirm(null)}>
                              Avbryt
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            className="text-xs py-1 px-2 text-red-500 hover:text-red-700"
                            onClick={() => setDeleteConfirm(row.id)}
                          >
                            Ta bort
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-sm">
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-3 text-right text-gray-600">Totalt:</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {total.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Redigera traktamente' : 'Nytt traktamente'}
          onClose={() => setShowModal(false)}
          wide
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Datum">
                <input
                  type="date"
                  value={form.datum}
                  onChange={e => f('datum', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Typ">
                <select value={form.typ} onChange={e => f('typ', e.target.value)} className={inputCls}>
                  {TYP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Land">
                <div className="relative">
                  <input
                    value={form.land}
                    onChange={e => f('land', e.target.value)}
                    className={inputCls}
                    placeholder="T.ex. Tyskland, Japan..."
                  />
                  {lookupLoading && (
                    <span className="absolute right-3 top-2 text-xs text-gray-400">Hämtar...</span>
                  )}
                </div>
                {lookupError && (
                  <p className="mt-1 text-xs text-amber-600">{lookupError}</p>
                )}
                {normalbelopp !== null && !lookupLoading && (
                  <p className="mt-1 text-xs text-green-600">
                    Normalbelopp {normalbelopp} SEK/dag (Skatteverket {year})
                  </p>
                )}
              </Field>
              <Field label="Ort">
                <input
                  value={form.ort}
                  onChange={e => f('ort', e.target.value)}
                  className={inputCls}
                  placeholder="Stad / destination"
                />
              </Field>
              <Field label="Belopp (SEK)">
                <input
                  type="number"
                  value={form.belopp}
                  onChange={e => f('belopp', e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                  step="0.01"
                />
              </Field>
              <Field label="Syfte" className="col-span-2">
                <input
                  value={form.syfte}
                  onChange={e => f('syfte', e.target.value)}
                  className={inputCls}
                  placeholder="Beskriv syftet med resan"
                />
              </Field>
              <Field label="Klar" className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.klar}
                    onChange={e => f('klar', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">Markera som klar</span>
                </label>
              </Field>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Avbryt</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Sparar...' : editing ? 'Spara ändringar' : 'Spara traktamente'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const selectCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
