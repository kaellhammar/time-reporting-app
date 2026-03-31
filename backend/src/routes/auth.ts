import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get([email]) as any;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    secret,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employee_number: user.employee_number,
    },
  });
});

router.get('/me', authenticateToken, (req: Request, res: Response): void => {
  const user = db.prepare(
    'SELECT id, name, email, role, employee_number, address FROM users WHERE id = ?'
  ).get([req.user!.id]) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

export default router;

router.put('/update-credentials', authenticateToken, (req: Request, res: Response): void => {
  const { email, password } = req.body;
  if (!email && !password) {
    res.status(400).json({ error: 'Email or password required' });
    return;
  }
  if (password) {
    const hash = require('bcryptjs').hashSync(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run([hash, req.user!.id]);
  }
  if (email) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run([email, req.user!.id]);
  }
  res.json({ success: true });
});
