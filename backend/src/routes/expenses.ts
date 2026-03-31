import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import db from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

const uploadsDir = path.resolve('./uploads/receipts');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/expenses
router.get('/', (req: Request, res: Response): void => {
  const { year, month, userId } = req.query;
  const isAdmin = req.user!.role === 'admin';

  let query: string;
  const params: any[] = [];

  if (isAdmin) {
    query = `SELECT e.*, u.name as employee_name, u.employee_number
             FROM expenses e JOIN users u ON e.user_id = u.id WHERE 1=1`;
    if (userId) { query += ` AND e.user_id = ?`; params.push(userId); }
  } else {
    query = `SELECT e.*, u.name as employee_name, u.employee_number
             FROM expenses e JOIN users u ON e.user_id = u.id WHERE e.user_id = ?`;
    params.push(req.user!.id);
  }

  if (year) { query += ` AND e.year = ?`; params.push(year); }
  if (month) { query += ` AND e.month = ?`; params.push(month); }
  query += ` ORDER BY e.year DESC, e.month DESC, e.nr ASC`;

  res.json(db.prepare(query).all(params));
});

// POST /api/expenses/extract — upload receipt and extract data with AI
router.post('/extract', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Ingen fil uppladdad' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.json({ extracted: null, filename: req.file.filename, error: 'AI-extraktion ej konfigurerad' });
    return;
  }

  try {
    const fileData = fs.readFileSync(req.file.path);
    const base64 = fileData.toString('base64');
    const mimeType = req.file.mimetype as any;
    const isPdf = mimeType === 'application/pdf';

    const client = new Anthropic({ apiKey });

    const fileContent: any = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          fileContent,
          {
            type: 'text',
            text: `Analysera detta kvitto och extrahera följande fält. Svara ENDAST med giltig JSON med exakt dessa nycklar:
- inkopsStalle: butik eller leverantörsnamn
- avser: kort beskrivning av inköpet på svenska
- belopp: totalt belopp som ett tal i SEK (konvertera om nödvändigt, null om okänt)
- annanValuta: originalbelopp och valuta om inte SEK, t.ex. "USD 45.00", annars null
- deltagare: namn på deltagare/medarbetare om nämnda, annars null

Returnera endast JSON, ingen förklaring.`,
          },
        ],
      }],
    });

    const text = (message.content[0] as any).text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Inget JSON i svaret');

    res.json({ extracted: JSON.parse(jsonMatch[0]), filename: req.file.filename });
  } catch (err: any) {
    res.json({ extracted: null, filename: req.file.filename, error: `Extraktion misslyckades: ${err.message}` });
  }
});

