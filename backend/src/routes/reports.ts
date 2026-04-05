import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import db from '../db';
import { requireAdmin, authenticateToken } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

const MONTHS = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

router.get('/time-entries', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { year, month, userIds } = req.query;
  let query = 'SELECT te.*, u.name as employee_name, u.employee_number, u.hourly_rate, u.monthly_salary, u.employment_type, u.tax_rate, u.personnummer FROM time_entries te JOIN users u ON te.user_id = u.id WHERE 1=1';
  const params: any[] = [];
  if (year) { query += ' AND te.year = ?'; params.push(year); }
  if (month) { query += ' AND te.month = ?'; params.push(month); }
  if (userIds) { const ids = (userIds as string).split(',').map(Number); query += ' AND te.user_id IN (' + ids.map(() => '?').join(',') + ')'; params.push(...ids); }
  query += ' ORDER BY te.year DESC, te.month DESC, u.employee_number';
  const entries = db.prepare(query).all(params) as any[];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tidrapporter');
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sheet.columns = [
    { header: 'Anst.nr', key: 'employee_number', width: 10 },
    { header: 'Namn', key: 'employee_name', width: 22 },
    { header: 'Personnummer', key: 'personnummer', width: 16 },
    { header: 'Ar', key: 'year', width: 8 },
    { header: 'Manad', key: 'month', width: 14 },
    { header: 'Uppdrag', key: 'assignment', width: 24 },
    { header: 'Timmar', key: 'hours', width: 10 },
    { header: 'Anstallningstyp', key: 'employment_type', width: 16 },
    { header: 'Timlon', key: 'hourly_rate', width: 10 },
    { header: 'Manadsilon', key: 'monthly_salary', width: 12 },
    { header: 'Skattesats', key: 'tax_rate', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  sheet.getRow(1).eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; cell.alignment = { vertical: 'middle', horizontal: 'center' }; });
  sheet.getRow(1).height = 24;
  entries.forEach((e: any, i: number) => {
    const row = sheet.addRow({ employee_number: e.employee_number, employee_name: e.employee_name, personnummer: e.personnummer || '', year: e.year, month: MONTHS[e.month - 1], assignment: e.assignment || '', hours: e.hours, employment_type: e.employment_type === 'monthly' ? 'Manadsanstald' : 'Timanstald', hourly_rate: e.employment_type === 'hourly' ? e.hourly_rate : '', monthly_salary: e.employment_type === 'monthly' ? e.monthly_salary : '', tax_rate: Math.round(e.tax_rate * 100) + '%', status: e.status === 'approved' ? 'Godkand' : e.status === 'submitted' ? 'Inskickad' : 'Utkast' });
    if (i % 2 === 0) { row.eachCell((cell: ExcelJS.Cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }; }); }
  });
  const periodLabel = year && month ? '_' + year + '_' + MONTHS[Number(month)-1] : year ? '_' + year : '';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tidrapport' + periodLabel + '.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
