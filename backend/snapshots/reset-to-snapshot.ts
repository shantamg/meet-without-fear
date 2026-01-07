import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

// Get snapshot file from command line arg or find the most recent one
let snapshotFile = process.argv[2];

if (!snapshotFile) {
  // Find the most recent snapshot
  const snapshotsDir = __dirname;
  const files = fs.readdirSync(snapshotsDir)
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.sql'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No snapshot files found in', snapshotsDir);
    process.exit(1);
  }

  snapshotFile = path.join(snapshotsDir, files[0]);
  console.log('Using most recent snapshot:', files[0]);
} else if (!path.isAbsolute(snapshotFile)) {
  snapshotFile = path.join(__dirname, snapshotFile);
}

if (!fs.existsSync(snapshotFile)) {
  console.error('Snapshot file not found:', snapshotFile);
  process.exit(1);
}

const url = new URL(dbUrl);
const host = url.hostname;
const port = url.port || '5432';
const database = url.pathname.slice(1);
const user = url.username;
const password = url.password;

const env = { ...process.env, PGPASSWORD: password };

// Tables to truncate (in order to respect foreign key constraints)
const tables = [
  // Dependent tables first
  'PersonMention',
  'Person',
  'NeedScore',
  'NeedsAssessmentState',
  'GratitudeEntry',
  'GratitudePreferences',
  'MeditationSession',
  'MeditationStats',
  'MeditationFavorite',
  'MeditationPreferences',
  'InnerWorkMessage',
  'InnerWorkSession',
  'UserMemory',
  'Notification',
  'ReconcilerShareOffer',
  'ReconcilerResult',
  'EmpathyValidation',
  'EmpathyAttempt',
  'EmpathyDraft',
  'StrategyRanking',
  'Agreement',
  'StrategyProposal',
  'EmotionalExerciseCompletion',
  'CommonGround',
  'ConsentedContent',
  'ConsentRecord',
  'Boundary',
  'IdentifiedNeed',
  'EmotionalReading',
  'UserEvent',
  'UserDocument',
  'UserVessel',
  'SharedVessel',
  'PreSessionMessage',
  'Message',
  'StageProgress',
  'Invitation',
  'Session',
  'RelationshipMember',
  'Relationship',
  'GlobalLibraryItem',
  'User',
  // Don't truncate Need - it's seeded reference data
];

console.log('\n=== Resetting database to snapshot ===\n');

// Step 1: Truncate all tables
console.log('Step 1: Truncating tables...');
// Use a single TRUNCATE with all tables listed (more efficient and handles FK)
const tableList = tables.map(t => `"${t}"`).join(', ');
const truncateSQL = `TRUNCATE TABLE ${tableList} CASCADE;`;
try {
  execSync(`psql -h ${host} -p ${port} -U ${user} -d ${database} -c '${truncateSQL}'`, {
    stdio: 'pipe',
    env
  });
  console.log('  Truncated', tables.length, 'tables');
} catch (e: any) {
  console.error('  Error truncating tables:', e.stderr?.toString() || e.message);
  process.exit(1);
}

// Step 2: Load snapshot
console.log('Step 2: Loading snapshot...');
try {
  execSync(`psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${snapshotFile}"`, {
    stdio: 'pipe',
    env
  });
  console.log('  Loaded snapshot:', path.basename(snapshotFile));
} catch (e: any) {
  // psql returns non-zero even on some warnings, check if it's a real error
  const stderr = e.stderr?.toString() || '';
  if (stderr.includes('ERROR')) {
    console.error('  Error loading snapshot:', stderr);
    process.exit(1);
  }
  console.log('  Loaded snapshot (with warnings):', path.basename(snapshotFile));
}

console.log('\n=== Reset complete ===\n');