// POST /api/expenses
router.post('/', (req: Request, res: Response): void => {
  const { year, month, inkops_stalle, avser, belopp, annan_valuta, klar, deltagare, receipt_filename } = req.body;

  if (!year || !month) {
    res.status(400).json({ error: 'year och month krävs' });
    return;
  }

  const { c } = db.prepare(
    `SELECT COUNT(*) as c FROM expenses WHERE user_id = ? AND year = ? AND month = ?`
  ).get([req.user!.id, year, month]) as any;

  const result = db.prepare(`
    INSERT INTO expenses (user_id, year, month, nr, inkops_stalle, avser, belopp, annan_valuta, klar, deltagare, receipt_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    req.user!.id, year, month, c + 1,
    inkops_stalle || null, avser || null,
    belopp !== undefined && belopp !== '' ? Number(belopp) : null,
    annan_valuta || null,
    klar ? 1 : 0,
    deltagare || null,
    receipt_filename || null,
  ]);

  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get([result.lastInsertRowid]));
});

// PUT /api/expenses/:id
router.put('/:id', (req: Request, res: Response): void => {
  const expense = db.prepare(
    'SELECT * FROM expenses WHERE id = ? AND user_id = ?'
  ).get([req.params.id, req.user!.id]) as any;

  if (!expense) {
    res.status(404).json({ error: 'Utlägg hittades inte' });
    return;
  }

  const { inkops_stalle, avser, belopp, annan_valuta, klar, deltagare } = req.body;

  db.prepare(`
    UPDATE expenses SET inkops_stalle = ?, avser = ?, belopp = ?, annan_valuta = ?, klar = ?, deltagare = ?
    WHERE id = ?
  `).run([
    inkops_stalle !== undefined ? inkops_stalle : expense.inkops_stalle,
    avser !== undefined ? avser : expense.avser,
    belopp !== undefined && belopp !== '' ? Number(belopp) : expense.belopp,
    annan_valuta !== undefined ? annan_valuta : expense.annan_valuta,
    klar !== undefined ? (klar ? 1 : 0) : expense.klar,
    deltagare !== undefined ? deltagare : expense.deltagare,
    req.params.id,
  ]);

  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get([req.params.id]));
});

// DELETE /api/expenses/:id
router.delete('/:id', (req: Request, res: Response): void => {
  const isAdmin = req.user!.role === 'admin';
  const expense = db.prepare(
    isAdmin
      ? 'SELECT * FROM expenses WHERE id = ?'
      : 'SELECT * FROM expenses WHERE id = ? AND user_id = ?'
  ).get(isAdmin ? [req.params.id] : [req.params.id, req.user!.id]) as any;

  if (!expense) {
    res.status(404).json({ error: 'Utlägg hittades inte' });
    return;
  }

  if (expense.receipt_filename) {
    const filePath = path.join(uploadsDir, expense.receipt_filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run([req.params.id]);
  res.json({ message: 'Borttaget' });
});

// GET /api/expenses/export — download Excel report
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const { year, month, userId } = req.query;
  const isAdmin = req.user!.role === 'admin';

  let query = `SELECT e.*, u.name as employee_name, u.employee_number
               FROM expenses e JOIN users u ON e.user_id = u.id WHERE 1=1`;
  const params: any[] = [];

  if (!isAdmin) {
    query += ` AND e.user_id = ?`;
    params.push(req.user!.id);
  } else if (userId) {
    query += ` AND e.user_id = ?`;
    params.push(userId);
  }

  if (year)  { query += ` AND e.year = ?`;  params.push(year); }
  if (month) { query += ` AND e.month = ?`; params.push(month); }
  query += ` ORDER BY e.user_id, e.nr ASC`;

  const rows = db.prepare(query).all(params) as any[];

  const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni',
                     'Juli','Augusti','September','Oktober','November','December'];
  const periodLabel = (year && month)
    ? `${year} ${MONTHS_SV[Number(month) - 1]}`
    : year ? String(year) : 'Alla perioder';

  // Group by employee
  const byEmployee = new Map<number, { name: string; number: string; rows: any[] }>();
  for (const row of rows) {
    if (!byEmployee.has(row.user_id)) {
      byEmployee.set(row.user_id, { name: row.employee_name, number: row.employee_number, rows: [] });
    }
    byEmployee.get(row.user_id)!.rows.push(row);
  }

  // If no grouping (single employee) — put everything under one entry
  if (byEmployee.size === 0) {
    const fallbackName = isAdmin ? 'Alla anställda' : 'Mig';
    byEmployee.set(0, { name: fallbackName, number: '', rows });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kaellhammarone AB';

  for (const [, emp] of byEmployee) {
    const safeName = emp.name.replace(/[/\\?*[\]:]/g, '-').slice(0, 31);
    const ws = wb.addWorksheet(safeName);

    // Column widths
    ws.columns = [
      { key: 'A', width: 5 },
      { key: 'B', width: 6 },
      { key: 'C', width: 28 },
      { key: 'D', width: 30 },
      { key: 'E', width: 14 },
      { key: 'F', width: 16 },
      { key: 'G', width: 8 },
      { key: 'H', width: 28 },
    ];

    const titleStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 14 },
    };
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A9F' } },
      border: {
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      },
      alignment: { vertical: 'middle' },
    };

    // Row 1: Title
    ws.mergeCells('B1:H1');
    const titleCell = ws.getCell('B1');
    titleCell.value = 'KVITTOSAMMANSTÄLLNING';
    titleCell.style = titleStyle;

    // Row 2: Company
    ws.mergeCells('B2:H2');
    ws.getCell('B2').value = 'Kaellhammarone AB';
    ws.getCell('B2').font = { bold: true };

    // Row 3: Employee
    ws.getCell('B3').value = 'Namn:';
    ws.getCell('B3').font = { bold: true };
    ws.mergeCells('C3:E3');
    ws.getCell('C3').value = emp.name;

    // Row 4: Period
    ws.getCell('B4').value = 'Period:';
    ws.getCell('B4').font = { bold: true };
    ws.mergeCells('C4:E4');
    ws.getCell('C4').value = periodLabel;

    // Row 5: empty spacer
    ws.addRow([]);

    // Row 6: Table header (columns B–H)
    const headerRow = ws.addRow(['', 'Nr:', 'Inköpsställe', 'Avser:', 'Belopp:', 'Annan Valuta', 'Klar', 'Deltagare']);
    headerRow.height = 20;
    for (let c = 2; c <= 8; c++) {
      headerRow.getCell(c).style = headerStyle;
    }
    headerRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

    // Data rows
    let rowIndex = 1;
    for (const exp of emp.rows) {
      const dataRow = ws.addRow([
        '',
        exp.nr ?? rowIndex,
        exp.inkops_stalle || '',
        exp.avser || '',
        exp.belopp != null ? exp.belopp : '',
        exp.annan_valuta || '',
        exp.klar ? 'Ja' : '',
        exp.deltagare || '',
      ]);
      const bg = rowIndex % 2 === 0 ? 'FFF0F4F8' : 'FFFFFFFF';
      for (let c = 2; c <= 8; c++) {
        dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
      dataRow.getCell(5).numFmt = '#,##0.00';
      dataRow.getCell(5).alignment = { horizontal: 'right' };
      rowIndex++;
    }

    // Total row
    const firstDataRow = 7; // header at row 6, data starts at row 7
    const lastDataRow  = 6 + emp.rows.length;
    const totalRow = ws.addRow(['', '', '', 'Totalt:', { formula: `SUM(E${firstDataRow}:E${lastDataRow})` }, '', '', '']);
    totalRow.getCell(4).font = { bold: true };
    totalRow.getCell(4).alignment = { horizontal: 'right' };
    totalRow.getCell(5).numFmt = '#,##0.00';
    totalRow.getCell(5).alignment = { horizontal: 'right' };
    totalRow.getCell(5).font = { bold: true };
    for (let c = 2; c <= 8; c++) {
      totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    }
  }

  const monthPad = month ? String(month).padStart(2, '0') : 'XX';
  const filename = `Kvittosammanstallning-${year ?? 'alla'}-${monthPad}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/expenses/receipts-zip — download all receipts for a period as a ZIP
router.get('/receipts-zip', (req: Request, res: Response): void => {
  const { year, month, userId } = req.query;
  const isAdmin = req.user!.role === 'admin';

  const MONTHS_SV = ['Januari','Februari','Mars','April','Maj','Juni',
                     'Juli','Augusti','September','Oktober','November','December'];
  const folderName = (year && month)
    ? `Expenses ${MONTHS_SV[Number(month) - 1]} ${year}`
    : `Expenses`;

  let query = `SELECT e.*, u.name as employee_name
               FROM expenses e JOIN users u ON e.user_id = u.id
               WHERE e.receipt_filename IS NOT NULL AND e.receipt_filename != ''`;
  const params: any[] = [];

  if (!isAdmin) {
    query += ` AND e.user_id = ?`;
    params.push(req.user!.id);
  } else if (userId) {
    query += ` AND e.user_id = ?`;
    params.push(userId);
  }
  if (year)  { query += ` AND e.year = ?`;  params.push(year); }
  if (month) { query += ` AND e.month = ?`; params.push(month); }
  query += ` ORDER BY e.nr ASC`;

  const rows = db.prepare(query).all(params) as any[];
  const existing = rows.filter(r => fs.existsSync(path.join(uploadsDir, r.receipt_filename)));

  if (existing.length === 0) {
    res.status(404).json({ error: 'Inga kvittofiler hittades för perioden' });
    return;
  }

  const zipName = `${folderName.replace(/\s+/g, '-')}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const row of existing) {
    const ext = path.extname(row.receipt_filename);
    // Sanitise name: remove characters not allowed in filenames
    const storeName = (row.inkops_stalle || 'okänt').replace(/[/\\?*:"|<>]/g, '-').trim();
    const entryName = `${folderName}/${row.nr} - ${storeName}${ext}`;
    archive.file(path.join(uploadsDir, row.receipt_filename), { name: entryName });
  }

  archive.finalize();
});

// GET /api/expenses/receipt/:filename — serve uploaded file
router.get('/receipt/:filename', (req: Request, res: Response): void => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const expense = db.prepare(
    `SELECT e.* FROM expenses e WHERE e.receipt_filename = ?`
  ).get([filename]) as any;

  if (!expense) {
    res.status(404).json({ error: 'Fil hittades inte' });
    return;
  }

  // Only allow access to own receipts (or admin)
  if (req.user!.role !== 'admin' && expense.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Åtkomst nekad' });
    return;
  }

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Fil saknas på disk' });
    return;
  }

  res.sendFile(filePath);
});

export default router;
