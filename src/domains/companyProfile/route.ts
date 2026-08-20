import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestCompanyProfile } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/company-profile:
 *   post:
 *     summary: 觸發上櫃公司基本資料 (COMPANY_PROFILE) 抓取與儲存
 *     description: 對應 TPEx OpenAPI /mopsfin_t187ap03_O，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
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
 *                 dataset: { type: string, example: "COMPANY_PROFILE" }
 *                 rows: { type: number, example: 890 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/company-profile', requireTaskSecret, async (req: Request, res: Response) => {
  console.log('[ingest] Triggered for COMPANY_PROFILE...');
  const result = await ingestCompanyProfile();
  console.log(`[ingest] Finished COMPANY_PROFILE. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;
