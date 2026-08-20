import { Router, Request, Response } from 'ultimate-express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.send('TPEx Data Sync Service is running.');
});

export default router;
