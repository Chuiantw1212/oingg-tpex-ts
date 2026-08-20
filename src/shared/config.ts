import dotenv from 'dotenv';
import { timingSafeEqual } from 'crypto';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const config = {
  port: process.env.PORT || '3000',
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  taskSecret: process.env.TASK_SECRET,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // Function to safely compare task secrets.
  // 缺標頭時 inputSecret 是 undefined，Buffer.from(undefined) 會直接 throw；
  // 長度不同時 timingSafeEqual 本身也會 throw（它要求兩個 buffer 等長）。
  // 兩種情況都要在呼叫 timingSafeEqual 前擋掉，不然單一個沒帶標頭的請求就能把整個 process 打掛。
  compareTaskSecret: (inputSecret: string | undefined): boolean => {
    const expected = Buffer.from(config.taskSecret || '');
    const actual = Buffer.from(inputSecret || '');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  },
};
