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

const url = new URL(dbUrl);
const host = url.hostname;
const port = url.port || '5432';
const database = url.pathname.slice(1);
const user = url.username;
const password = url.password;

const env = { ...process.env, PGPASSWORD: password };

// Generate timestamp for filename
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const snapshotFile = path.join(__dirname, `snapshot-${timestamp}.sql`);

// Tables to export (same as reset script, excluding reference data like Need)
const tables = [
  'User',
  'Relationship',
  'RelationshipMember',
  'Session',
  'Invitation',
  'StageProgress',
  'Message',
  'PreSessionMessage',
  'SharedVessel',
  'UserVessel',
  'UserDocument',
  'UserEvent',
  'EmotionalReading',
  'IdentifiedNeed',
  'Boundary',
  'ConsentRecord',
  'ConsentedContent',
  'CommonGround',
  'EmotionalExerciseCompletion',
  'StrategyProposal',
  'Agreement',
  'StrategyRanking',
  'EmpathyDraft',
  'EmpathyAttempt',
  'EmpathyValidation',
  'ReconcilerResult',
  'ReconcilerShareOffer',
  'Notification',
  'UserMemory',
  'InnerWorkSession',
  'InnerWorkMessage',
  'MeditationPreferences',
  'MeditationFavorite',
  'MeditationStats',
  'MeditationSession',
  'GratitudePreferences',
  'GratitudeEntry',
  'NeedsAssessmentState',
  'NeedScore',
  'Person',
  'PersonMention',
  'GlobalLibraryItem',
];

console.log('\n=== Creating database snapshot ===\n');

// Build pg_dump command with --data-only and specific tables
// Table names need to be quoted for PostgreSQL case-sensitivity
const tableArgs = tables.map(t => `-t '"${t}"'`).join(' ');
const cmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --data-only ${tableArgs} > "${snapshotFile}"`;

try {
  execSync(cmd, { stdio: 'pipe', env, shell: '/bin/bash' });

  // Check file was created and has content
  const stats = fs.statSync(snapshotFile);
  console.log(`Snapshot created: ${path.basename(snapshotFile)}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`Path: ${snapshotFile}`);
} catch (e: any) {
  console.error('Error creating snapshot:', e.stderr?.toString() || e.message);
  process.exit(1);
}

console.log('\n=== Snapshot complete ===\n');
