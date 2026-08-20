import { Router, Request, Response } from 'ultimate-express';

const router = Router();

/**
 * @swagger
 * /healthz:
 *   get:
 *     summary: 健康檢查
 *     description: 檢查服務是否正常運行，不連線資料庫。
 *     responses:
 *       200:
 *         description: 服務正常。
 */
router.get('/healthz', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

export default router;
