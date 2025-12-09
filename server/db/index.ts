import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { schema, seedData } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/ledger.db');

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
const dataDir = join(__dirname, '../../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database
export function initDatabase() {
  console.log('Initializing database...');
  
  // Run schema
  db.exec(schema);
  console.log('Schema created.');
  
  // Run seed data
  db.exec(seedData);
  console.log('Seed data inserted.');
  
  console.log('Database initialized successfully!');
}

// Check if database needs initialization
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='users'
`).get();

if (!tableExists) {
  initDatabase();
}

export default db;

