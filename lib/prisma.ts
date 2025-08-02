// lib/prisma.ts

import { PrismaClient } from "@prisma/client";

// This prevents TypeScript errors in development by declaring a global prisma object.
declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;