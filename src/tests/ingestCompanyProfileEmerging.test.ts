import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../adapters/tpex/client', () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock('../adapters/db/index', () => ({
  db: {
    companyProfile: { upsert: vi.fn().mockReturnValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  saveRawResponse: vi.fn().mockResolvedValue(undefined),
  deleteRawResponse: vi.fn().mockResolvedValue(undefined),
}));

import { apiClient } from '../adapters/tpex/client';
import { db, saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { ingestCompanyProfileEmerging } from '../domains/companyProfileEmerging';

// An emerging-board (R) company code — confirmed against live data that O (mainboard)
// and R (emerging) codes never overlap.
const emergingRow = {
  Date: '1150820',
  SecuritiesCompanyCode: '1260',
  CompanyName: '富味鄉食品股份有限公司',
  CompanyAbbreviation: '富味鄉',
  Registration: '－ ',
  SecuritiesIndustryCode: '02',
  Address: "11F., No. 102, Sec. 4, Civic Blvd., Da'an Dist.,Taipei City 106, Taiwan",
  'UnifiedBusinessNo.': '12467902',
  Chairman: '陳昶宏',
  GeneralManager: '陳昶宏',
  Spokesman: '陳淑紋',
  TitleOfSpokesman: '副總經理',
  DeputySpokesperson: '李芳怡',
  Telephone: '(02)2750-5667',
  DateOfIncorporation: '19831108',
  DateOfListing: '20121126',
  ParValueOfCommonStock: '新台幣                 10.0000元',
  'Paidin.Capital.NTDollars': '1020981820',
  'PrivateStock.shares': '0',
  'PreferredStock.shares': '0',
  PreparationOfFinancialReportType: '1',
  StockTransferAgent: '福邦證券股份有限公司',
  StockTransferAgentTelephone: '(02)2371-1658',
  StockTransferAgentAddress: '台北市中正區忠孝西路一段６號６樓',
  AccountingFirm: '資誠聯合會計師事務所',
  'CPA.CharteredPublicAccountant.First': '黃金連',
  'CPA.CharteredPublicAccountant.Second': '賴宗羲',
  Symbol: 'FLAVOR',
  Fax: '(02)2750-6777',
  EmailAddress: 'flavor@flavor.com.tw',
  WebAddress: 'www.flavor.com.tw',
  IssueShares: '102098182',
};

describe('ingestCompanyProfileEmerging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches from mopsfin_t187ap03_R and upserts into the shared company_profile table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [emergingRow] });

    const result = await ingestCompanyProfileEmerging();

    expect(apiClient.get).toHaveBeenCalledWith('/mopsfin_t187ap03_R');
    // Distinct dataset name from the mainboard ingest so tpex_raw bookkeeping
    // for the two sources never collides on the same (dataset, tradeDate) key.
    expect(saveRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE_EMERGING', expect.any(Date), [emergingRow]);
    expect(db.companyProfile.upsert).toHaveBeenCalledOnce();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE_EMERGING', expect.any(Date));
    expect(result).toEqual({ dataset: 'COMPANY_PROFILE_EMERGING', rows: 1, ok: true });
  });

  it('normalizes into the same shape as the mainboard company profile', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [emergingRow] });

    await ingestCompanyProfileEmerging();

    const upsertArg = vi.mocked(db.companyProfile.upsert).mock.calls[0][0] as any;
    expect(upsertArg.create.symbol).toBe('1260');
    expect(upsertArg.create.name).toBe('富味鄉食品股份有限公司');
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestCompanyProfileEmerging();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('COMPANY_PROFILE_EMERGING');
  });
});
