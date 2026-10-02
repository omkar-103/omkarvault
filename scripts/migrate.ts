
import pg from 'pg';
import { readFileSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set in .env.local');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(path.join(__dirname, '../supabase/migrations/001_vault_files.sql'), 'utf-8');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  const client = await pool.connect();
  try {
    console.log('🚀 Running migration: 001_vault_files.sql');
    await client.query(migrationSql);
    console.log('✅ Migration complete! vault_files table is ready.');

    // Verify the table exists
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vault_files' 
      ORDER BY ordinal_position
    `);
    console.log(`\n📊 vault_files table columns (${result.rows.length}):`);
    result.rows.forEach(row => console.log(`  - ${row.column_name}: ${row.data_type}`));
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
