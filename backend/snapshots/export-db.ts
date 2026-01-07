import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import * as path from 'path';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const url = new URL(dbUrl);
const host = url.hostname;
const port = url.port || '5432';
const database = url.pathname.slice(1);
const user = url.username;
const password = url.password;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = path.join(__dirname, `snapshot-${timestamp}.sql`);

try {
  execSync(`pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --data-only --inserts > "${filename}"`, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: password }
  });
  console.log('Exported to:', filename);
} catch (e) {
  console.error('Error:', e);
}
