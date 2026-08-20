import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../adapters/tpex/client', () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock('../adapters/db/index', () => ({
  db: {
    dailyValuation: { upsert: vi.fn().mockReturnValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  saveRawResponse: vi.fn().mockResolvedValue(undefined),
  deleteRawResponse: vi.fn().mockResolvedValue(undefined),
}));

import { apiClient } from '../adapters/tpex/client';
import { db, saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { ingestMainboardPeratioAnalysis, normalizeMainboardPeratioAnalysis } from '../domains/mainboardPeratioAnalysis';

const mockApiData = [
  {
    Date: '1150820',
    SecuritiesCompanyCode: '1240',
    CompanyName: '茂生農經',
    PriceEarningRatio: '10.61',
    DividendPerShare: '0.50000000',
    YieldRatio: '0.88',
    PriceBookRatio: '1.68',
  },
];

describe('ingestMainboardPeratioAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, normalizes, and upserts in one transaction per batch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockApiData });

    const result = await ingestMainboardPeratioAnalysis();

    expect(apiClient.get).toHaveBeenCalledWith('/tpex_mainboard_peratio_analysis');
    expect(saveRawResponse).toHaveBeenCalledWith('MAINBOARD_PERATIO_ANALYSIS', expect.any(Date), mockApiData);
    expect(db.dailyValuation.upsert).toHaveBeenCalledOnce();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('MAINBOARD_PERATIO_ANALYSIS', expect.any(Date));
    expect(result).toEqual({ dataset: 'MAINBOARD_PERATIO_ANALYSIS', rows: 1, ok: true });
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestMainboardPeratioAnalysis();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('MAINBOARD_PERATIO_ANALYSIS');
  });

  it('treats "N/A" (a loss-making company with no P/E ratio) as null, distinct from a real 0.00 yield', () => {
    const [row] = normalizeMainboardPeratioAnalysis([
      { ...mockApiData[0], PriceEarningRatio: 'N/A', YieldRatio: '0.00' },
    ]);

    expect(row.symbol).toBe('1240');
    expect(row.tradeDate.toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(row.peRatio).toBeNull();
    expect(row.dividendYield).toBe('0.00');
    expect(row.pbRatio).toBe('1.68');
  });
});
