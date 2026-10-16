import { PrismaClient } from '@prisma/client';

import { env } from '../env.js';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = env.DATABASE_URL;
}

export const prisma = new PrismaClient();

