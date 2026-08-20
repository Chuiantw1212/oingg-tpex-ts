import { Router } from 'ultimate-express';
import healthzRouter from './domains/system/route';
import ingestMainboardDailyCloseQuotesRouter from './domains/mainboardDailyCloseQuotes/route';
import ingestMainboardPeratioAnalysisRouter from './domains/mainboardPeratioAnalysis/route';
import ingestCompanyProfileRouter from './domains/companyProfile/route';
import ingestCompanyProfileEmergingRouter from './domains/companyProfileEmerging/route';
import rootRouter from './domains/system/root';

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);
router.use(healthzRouter);

// --- API Routes ---
const apiRouter = Router();
apiRouter.use(ingestMainboardDailyCloseQuotesRouter);
apiRouter.use(ingestMainboardPeratioAnalysisRouter);
apiRouter.use(ingestCompanyProfileRouter);
apiRouter.use(ingestCompanyProfileEmergingRouter);

router.use('/api/ingest', apiRouter);

export default router;
