import { apiClient } from '../../adapters/tpex/client';
import { rocDateToISO, parseTpexNumber, getTaipeiTodayISO } from '../../adapters/tpex/parse';
import { db as prisma } from '../../adapters/db/index';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

// Based on TPEx OpenAPI spec for /tpex_mainboard_peratio_analysis
export interface MainboardPeratioAnalysisRow {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  PriceEarningRatio: string;
  DividendPerShare: string;
  YieldRatio: string;
  PriceBookRatio: string;
}

export interface NormalizedDailyValuation {
  symbol: string;
  tradeDate: Date;
  peRatio: string | null;
  pbRatio: string | null;
  dividendYield: string | null;
}

/**
 * 獲取「上櫃股票個股本益比、殖利率、股價淨值比」
 */
async function getMainboardPeratioAnalysis(): Promise<MainboardPeratioAnalysisRow[]> {
  try {
    const response = await apiClient.get<MainboardPeratioAnalysisRow[]>('/tpex_mainboard_peratio_analysis');
    return response.data;
  } catch (error) {
    console.error('Error fetching tpex_mainboard_peratio_analysis from TPEx OpenAPI:', error);
    throw new Error('Failed to fetch data from TPEx OpenAPI.');
  }
}

/**
 * DividendPerShare（每股股利）刻意不存：跟 close/dividendYield 有重疊資訊，且 TWSE 姊妹專案的
 * daily_valuation 沒有這個欄位，保持兩邊 schema 一致。
 */
export function normalizeMainboardPeratioAnalysis(rows: MainboardPeratioAnalysisRow[]): NormalizedDailyValuation[] {
  return rows.map((row) => ({
    symbol: row.SecuritiesCompanyCode,
    tradeDate: rocDateToISO(row.Date),
    peRatio: parseTpexNumber(row.PriceEarningRatio),
    pbRatio: parseTpexNumber(row.PriceBookRatio),
    dividendYield: parseTpexNumber(row.YieldRatio),
  }));
}

async function upsertDailyValuations(rows: NormalizedDailyValuation[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] MAINBOARD_PERATIO_ANALYSIS: Starting to upsert ${rows.length} valuation records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, tradeDate, ...updateData } = row;
      return prisma.dailyValuation.upsert({
        where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
        create: row,
        update: updateData,
      });
    });
    // Neon pooled connections can be slow enough (cold start, latency) that 100 sequential
    // upserts blow past Prisma's default 5s transaction timeout — see NEON.md.
    await prisma.$transaction(operations, { timeout: 30000 });
    totalUpserted += batch.length;
    console.log(`[ingest] MAINBOARD_PERATIO_ANALYSIS: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TPEx OpenAPI /tpex_mainboard_peratio_analysis：抓取、存 raw、正規化、upsert daily_valuation。
 * @param {string} [date] - TPEx API 不支援，此參數無效但保留以求介面一致。
 */
export async function ingestMainboardPeratioAnalysis(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'MAINBOARD_PERATIO_ANALYSIS',
    fetcher: getMainboardPeratioAnalysis,
    normalizer: normalizeMainboardPeratioAnalysis,
    upserter: upsertDailyValuations,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
