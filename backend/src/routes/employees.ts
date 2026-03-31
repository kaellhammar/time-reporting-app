import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', (_req: Request, res: Response): void => {
  const employees = db.prepare(
    `SELECT id, name, email, role, employee_number, personnummer, address, hourly_rate,
            monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type, health_insurance_benefit,
            car_deduction, created_at
     FROM users WHERE role = 'employee' ORDER BY employee_number`
  ).all();
  res.json(employees);
});

router.post('/', (req: Request, res: Response): void => {
  const {
    name, email, password, employee_number, personnummer, address,
    hourly_rate, monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type,
    health_insurance_benefit, car_deduction
  } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email and password are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get([email]);
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const hash = bcrypt.hashSync(password, 12);

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, employee_number, personnummer, address,
                       hourly_rate, monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type,
                       health_insurance_benefit, car_deduction)
    VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    name, email, hash,
    employee_number || null,
    personnummer || null,
    address || null,
    hourly_rate || 0,
    monthly_salary || 0,
    tabellskatt_rate !== undefined ? tabellskatt_rate : 0.25,
    tax_table || 31,
    tax_rate || 0.30,
    employment_type || 'hourly',
    health_insurance_benefit || 0,
    car_deduction || 0
  ]);

  const created = db.prepare(
    `SELECT id, name, email, role, employee_number, personnummer, address, hourly_rate,
             monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type, health_insurance_benefit, car_deduction
     FROM users WHERE id = ?`
  ).get([result.lastInsertRowid]) as any;

  res.status(201).json(created);
});

router.get('/:id', (req: Request, res: Response): void => {
  const employee = db.prepare(
    `SELECT id, name, email, role, employee_number, personnummer, address, hourly_rate,
             monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type, health_insurance_benefit,
             car_deduction, created_at
     FROM users WHERE id = ? AND role = 'employee'`
  ).get([req.params.id]) as any;

  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  res.json(employee);
});

router.put('/:id', (req: Request, res: Response): void => {
  const {
    name, email, password, employee_number, personnummer, address,
    hourly_rate, monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type,
    health_insurance_benefit, car_deduction
  } = req.body;

  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get([req.params.id, 'employee']) as any;
  if (!existing) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const passwordHash = password ? bcrypt.hashSync(password, 12) : existing.password_hash;

  db.prepare(`
    UPDATE users SET
      name = ?, email = ?, password_hash = ?, employee_number = ?, personnummer = ?,
      address = ?, hourly_rate = ?, monthly_salary = ?, tabellskatt_rate = ?, tax_table = ?, tax_rate = ?,
      employment_type = ?, health_insurance_benefit = ?, car_deduction = ?
    WHERE id = ?
  `).run([
    name || existing.name,
    email || existing.email,
    passwordHash,
    employee_number !== undefined ? employee_number : existing.employee_number,
    personnummer !== undefined ? personnummer : existing.personnummer,
    address !== undefined ? address : existing.address,
    hourly_rate !== undefined ? hourly_rate : existing.hourly_rate,
    monthly_salary !== undefined ? monthly_salary : existing.monthly_salary,
    tabellskatt_rate !== undefined ? tabellskatt_rate : existing.tabellskatt_rate,
    tax_table !== undefined ? tax_table : existing.tax_table,
    tax_rate !== undefined ? tax_rate : existing.tax_rate,
    employment_type || existing.employment_type,
    health_insurance_benefit !== undefined ? health_insurance_benefit : existing.health_insurance_benefit,
    car_deduction !== undefined ? car_deduction : existing.car_deduction,
    req.params.id
  ]);

  const updated = db.prepare(
    `SELECT id, name, email, role, employee_number, personnummer, address, hourly_rate,
             monthly_salary, tabellskatt_rate, tax_table, tax_rate, employment_type, health_insurance_benefit, car_deduction
     FROM users WHERE id = ?`
  ).get([req.params.id]);

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get([req.params.id, 'employee']);
  if (!existing) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run([req.params.id]);
  res.json({ message: 'Employee deleted' });
});

export default router;
