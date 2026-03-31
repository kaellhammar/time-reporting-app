import { Router, Request, Response } from 'express';
import db from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { calculateSalary, generateSalarySlipPDF, getBirthYearFromPersonnummer, SalarySlipData } from '../pdf/salarySlip';

const router = Router();

router.use(authenticateToken);

// GET /api/salary-slips
router.get('/', (req: Request, res: Response): void => {
  let slips: any[];
  if (req.user!.role === 'admin') {
    slips = db.prepare(`
      SELECT ss.*, u.name as employee_name, u.employee_number,
             u.employment_type, u.monthly_salary
      FROM salary_slips ss
      JOIN users u ON ss.user_id = u.id
      ORDER BY ss.year DESC, ss.month DESC, u.employee_number
    `).all();
  } else {
    slips = db.prepare(`
      SELECT ss.*, u.name as employee_name, u.employee_number,
             u.employment_type, u.monthly_salary
      FROM salary_slips ss
      JOIN users u ON ss.user_id = u.id
      WHERE ss.user_id = ?
      ORDER BY ss.year DESC, ss.month DESC
    `).all([req.user!.id]);
  }
  res.json(slips);
});

// POST /api/salary-slips/generate (admin only)
router.post('/generate', requireAdmin, (req: Request, res: Response): void => {
  const { userId, year, month, paymentDate } = req.body;

  if (!userId || !year || !month || !paymentDate) {
    res.status(400).json({ error: 'userId, year, month and paymentDate are required' });
    return;
  }

  const employee = db.prepare(
    `SELECT * FROM users WHERE id = ? AND role = 'employee'`
  ).get([userId]) as any;

  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const timeEntry = db.prepare(
    `SELECT * FROM time_entries WHERE user_id = ? AND year = ? AND month = ? AND status = 'approved'`
  ).get([userId, year, month]) as any;

  if (!timeEntry) {
    res.status(404).json({ error: 'No approved time entry found for this period. Please approve the time entry first.' });
    return;
  }

  const birthYear = getBirthYearFromPersonnummer(employee.personnummer || '');
  const calc = calculateSalary(
    timeEntry.hours,
    employee.hourly_rate,
    employee.tax_rate,
    employee.health_insurance_benefit,
    employee.car_deduction,
    birthYear,
    year,
    employee.employment_type,
    employee.monthly_salary || 0,
    employee.tabellskatt_rate || employee.tax_rate,
    employee.tax_table || 31
  );

  const ytd = db.prepare(`
    SELECT COALESCE(SUM(total_brutto), 0) as ytd_gross,
           COALESCE(SUM(tax_amount), 0) as ytd_tax,
           COALESCE(SUM(health_insurance_benefit), 0) as ytd_health_insurance
    FROM salary_slips
    WHERE user_id = ? AND year = ? AND month < ?
  `).get([userId, year, month]) as any;

  db.prepare('DELETE FROM salary_slips WHERE user_id = ? AND year = ? AND month = ?')
    .run([userId, year, month]);

  const result = db.prepare(`
    INSERT INTO salary_slips (
      user_id, year, month, payment_date, hours,
      gross_salary, holiday_compensation, total_brutto,
      health_insurance_benefit, car_deduction,
      tax_amount, tax_rate, tax_table, employer_avgift, net_salary,
      ytd_gross, ytd_tax, ytd_health_insurance
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    userId, year, month, paymentDate, timeEntry.hours,
    calc.grossSalary, calc.holidayCompensation, calc.totalBrutto,
    employee.health_insurance_benefit, employee.car_deduction,
    calc.taxAmount, employee.tax_rate, employee.tax_table, calc.employerAvgift, calc.netSalary,
    ytd.ytd_gross, ytd.ytd_tax, ytd.ytd_health_insurance
  ]);

  const slip = db.prepare(`
    SELECT ss.*, u.name as employee_name, u.employee_number
    FROM salary_slips ss JOIN users u ON ss.user_id = u.id
    WHERE ss.id = ?
  `).get([result.lastInsertRowid]);

  res.status(201).json(slip);
});

// GET /api/salary-slips/:id/pdf
router.get('/:id/pdf', (req: Request, res: Response): void => {
  const slip = db.prepare('SELECT * FROM salary_slips WHERE id = ?').get([req.params.id]) as any;

  if (!slip) {
    res.status(404).json({ error: 'Salary slip not found' });
    return;
  }

  if (req.user!.role !== 'admin' && slip.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const employee = db.prepare('SELECT * FROM users WHERE id = ?').get([slip.user_id]) as any;
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const slipData: SalarySlipData = {
    employeeName: employee.name,
    employeeNumber: employee.employee_number || '',
    employeeAddress: employee.address || undefined,
    year: slip.year,
    month: slip.month,
    paymentDate: slip.payment_date,
    hours: slip.hours,
    hourlyRate: employee.hourly_rate,
    monthlySalary: employee.monthly_salary || 0,
    employmentType: employee.employment_type,
    tabellskattRate: employee.tabellskatt_rate || employee.tax_rate,
    healthInsuranceBenefit: slip.health_insurance_benefit,
    carDeduction: slip.car_deduction,
    grossSalary: slip.gross_salary,
    holidayCompensation: slip.holiday_compensation,
    totalBrutto: slip.total_brutto,
    taxAmount: slip.tax_amount,
    taxRate: slip.tax_rate,
    taxTable: slip.tax_table,
    employerAvgift: slip.employer_avgift,
    netSalary: slip.net_salary,
    ytdGross: slip.ytd_gross,
    ytdTax: slip.ytd_tax,
    ytdHealthInsurance: slip.ytd_health_insurance || 0,
  };

  generateSalarySlipPDF(slipData, res);
});

export default router;
