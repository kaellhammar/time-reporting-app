import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db';
import authRouter from './routes/auth';
import employeesRouter from './routes/employees';
import timeEntriesRouter from './routes/timeEntries';
import salarySlipsRouter from './routes/salarySlips';
import expensesRouter from './routes/expenses';
import reportsRouter from './routes/reports';

const app = express();

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://frontend-production-59c3.up.railway.app',
      'https://timeandexpense.kaellhammarone.com',
      process.env.FRONTEND_URL,
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/salary-slips', salarySlipsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/reports', reportsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

initDb();
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
