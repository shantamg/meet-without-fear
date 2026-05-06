import { PrismaClient } from '@prisma/client';
import { withEncryption } from './prisma-encryption-middleware';

function createEncryptedClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
  // Cast back to PrismaClient so all existing $transaction call sites
  // continue to type-check correctly. The $extends middleware is still
  // active at runtime — this is a type-only cast.
  return withEncryption(base) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createEncryptedClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
