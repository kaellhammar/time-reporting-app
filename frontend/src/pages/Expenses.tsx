import { useState, useEffect, useRef } from 'react';
import { expensesApi } from '../api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Modal from '../components/Modal';

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

const emptyForm = {
  inkops_stalle: '',
  avser: '',
  belopp: '',
  annan_valuta: '',
  klar: false,
  deltagare: '',
};

export default function Expenses() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Upload / extraction state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingFilename, setPendingFilename] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => { load(); }, [year, month]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await expensesApi.list({ year, month });
      setExpenses(data);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setPendingFilename('');
    setUploadError('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (exp: any) => {
    setEditing(exp);
    setForm({
      inkops_stalle: exp.inkops_stalle || '',
      avser: exp.avser || '',
      belopp: exp.belopp != null ? String(exp.belopp) : '',
      annan_valuta: exp.annan_valuta || '',
      klar: !!exp.klar,
      deltagare: exp.deltagare || '',
    });
    setPendingFilename(exp.receipt_filename || '');
    setUploadError('');
    setError('');
    setShowModal(true);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const result = await expensesApi.extract(file);
      setPendingFilename(result.filename || '');
      if (result.extracted) {
        setForm(prev => ({
          ...prev,
          inkops_stalle: result.extracted.inkopsStalle || prev.inkops_stalle,
          avser: result.extracted.avser || prev.avser,
          belopp: result.extracted.belopp != null ? String(result.extracted.belopp) : prev.belopp,
          annan_valuta: result.extracted.annanValuta || prev.annan_valuta,
          deltagare: result.extracted.deltagare || prev.deltagare,
        }));
      }
      if (result.error) setUploadError(result.error);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Uppladdning misslyckades');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        year,
        month,
        inkops_stalle: form.inkops_stalle,
        avser: form.avser,
        belopp: form.belopp !== '' ? Number(form.belopp) : null,
        annan_valuta: form.annan_valuta || null,
        klar: form.klar,
        deltagare: form.deltagare || null,
        receipt_filename: pendingFilename || null,
      };
      if (editing) {
        await expensesApi.update(editing.id, payload);
      } else {
        await expensesApi.create(payload);
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
      await expensesApi.delete(id);
      setDeleteConfirm(null);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Kunde inte ta bort');
    }
  };

  const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni',
                     'Juli','Augusti','September','Oktober','November','December'];

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const url = expensesApi.exportUrl({ year, month });
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Kvittosammanstallning-${year}-${String(month).padStart(2, '0')}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const handleDownloadReceipts = () => {
    const token = localStorage.getItem('token');
    const url = expensesApi.receiptsZipUrl({ year, month });
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.error); });
        return r.blob();
      })
      .then(blob => {
        const folderName = `Expenses ${MONTHS_SV[month - 1]} ${year}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${folderName}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => alert(err.message));
  };

  const openReceipt = (filename: string) => {
    const token = localStorage.getItem('token');
    fetch(expensesApi.receiptUrl(filename), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      });
  };

  const total = expenses.reduce((sum, e) => sum + (e.belopp || 0), 0);

  const f = (key: keyof typeof emptyForm, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Utlägg</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleDownloadReceipts} disabled={expenses.length === 0}>
            ↓ Ladda ned kvitton
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={expenses.length === 0}>
            ↓ Exportera Excel
          </Button>
          <Button onClick={openCreate}>+ Lägg till kvitto</Button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className={selectCls}
        >
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
          {expenses.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Inga utlägg för {MONTHS[month - 1]} {year}.{' '}
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
                  <th className="px-4 py-3 text-left">Inköpsställe</th>
                  <th className="px-4 py-3 text-left">Avser</th>
                  <th className="px-4 py-3 text-right">Belopp</th>
                  <th className="px-4 py-3 text-left">Annan valuta</th>
                  <th className="px-4 py-3 text-center">Klar</th>
                  <th className="px-4 py-3 text-left">Deltagare</th>
                  <th className="px-4 py-3 text-center">Kvitto</th>
                  <th className="px-4 py-3 text-center">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((exp: any) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 font-mono">{exp.nr}</td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {exp.employee_name}<br />
                        <span className="text-gray-400">{exp.employee_number}</span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-gray-800">{exp.inkops_stalle || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{exp.avser || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {exp.belopp != null
                        ? exp.belopp.toLocaleString('sv-SE', { minimumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{exp.annan_valuta || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {exp.klar ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{exp.deltagare || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {exp.receipt_filename ? (
                        <button
                          onClick={() => openReceipt(exp.receipt_filename)}
                          className="text-brand-600 hover:underline text-xs"
                        >
                          Visa
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!isAdmin && (
                          <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => openEdit(exp)}>
                            Redigera
                          </Button>
                        )}
                        {deleteConfirm === exp.id ? (
                          <>
                            <Button variant="danger" className="text-xs py-1 px-2" onClick={() => handleDelete(exp.id)}>
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
                            onClick={() => setDeleteConfirm(exp.id)}
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
                  <td colSpan={isAdmin ? 4 : 3} className="px-4 py-3 text-right text-gray-600">Totalt:</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {total.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={isAdmin ? 5 : 5} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Redigera utlägg' : 'Nytt utlägg'}
          onClose={() => setShowModal(false)}
          wide
        >
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg px-6 py-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {uploading ? (
                <p className="text-sm text-brand-600">Analyserar kvitto med AI...</p>
              ) : pendingFilename ? (
                <p className="text-sm text-green-600">
                  ✓ Kvitto bifogat —{' '}
                  <span className="underline" onClick={e => { e.stopPropagation(); openReceipt(pendingFilename); }}>
                    Visa
                  </span>
                  {' · '}
                  <span className="text-gray-400">klicka för att byta</span>
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Dra och släpp eller klicka för att ladda upp kvitto
                  <br />
                  <span className="text-xs text-gray-400">JPG, PNG, PDF — max 15 MB</span>
                </p>
              )}
            </div>

            {uploadError && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-lg text-sm">
                {uploadError} — fyll i fälten manuellt.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Inköpsställe">
                <input value={form.inkops_stalle} onChange={e => f('inkops_stalle', e.target.value)} className={inputCls} placeholder="Butik / leverantör" />
              </Field>
              <Field label="Avser">
                <input value={form.avser} onChange={e => f('avser', e.target.value)} className={inputCls} placeholder="Vad avser inköpet?" />
              </Field>
              <Field label="Belopp (SEK)">
                <input type="number" value={form.belopp} onChange={e => f('belopp', e.target.value)} className={inputCls} placeholder="0.00" step="0.01" />
              </Field>
              <Field label="Annan valuta">
                <input value={form.annan_valuta} onChange={e => f('annan_valuta', e.target.value)} className={inputCls} placeholder="t.ex. USD 45.00" />
              </Field>
              <Field label="Deltagare" className="col-span-2">
                <input value={form.deltagare} onChange={e => f('deltagare', e.target.value)} className={inputCls} placeholder="Namn på deltagare" />
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
              <Button onClick={handleSave} disabled={saving || uploading}>
                {saving ? 'Sparar...' : editing ? 'Spara ändringar' : 'Spara utlägg'}
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
