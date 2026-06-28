import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import db from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// GET /api/traktamente
router.get('/', (req: Request, res: Response): void => {
  const { year, month, userId } = req.query;
  const isAdmin = req.user!.role === 'admin';

  let query: string;
  const params: any[] = [];

  if (isAdmin) {
    query = `SELECT t.*, u.name as employee_name, u.employee_number
             FROM traktamente t JOIN users u ON t.user_id = u.id WHERE 1=1`;
    if (userId) { query += ` AND t.user_id = ?`; params.push(userId); }
  } else {
    query = `SELECT t.*, u.name as employee_name, u.employee_number
             FROM traktamente t JOIN users u ON t.user_id = u.id WHERE t.user_id = ?`;
    params.push(req.user!.id);
  }

  if (year)  { query += ` AND t.year = ?`;  params.push(year); }
  if (month) { query += ` AND t.month = ?`; params.push(month); }
  query += ` ORDER BY t.year DESC, t.month DESC, t.nr ASC`;

  res.json(db.prepare(query).all(params));
});

// POST /api/traktamente
router.post('/', (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const { year, month, datum, land, ort, syfte, typ, belopp, klar, avdrag_frukost, avdrag_lunch, avdrag_middag } = req.body;

  if (!year || !month || !datum) {
    res.status(400).json({ error: 'year, month och datum krävs' });
    return;
  }

  const maxNr = (db.prepare(
    'SELECT COALESCE(MAX(nr), 0) as max_nr FROM traktamente WHERE user_id = ? AND year = ? AND month = ?'
  ).get([userId, year, month]) as any).max_nr;

  const result = db.prepare(`
    INSERT INTO traktamente (user_id, year, month, nr, datum, land, ort, syfte, typ, belopp, klar, avdrag_frukost, avdrag_lunch, avdrag_middag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([userId, year, month, maxNr + 1, datum, land || null, ort || null, syfte || null, typ || 'hel_dag', belopp ?? null, klar ? 1 : 0,
    avdrag_frukost ? 1 : 0, avdrag_lunch ? 1 : 0, avdrag_middag ? 1 : 0]);

  const row = db.prepare('SELECT t.*, u.name as employee_name, u.employee_number FROM traktamente t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get([result.lastInsertRowid]);
  res.status(201).json(row);
});

// PUT /api/traktamente/:id
router.put('/:id', (req: Request, res: Response): void => {
  const isAdmin = req.user!.role === 'admin';
  const { datum, land, ort, syfte, typ, belopp, klar, avdrag_frukost, avdrag_lunch, avdrag_middag } = req.body;

  const existing = db.prepare('SELECT * FROM traktamente WHERE id = ?').get([req.params.id]) as any;
  if (!existing) { res.status(404).json({ error: 'Hittades inte' }); return; }
  if (!isAdmin && existing.user_id !== req.user!.id) { res.status(403).json({ error: 'Ej tillåtet' }); return; }

  db.prepare(`
    UPDATE traktamente SET datum = ?, land = ?, ort = ?, syfte = ?, typ = ?, belopp = ?, klar = ?, avdrag_frukost = ?, avdrag_lunch = ?, avdrag_middag = ?
    WHERE id = ?
  `).run([datum ?? existing.datum, land ?? null, ort ?? null, syfte ?? null, typ ?? existing.typ, belopp ?? null, klar ? 1 : 0,
    avdrag_frukost !== undefined ? (avdrag_frukost ? 1 : 0) : existing.avdrag_frukost,
    avdrag_lunch   !== undefined ? (avdrag_lunch   ? 1 : 0) : existing.avdrag_lunch,
    avdrag_middag  !== undefined ? (avdrag_middag  ? 1 : 0) : existing.avdrag_middag,
    req.params.id]);

  const row = db.prepare('SELECT t.*, u.name as employee_name, u.employee_number FROM traktamente t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get([req.params.id]);
  res.json(row);
});

// DELETE /api/traktamente/:id
router.delete('/:id', (req: Request, res: Response): void => {
  const isAdmin = req.user!.role === 'admin';
  const existing = db.prepare('SELECT * FROM traktamente WHERE id = ?').get([req.params.id]) as any;
  if (!existing) { res.status(404).json({ error: 'Hittades inte' }); return; }
  if (!isAdmin && existing.user_id !== req.user!.id) { res.status(403).json({ error: 'Ej tillåtet' }); return; }

  db.prepare('DELETE FROM traktamente WHERE id = ?').run([req.params.id]);
  res.json({ ok: true });
});

// GET /api/traktamente/export — Excel export
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const { year, month, userId } = req.query;
  const isAdmin = req.user!.role === 'admin';

  let query = `SELECT t.*, u.name as employee_name, u.employee_number
               FROM traktamente t JOIN users u ON t.user_id = u.id WHERE 1=1`;
  const params: any[] = [];

  if (!isAdmin) { query += ` AND t.user_id = ?`; params.push(req.user!.id); }
  else if (userId) { query += ` AND t.user_id = ?`; params.push(userId); }
  if (year)  { query += ` AND t.year = ?`;  params.push(year); }
  if (month) { query += ` AND t.month = ?`; params.push(month); }
  query += ` ORDER BY t.nr ASC`;

  const rows = db.prepare(query).all(params) as any[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Traktamente');

  const typLabel = (t: string) => t === 'hel_dag' ? 'Hel dag' : t === 'halv_dag' ? 'Halv dag' : 'Natt';
  const calcDeduction = (r: any) => {
    const base = r.belopp || 0;
    return Math.round(base * ((r.avdrag_frukost ? 15 : 0) + (r.avdrag_lunch ? 35 : 0) + (r.avdrag_middag ? 35 : 0)) / 100 * 100) / 100;
  };
  const avdragLabel = (r: any) => {
    const parts = [];
    if (r.avdrag_frukost) parts.push('Frukost 15%');
    if (r.avdrag_lunch)   parts.push('Lunch 35%');
    if (r.avdrag_middag)  parts.push('Middag 35%');
    return parts.join(', ') || '';
  };

  const headers = isAdmin
    ? ['Nr', 'Anställd', 'Personnr', 'Datum', 'Land', 'Ort', 'Syfte', 'Typ', 'Belopp (SEK)', 'Avdrag', 'Avdrag (SEK)', 'Netto (SEK)', 'Klar']
    : ['Nr', 'Datum', 'Land', 'Ort', 'Syfte', 'Typ', 'Belopp (SEK)', 'Avdrag', 'Avdrag (SEK)', 'Netto (SEK)', 'Klar'];

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A9F' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  rows.forEach(r => {
    const deduction = calcDeduction(r);
    const net = (r.belopp ?? 0) - deduction;
    if (isAdmin) {
      ws.addRow([r.nr, r.employee_name, r.employee_number, r.datum, r.land || '', r.ort || '', r.syfte || '', typLabel(r.typ),
        r.belopp ?? '', avdragLabel(r), deduction || '', net || '', r.klar ? 'Ja' : 'Nej']);
    } else {
      ws.addRow([r.nr, r.datum, r.land || '', r.ort || '', r.syfte || '', typLabel(r.typ),
        r.belopp ?? '', avdragLabel(r), deduction || '', net || '', r.klar ? 'Ja' : 'Nej']);
    }
  });

  // Number format the amount columns
  const beloppCol  = isAdmin ? 9  : 7;
  const avdragCol  = isAdmin ? 11 : 9;
  const nettoCol   = isAdmin ? 12 : 10;
  for (let i = 2; i <= rows.length + 1; i++) {
    ws.getRow(i).getCell(beloppCol).numFmt = '#,##0.00';
    ws.getRow(i).getCell(avdragCol).numFmt = '#,##0.00';
    ws.getRow(i).getCell(nettoCol).numFmt  = '#,##0.00';
  }

  const netTotal = rows.reduce((s, r) => s + ((r.belopp || 0) - calcDeduction(r)), 0);
  const totalRow = ws.addRow([]);
  totalRow.getCell(nettoCol - 1).value = 'Totalt netto:';
  totalRow.getCell(nettoCol - 1).font  = { bold: true };
  totalRow.getCell(nettoCol).value     = netTotal;
  totalRow.getCell(nettoCol).font      = { bold: true };
  totalRow.getCell(nettoCol).numFmt    = '#,##0.00';

  ws.columns.forEach(col => { col.width = 18; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const monthStr = month ? String(month).padStart(2, '0') : 'alla';
  res.setHeader('Content-Disposition', `attachment; filename="Traktamente-${year || 'alla'}-${monthStr}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
