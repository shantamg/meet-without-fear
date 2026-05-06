import { PrismaClient } from '@prisma/client';
import { withEncryption } from './prisma-encryption-middleware';

function createEncryptedClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
  return withEncryption(base);
}

type EncryptedPrismaClient = ReturnType<typeof createEncryptedClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: EncryptedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createEncryptedClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
