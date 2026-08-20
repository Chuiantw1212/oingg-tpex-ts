import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestMainboardPeratioAnalysis } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/mainboard-peratio-analysis:
 *   post:
 *     summary: 觸發上櫃股票本益比、殖利率、股價淨值比抓取與儲存
 *     description: 對應 TPEx OpenAPI /tpex_mainboard_peratio_analysis，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
 *     security:
 *       - TaskSecret: []
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "MAINBOARD_PERATIO_ANALYSIS" }
 *                 rows: { type: number, example: 887 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/mainboard-peratio-analysis', requireTaskSecret, async (req: Request, res: Response) => {
  console.log('[ingest] Triggered for MAINBOARD_PERATIO_ANALYSIS...');
  const result = await ingestMainboardPeratioAnalysis();
  console.log(`[ingest] Finished MAINBOARD_PERATIO_ANALYSIS. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;
