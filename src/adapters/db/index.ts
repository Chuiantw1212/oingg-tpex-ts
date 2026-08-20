import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Pooled connection — see NEON.md for why this differs from the DIRECT_URL
// used by `prisma migrate` (configured separately in prisma.config.ts).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prismaClient = new PrismaClient({ adapter });

// Export the client as a named export `db` for consistent usage across the app.
export const db = prismaClient;

export async function connectDb(): Promise<void> {
  await db.$connect();
  console.log('Database connected successfully.');
}

/**
 * 存下 TPEx 原始回應，正規化失敗時才有機會重跑（見 README「⚠️ 最重要的限制」）。
 * 跟任何一個 dataset 無關（每個 dataset 呼叫時自己帶 dataset 名稱），所以留在這裡而不是 domains/ 底下。
 */
export async function saveRawResponse(dataset: string, tradeDate: Date, payload: unknown): Promise<void> {
  await db.tpexRaw.upsert({
    where: { dataset_tradeDate: { dataset, tradeDate } },
    create: { dataset, tradeDate, payload: payload as Prisma.InputJsonValue },
    update: { payload: payload as Prisma.InputJsonValue, fetchedAt: new Date() },
  });
}

/**
 * 正規化、寫入成功後，刪除 `tpex_raw` 裡的原始回應以節省空間。
 */
export async function deleteRawResponse(dataset: string, tradeDate: Date): Promise<void> {
  await db.tpexRaw.deleteMany({
    where: { dataset, tradeDate },
  });
}
