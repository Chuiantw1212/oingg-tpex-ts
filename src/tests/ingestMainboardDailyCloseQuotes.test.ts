import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../adapters/tpex/client', () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock('../adapters/db/index', () => ({
  db: {
    dailyPrice: { upsert: vi.fn().mockReturnValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  saveRawResponse: vi.fn().mockResolvedValue(undefined),
  deleteRawResponse: vi.fn().mockResolvedValue(undefined),
}));

import { apiClient } from '../adapters/tpex/client';
import { db, saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { ingestMainboardDailyCloseQuotes, normalizeMainboardDailyCloseQuotes } from '../domains/mainboardDailyCloseQuotes';

const mockApiData = [
  {
    Date: '1150820',
    SecuritiesCompanyCode: '006201',
    CompanyName: '元大富櫃50',
    Close: '43.12',
    Change: '+0.94',
    Open: '43.31',
    High: '43.31',
    Low: '42.20',
    Average: '42.73',
    TradingShares: '208419',
    TransactionAmount: '8905299',
    TransactionNumber: '235',
    LatestBidPrice: '43.12',
    LatesAskPrice: '43.27',
    Capitals: '22946000',
    NextReferencePrice: '43.12',
    NextLimitUp: '47.43',
    NextLimitDown: '38.81',
  },
];

describe('ingestMainboardDailyCloseQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, normalizes, and upserts in one transaction per batch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockApiData });

    const result = await ingestMainboardDailyCloseQuotes();

    expect(apiClient.get).toHaveBeenCalledWith('/tpex_mainboard_daily_close_quotes');
    expect(saveRawResponse).toHaveBeenCalledWith('MAINBOARD_DAILY_CLOSE_QUOTES', expect.any(Date), mockApiData);
    expect(db.dailyPrice.upsert).toHaveBeenCalledOnce();
    // Regression guard: batch upserts must not use Prisma's 5s default $transaction
    // timeout — Neon's pooled connection latency blows past it (see NEON.md).
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('MAINBOARD_DAILY_CLOSE_QUOTES', expect.any(Date));
    expect(result).toEqual({ dataset: 'MAINBOARD_DAILY_CLOSE_QUOTES', rows: 1, ok: true });
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestMainboardDailyCloseQuotes();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('MAINBOARD_DAILY_CLOSE_QUOTES');
  });

  it('normalizes TPEx strings into typed rows, stripping a leading "+" and treating "---" as null', () => {
    const [row] = normalizeMainboardDailyCloseQuotes([
      { ...mockApiData[0], Open: ' ---', TradingShares: 'N/A' },
    ]);

    expect(row.symbol).toBe('006201');
    expect(row.tradeDate.toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(row.open).toBeNull();
    expect(row.volume).toBeNull();
    expect(row.close).toBe('43.12');
  });
});
