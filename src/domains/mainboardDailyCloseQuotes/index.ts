import { apiClient } from '../../adapters/tpex/client';
import { rocDateToISO, parseTpexNumber, parseTpexBigInt, getTaipeiTodayISO } from '../../adapters/tpex/parse';
import { db as prisma } from '../../adapters/db/index';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

// Based on TPEx OpenAPI spec for /tpex_mainboard_daily_close_quotes
export interface MainboardDailyCloseQuoteRow {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
  Change: string;
  Open: string;
  High: string;
  Low: string;
  Average: string;
  TradingShares: string;
  TransactionAmount: string;
  TransactionNumber: string;
  LatestBidPrice: string;
  LatesAskPrice: string;
  Capitals: string;
  NextReferencePrice: string;
  NextLimitUp: string;
  NextLimitDown: string;
}

export interface NormalizedDailyPrice {
  symbol: string;
  tradeDate: Date;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: bigint | null;
  turnover: bigint | null;
  transaction: bigint | null;
}

/**
 * 獲取「上櫃股票行情」
 * @returns {Promise<MainboardDailyCloseQuoteRow[]>} 來自 TPEx OpenAPI 的原始資料
 */
export async function getMainboardDailyCloseQuotes(): Promise<MainboardDailyCloseQuoteRow[]> {
  try {
    const response = await apiClient.get<MainboardDailyCloseQuoteRow[]>('/tpex_mainboard_daily_close_quotes');
    return response.data;
  } catch (error) {
    console.error('Error fetching tpex_mainboard_daily_close_quotes from TPEx OpenAPI:', error);
    throw new Error('Failed to fetch data from TPEx OpenAPI.');
  }
}

/**
 * Change（漲跌價差）刻意不存：能從前後兩天存好的 close 算出來，不屬於「抓不到就永久消失」的資料（見 README）。
 * Average/LatestBidPrice/LatesAskPrice/Capitals/NextReferencePrice/NextLimitUp/NextLimitDown 也刻意不存，
 * 跟 TWSE 姊妹專案的 daily_price 欄位保持一致，需要的話之後再擴充 schema。
 */
export function normalizeMainboardDailyCloseQuotes(rows: MainboardDailyCloseQuoteRow[]): NormalizedDailyPrice[] {
  return rows.map((row) => ({
    symbol: row.SecuritiesCompanyCode,
    tradeDate: rocDateToISO(row.Date),
    open: parseTpexNumber(row.Open),
    high: parseTpexNumber(row.High),
    low: parseTpexNumber(row.Low),
    close: parseTpexNumber(row.Close),
    volume: parseTpexBigInt(row.TradingShares),
    turnover: parseTpexBigInt(row.TransactionAmount),
    transaction: parseTpexBigInt(row.TransactionNumber),
  }));
}

/**
 * upsert daily_price。複合主鍵 (symbol, tradeDate) 讓重複觸發、補抓都安全。
 */
export async function upsertDailyPrices(rows: NormalizedDailyPrice[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] MAINBOARD_DAILY_CLOSE_QUOTES: Starting to upsert ${rows.length} price records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, tradeDate, ...updateData } = row;
      return prisma.dailyPrice.upsert({
        where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
        create: row,
        update: updateData,
      });
    });
    // Neon pooled connections can be slow enough (cold start, latency) that 100 sequential
    // upserts blow past Prisma's default 5s transaction timeout — see NEON.md.
    await prisma.$transaction(operations, { timeout: 30000 });
    totalUpserted += batch.length;
    console.log(`[ingest] MAINBOARD_DAILY_CLOSE_QUOTES: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TPEx OpenAPI /tpex_mainboard_daily_close_quotes：抓取、存 raw、正規化、upsert daily_price。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestMainboardDailyCloseQuotes(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'MAINBOARD_DAILY_CLOSE_QUOTES',
    fetcher: getMainboardDailyCloseQuotes,
    normalizer: normalizeMainboardDailyCloseQuotes,
    upserter: upsertDailyPrices,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
