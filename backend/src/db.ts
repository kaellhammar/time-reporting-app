import { Database } from 'node-sqlite3-wasm';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve('./database.sqlite');

// Remove stale lock directory left by crashed/killed processes
const lockPath = `${dbPath}.lock`;
if (fs.existsSync(lockPath)) {
  fs.rmdirSync(lockPath);
  console.log('Removed stale database lock');
}

const db = new Database(dbPath);

db.exec('PRAGMA foreign_keys = ON');

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','employee')),
      employee_number TEXT UNIQUE,
      address TEXT,
      hourly_rate REAL DEFAULT 0,
      tax_table INTEGER DEFAULT 31,
      tax_rate REAL DEFAULT 0.30,
      employment_type TEXT DEFAULT 'hourly' CHECK(employment_type IN ('monthly','hourly')),
      health_insurance_benefit REAL DEFAULT 0,
      car_deduction REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      hours REAL NOT NULL DEFAULT 0,
      submitted_at TEXT,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved')),
      UNIQUE(user_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS salary_slips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      generated_at TEXT DEFAULT (datetime('now')),
      payment_date TEXT,
      hours REAL DEFAULT 0,
      gross_salary REAL DEFAULT 0,
      holiday_compensation REAL DEFAULT 0,
      total_brutto REAL DEFAULT 0,
      health_insurance_benefit REAL DEFAULT 0,
      car_deduction REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_table INTEGER DEFAULT 31,
      employer_avgift REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      ytd_gross REAL DEFAULT 0,
      ytd_tax REAL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      nr INTEGER NOT NULL,
      inkops_stalle TEXT,
      avser TEXT,
      belopp REAL,
      annan_valuta TEXT,
      klar INTEGER DEFAULT 0,
      deltagare TEXT,
      receipt_filename TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for columns added after initial schema
  try { db.exec('ALTER TABLE users ADD COLUMN personnummer TEXT'); } catch (_) { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN monthly_salary REAL DEFAULT 0'); } catch (_) { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN tabellskatt_rate REAL DEFAULT 0.25'); } catch (_) { /* already exists */ }
  try { db.exec('ALTER TABLE salary_slips ADD COLUMN ytd_health_insurance REAL DEFAULT 0'); } catch (_) { /* already exists */ }

  // Seed default admin if none exists
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 12);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, employee_number)
      VALUES (?, ?, ?, 'admin', 'ADM001')
    `).run(['Admin', 'admin@kaellhammarone.se', hash]);
    console.log('Seeded default admin: admin@kaellhammarone.se / admin123');
  }
}

export default db;
