import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestMainboardDailyCloseQuotes } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/mainboard-daily-close-quotes:
 *   post:
 *     summary: 觸發上櫃股票行情抓取與儲存
 *     description: 對應 TPEx OpenAPI /tpex_mainboard_daily_close_quotes，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
 *     security:
 *       - TaskSecret: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。實際仍取決於 TPEx OpenAPI 只回傳今天的資料。
 *                 example: "2026-08-20"
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "MAINBOARD_DAILY_CLOSE_QUOTES" }
 *                 rows: { type: number, example: 800 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/mainboard-daily-close-quotes', requireTaskSecret, async (req: Request, res: Response) => {
  const date = req.body?.date;
  console.log(`[ingest] Triggered for MAINBOARD_DAILY_CLOSE_QUOTES for date: ${date || 'today'}...`);
  const result = await ingestMainboardDailyCloseQuotes(date);
  console.log(`[ingest] Finished MAINBOARD_DAILY_CLOSE_QUOTES. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;
