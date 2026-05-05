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
  const { year, month, datum, ort, syfte, typ, belopp, klar } = req.body;

  if (!year || !month || !datum) {
    res.status(400).json({ error: 'year, month och datum krävs' });
    return;
  }

  const maxNr = (db.prepare(
    'SELECT COALESCE(MAX(nr), 0) as max_nr FROM traktamente WHERE user_id = ? AND year = ? AND month = ?'
  ).get([userId, year, month]) as any).max_nr;

  const result = db.prepare(`
    INSERT INTO traktamente (user_id, year, month, nr, datum, ort, syfte, typ, belopp, klar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([userId, year, month, maxNr + 1, datum, ort || null, syfte || null, typ || 'hel_dag', belopp ?? null, klar ? 1 : 0]);

  const row = db.prepare('SELECT t.*, u.name as employee_name, u.employee_number FROM traktamente t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get([result.lastInsertRowid]);
  res.status(201).json(row);
});

// PUT /api/traktamente/:id
router.put('/:id', (req: Request, res: Response): void => {
  const isAdmin = req.user!.role === 'admin';
  const { datum, ort, syfte, typ, belopp, klar } = req.body;

  const existing = db.prepare('SELECT * FROM traktamente WHERE id = ?').get([req.params.id]) as any;
  if (!existing) { res.status(404).json({ error: 'Hittades inte' }); return; }
  if (!isAdmin && existing.user_id !== req.user!.id) { res.status(403).json({ error: 'Ej tillåtet' }); return; }

  db.prepare(`
    UPDATE traktamente SET datum = ?, ort = ?, syfte = ?, typ = ?, belopp = ?, klar = ?
    WHERE id = ?
  `).run([datum ?? existing.datum, ort ?? null, syfte ?? null, typ ?? existing.typ, belopp ?? null, klar ? 1 : 0, req.params.id]);

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

  const headers = isAdmin
    ? ['Nr', 'Anställd', 'Personnr', 'Datum', 'Ort', 'Syfte', 'Typ', 'Belopp (SEK)', 'Klar']
    : ['Nr', 'Datum', 'Ort', 'Syfte', 'Typ', 'Belopp (SEK)', 'Klar'];

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  const typLabel = (t: string) => t === 'hel_dag' ? 'Hel dag' : t === 'halv_dag' ? 'Halv dag' : 'Natt';

  rows.forEach(r => {
    if (isAdmin) {
      ws.addRow([r.nr, r.employee_name, r.employee_number, r.datum, r.ort || '', r.syfte || '', typLabel(r.typ), r.belopp ?? '', r.klar ? 'Ja' : 'Nej']);
    } else {
      ws.addRow([r.nr, r.datum, r.ort || '', r.syfte || '', typLabel(r.typ), r.belopp ?? '', r.klar ? 'Ja' : 'Nej']);
    }
  });

  const total = rows.reduce((s, r) => s + (r.belopp || 0), 0);
  const totalRow = ws.addRow([]);
  const beloppCol = isAdmin ? 8 : 6;
  totalRow.getCell(beloppCol - 1).value = 'Totalt:';
  totalRow.getCell(beloppCol - 1).font = { bold: true };
  totalRow.getCell(beloppCol).value = total;
  totalRow.getCell(beloppCol).font = { bold: true };

  ws.columns.forEach(col => { col.width = 18; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const monthStr = month ? String(month).padStart(2, '0') : 'alla';
  res.setHeader('Content-Disposition', `attachment; filename="Traktamente-${year || 'alla'}-${monthStr}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
