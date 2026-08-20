import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// CLI-only config (generate / migrate / studio). Runtime PrismaClient in
// src/adapters/db/index.ts sets up its own adapter with DATABASE_URL — see NEON.md
// for why migrate needs the direct (non-pooled) connection instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
