import { Router, Request, Response } from 'express';
import db from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// GET /api/time-entries?year=&month=
router.get('/', (req: Request, res: Response): void => {
  const { year, month } = req.query;

  let query: string;
  let params: any[];

  if (req.user!.role === 'admin') {
    query = `
      SELECT te.*, u.name as employee_name, u.employee_number, u.hourly_rate,
             u.monthly_salary, u.employment_type
      FROM time_entries te
      JOIN users u ON te.user_id = u.id
      WHERE 1=1
      ${year ? 'AND te.year = ?' : ''}
      ${month ? 'AND te.month = ?' : ''}
      ORDER BY te.year DESC, te.month DESC, u.employee_number
    `;
    params = [...(year ? [year] : []), ...(month ? [month] : [])];
  } else {
    query = `
      SELECT te.*, u.name as employee_name, u.employee_number, u.hourly_rate,
             u.monthly_salary, u.employment_type
      FROM time_entries te
      JOIN users u ON te.user_id = u.id
      WHERE te.user_id = ?
      ${year ? 'AND te.year = ?' : ''}
      ${month ? 'AND te.month = ?' : ''}
      ORDER BY te.year DESC, te.month DESC
    `;
    params = [req.user!.id, ...(year ? [year] : []), ...(month ? [month] : [])];
  }

  const entries = db.prepare(query).all(params.length === 1 ? params[0] : params);
  res.json(entries);
});

// GET /api/time-entries/user/:userId (admin only)
router.get('/user/:userId', requireAdmin, (req: Request, res: Response): void => {
  const entries = db.prepare(`
    SELECT te.*, u.name as employee_name, u.employee_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.user_id = ?
    ORDER BY te.year DESC, te.month DESC
  `).all([req.params.userId]);
  res.json(entries);
});

// POST /api/time-entries — upsert draft
router.post('/', (req: Request, res: Response): void => {
  const { year, month, hours } = req.body;
  const userId = req.user!.id;

  if (!year || !month || hours === undefined) {
    res.status(400).json({ error: 'year, month and hours are required' });
    return;
  }

  // Check if already approved
  const existing = db.prepare(
    'SELECT * FROM time_entries WHERE user_id = ? AND year = ? AND month = ?'
  ).get([userId, year, month]) as any;

  if (existing && existing.status === 'approved') {
    res.status(409).json({ error: 'This entry has already been approved and cannot be modified' });
    return;
  }

  db.prepare(`
    INSERT INTO time_entries (user_id, year, month, hours, status)
    VALUES (?, ?, ?, ?, 'draft')
    ON CONFLICT(user_id, year, month)
    DO UPDATE SET hours = excluded.hours, status = CASE WHEN status = 'submitted' THEN 'draft' ELSE status END
  `).run([userId, year, month, hours]);

  const entry = db.prepare(
    'SELECT * FROM time_entries WHERE user_id = ? AND year = ? AND month = ?'
  ).get([userId, year, month]);

  res.json(entry);
});

// POST /api/time-entries/:id/submit
router.post('/:id/submit', (req: Request, res: Response): void => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get([req.params.id]) as any;

  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  if (req.user!.role !== 'admin' && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (entry.status === 'approved') {
    res.status(409).json({ error: 'Entry already approved' });
    return;
  }

  db.prepare(
    "UPDATE time_entries SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?"
  ).run([req.params.id]);

  const updated = db.prepare('SELECT * FROM time_entries WHERE id = ?').get([req.params.id]);
  res.json(updated);
});

// POST /api/time-entries/:id/approve (admin only)
router.post('/:id/approve', requireAdmin, (req: Request, res: Response): void => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get([req.params.id]) as any;

  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  db.prepare(
    "UPDATE time_entries SET status = 'approved', approved_at = datetime('now') WHERE id = ?"
  ).run([req.params.id]);

  const updated = db.prepare('SELECT * FROM time_entries WHERE id = ?').get([req.params.id]);
  res.json(updated);
});

export default router;
