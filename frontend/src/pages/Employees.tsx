import { useState, useEffect } from 'react';
import { employeesApi } from '../api';
import Button from '../components/Button';
import Modal from '../components/Modal';

interface Employee {
  id: number;
  name: string;
  email: string;
  employee_number: string;
  personnummer: string;
  address: string;
  hourly_rate: number;
  monthly_salary: number;
  tabellskatt_rate: number;
  tax_table: number;
  tax_rate: number;
  employment_type: string;
  health_insurance_benefit: number;
  car_deduction: number;
}

const emptyForm = {
  name: '',
  email: '',
  password: '',
  employee_number: '',
  personnummer: '',
  address: '',
  hourly_rate: '',
  monthly_salary: '',
  tabellskatt_rate: '25',
  tax_table: '31',
  tax_rate: '30',
  employment_type: 'hourly',
  health_insurance_benefit: '0',
  car_deduction: '0',
};

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await employeesApi.list();
      setEmployees(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Kunde inte ladda anställda');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      name: emp.name,
      email: emp.email,
      password: '',
      employee_number: emp.employee_number || '',
      personnummer: emp.personnummer || '',
      address: emp.address || '',
      monthly_salary: String(emp.monthly_salary || ''),
      tabellskatt_rate: String(Math.round((emp.tabellskatt_rate ?? 0.25) * 100)),
      hourly_rate: String(emp.hourly_rate),
      tax_table: String(emp.tax_table),
      tax_rate: String(Math.round(emp.tax_rate * 100)),
      employment_type: emp.employment_type,
      health_insurance_benefit: String(emp.health_insurance_benefit),
      car_deduction: String(emp.car_deduction),
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) {
      setError('Namn och e-post krävs');
      return;
    }
    if (!editing && !form.password) {
      setError('Lösenord krävs för ny anställd');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: any = {
        ...form,
        hourly_rate: Number(form.hourly_rate),
        monthly_salary: Number(form.monthly_salary),
        tabellskatt_rate: Number(form.tabellskatt_rate) / 100,
        tax_table: Number(form.tax_table),
        tax_rate: Number(form.tax_rate) / 100,
        health_insurance_benefit: Number(form.health_insurance_benefit),
        car_deduction: Number(form.car_deduction),
      };
      if (!payload.password) delete payload.password;

      if (editing) {
        await employeesApi.update(editing.id, payload);
      } else {
        await employeesApi.create(payload);
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
      await employeesApi.delete(id);
      setDeleteConfirm(null);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Kunde inte ta bort');
    }
  };

  const f = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Anställda</h1>
        <Button onClick={openCreate}>+ Ny anställd</Button>
      </div>

      {error && !showModal && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laddar...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {employees.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Inga anställda ännu.{' '}
              <button onClick={openCreate} className="text-brand-600 hover:underline">
                Lägg till din första anställda
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Anst.nr</th>
                  <th className="px-6 py-3 text-left">Namn</th>
                  <th className="px-6 py-3 text-left">E-post</th>
                  <th className="px-6 py-3 text-right">Lön</th>
                  <th className="px-6 py-3 text-center">Skattetabell</th>
                  <th className="px-6 py-3 text-center">Skatt %</th>
                  <th className="px-6 py-3 text-center">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-gray-500">{emp.employee_number}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{emp.name}</td>
                    <td className="px-6 py-3 text-gray-500">{emp.email}</td>
                    <td className="px-6 py-3 text-right font-mono">
                      {emp.employment_type === 'monthly'
                        ? <>{emp.monthly_salary.toLocaleString('sv-SE')} kr/mån</>
                        : <>{emp.hourly_rate} kr/h</>}
                    </td>
                    <td className="px-6 py-3 text-center">{emp.tax_table}</td>
                    <td className="px-6 py-3 text-center">{Math.round(emp.tax_rate * 100)}%</td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => openEdit(emp)}>
                          Redigera
                        </Button>
                        {deleteConfirm === emp.id ? (
                          <div className="flex gap-1">
                            <Button variant="danger" className="text-xs py-1 px-2" onClick={() => handleDelete(emp.id)}>
                              Bekräfta
                            </Button>
                            <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => setDeleteConfirm(null)}>
                              Avbryt
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" className="text-xs py-1 px-2 text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(emp.id)}>
                            Ta bort
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? `Redigera ${editing.name}` : 'Ny anställd'}
          onClose={() => setShowModal(false)}
          wide
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Namn *">
              <input value={form.name} onChange={e => f('name', e.target.value)} className={inputCls} placeholder="Förnamn Efternamn" />
            </Field>
            <Field label="E-post *">
              <input type="email" value={form.email} onChange={e => f('email', e.target.value)} className={inputCls} placeholder="namn@exempel.se" />
            </Field>
            <Field label={editing ? 'Nytt lösenord (lämna tomt för oförändrat)' : 'Lösenord *'}>
              <input type="password" value={form.password} onChange={e => f('password', e.target.value)} className={inputCls} placeholder="••••••••" />
            </Field>
            <Field label="Anställningsnummer">
              <input value={form.employee_number} onChange={e => f('employee_number', e.target.value)} className={inputCls} placeholder="001" />
            </Field>
            <Field label="Personnummer">
              <input value={form.personnummer} onChange={e => f('personnummer', e.target.value)} className={inputCls} placeholder="ÅÅÅÅMMDD-XXXX" />
            </Field>
            <Field label="Adress" className="col-span-2">
              <textarea value={form.address} onChange={e => f('address', e.target.value)} className={`${inputCls} h-16 resize-none`} placeholder="Gatuvägen 1&#10;12345 Stad" />
            </Field>
            <Field label="Anställningsform">
              <select value={form.employment_type} onChange={e => f('employment_type', e.target.value)} className={inputCls}>
                <option value="hourly">Timlön</option>
                <option value="monthly">Månadslön</option>
              </select>
            </Field>
            {form.employment_type === 'monthly' ? (
              <Field label="Månadslön (kr/mån)">
                <input type="number" value={form.monthly_salary} onChange={e => f('monthly_salary', e.target.value)} className={inputCls} placeholder="35000" />
              </Field>
            ) : (
              <Field label="Timlön (kr/h)">
                <input type="number" value={form.hourly_rate} onChange={e => f('hourly_rate', e.target.value)} className={inputCls} placeholder="300" />
              </Field>
            )}
            <Field label="Skattetabell">
              <input type="number" value={form.tax_table} onChange={e => f('tax_table', e.target.value)} className={inputCls} placeholder="31" />
            </Field>
            <Field label="Engångsskatt (%)">
              <input type="number" value={form.tax_rate} onChange={e => f('tax_rate', e.target.value)} className={inputCls} placeholder="30" min="0" max="100" />
            </Field>
            <Field label="Förmån sjukvårdsförsäkring (kr)">
              <input type="number" value={form.health_insurance_benefit} onChange={e => f('health_insurance_benefit', e.target.value)} className={inputCls} placeholder="0" />
            </Field>
            <Field label="Nettolöneavdrag bil (kr)">
              <input type="number" value={form.car_deduction} onChange={e => f('car_deduction', e.target.value)} className={inputCls} placeholder="0" />
            </Field>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Sparar...' : editing ? 'Spara ändringar' : 'Skapa anställd'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
