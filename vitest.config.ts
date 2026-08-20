import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 這會讓 `describe`, `it`, `expect` 等 API 成為全域變數，
    // 您就不需要在每個測試檔案中手動 import。
    globals: true,
  },
});
