import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: ["error"],
      datasources: {
        db: { url: process.env.DATABASE_URL ?? "file:./test.db" },
      },
    });
  }
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
