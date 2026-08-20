import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestCompanyProfileEmerging } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/company-profile-emerging:
 *   post:
 *     summary: 觸發興櫃公司基本資料 (COMPANY_PROFILE_EMERGING) 抓取與儲存
 *     description: 對應 TPEx OpenAPI /mopsfin_t187ap03_R，寫入跟上櫃公司基本資料相同的 company_profile 表——兩邊公司代號不重疊，興櫃是另一個交易市場層級。跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
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
 *                 dataset: { type: string, example: "COMPANY_PROFILE_EMERGING" }
 *                 rows: { type: number, example: 361 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/company-profile-emerging', requireTaskSecret, async (req: Request, res: Response) => {
  console.log('[ingest] Triggered for COMPANY_PROFILE_EMERGING...');
  const result = await ingestCompanyProfileEmerging();
  console.log(`[ingest] Finished COMPANY_PROFILE_EMERGING. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;
