import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

async function globalSetup(_config: FullConfig) {
  console.log('\n🔧 E2E Global Setup Starting...');

  const backendDir = path.resolve(__dirname, '../backend');
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear_test';

  console.log('📌 Using database:', databaseUrl.replace(/:[^:@]+@/, ':***@'));

  // Tables ordered for CASCADE truncation (child tables that may have FK constraints)
  const TABLES_TO_TRUNCATE = [
    // Stage 4 / Strategy
    'StrategyRanking',
    'StrategyProposal',
    // Reconciler
    'ReconcilerShareOffer',
    'ReconcilerResult',
    // Empathy / Stage 2-3
    'EmpathyValidation',
    'EmpathyAttempt',
    'EmpathyDraft',
    'ValidationFeedbackDraft',
    // Messages
    'PreSessionMessage',
    'Message',
    // Consent
    'ConsentRecord',
    'ConsentedContent',
    // Session artifacts
    'CommonGround',
    'Agreement',
    'SharedVessel',
    'UserDocument',
    'Boundary',
    'IdentifiedNeed',
    'EmotionalReading',
    'UserEvent',
    'UserVessel',
    'StageProgress',
    // Inner Work
    'InnerWorkMessage',
    'InnerWorkSession',
    // Session
    'Session',
    'Invitation',
    // Relationship
    'RelationshipMember',
    'Relationship',
    // Needs Assessment
    'NeedScore',
    'NeedsAssessmentState',
    'Need',
    // People / Insights
    'PersonMention',
    'Person',
    'Insight',
    // Memory
    'UserMemory',
    // Meditation
    'MeditationSession',
    'MeditationStats',
    'MeditationFavorite',
    'MeditationPreferences',
    'SavedMeditation',
    'BrainActivity',
    // Gratitude
    'GratitudeEntry',
    'GratitudePreferences',
    // Exercises
    'EmotionalExerciseCompletion',
    'GlobalLibraryItem',
    // User (last, as many tables reference it)
    'User',
  ];

  // Create a temporary script to truncate tables
  const truncateScriptPath = path.join(backendDir, '.temp-truncate.js');
  const truncateScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TABLES_TO_TRUNCATE = ${JSON.stringify(TABLES_TO_TRUNCATE)};

async function truncateTables() {
  for (const table of TABLES_TO_TRUNCATE) {
    try {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "' + table + '" CASCADE');
      console.log('  ✓ Truncated ' + table);
    } catch (error) {
      // Table might not exist yet, that's ok
      console.log('  ⚠ Skipped ' + table + ': ' + error.message);
    }
  }
  await prisma.$disconnect();
}

truncateTables().catch(console.error);
`;

  // Truncate all tables
  console.log('🗑️  Truncating all tables...');
  try {
    fs.writeFileSync(truncateScriptPath, truncateScript);
    execSync(`node ${truncateScriptPath}`, {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch (error) {
    console.error("⚠️  Table truncation had issues (may be OK if tables don't exist yet)");
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(truncateScriptPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Run migrations to ensure schema is up to date
  console.log('\n📦 Running database migrations...');
  try {
    execSync('npx prisma migrate deploy', {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }

  console.log('\n✅ E2E Global Setup Complete!\n');
}

export default globalSetup;
