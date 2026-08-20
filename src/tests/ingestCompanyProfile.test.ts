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
import { ingestCompanyProfile, normalizeCompanyProfile } from '../domains/companyProfile';

const baseRow = {
  Date: '1150820',
  SecuritiesCompanyCode: '1240',
  CompanyName: '茂生農經股份有限公司',
  CompanyAbbreviation: '茂生農經',
  Registration: '－ ',
  SecuritiesIndustryCode: '33',
  Address: '2F.,No.30,Sec. 1,Heping W.Rd.,Zhongzheng Dist.,Taipei City 100028TAIPEI,TAIWAN(R.O.C)',
  'UnifiedBusinessNo.': '18795706',
  Chairman: '吳清德',
  GeneralManager: '吳清德',
  Spokesman: '林信鴻',
  TitleOfSpokesman: '公司治理主管',
  DeputySpokesperson: '邱紹齊',
  Telephone: '02-23671162',
  DateOfIncorporation: '19670218',
  DateOfListing: '20180808',
  ParValueOfCommonStock: '新台幣                 10.0000元',
  'Paidin.Capital.NTDollars': '442323730',
  'PrivateStock.shares': '0',
  'PreferredStock.shares': '0',
  PreparationOfFinancialReportType: '1',
  StockTransferAgent: '元大證券股份有限公司股務代理部',
  StockTransferAgentTelephone: '02-2586-5859',
  StockTransferAgentAddress: '106045台北市大安區敦化南路二段67號地下1樓',
  AccountingFirm: '勤業眾信聯合會計師事務所',
  'CPA.CharteredPublicAccountant.First': '陳重成',
  'CPA.CharteredPublicAccountant.Second': '洪偉倫',
  Symbol: 'MORNSUN',
  Fax: '02-23640694',
  EmailAddress: 'bedford@morn-sun.com.tw',
  WebAddress: 'https://www.morn-sun.com.tw/',
  IssueShares: '44232373',
};

describe('ingestCompanyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, normalizes, and upserts in one transaction per batch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [baseRow] });

    const result = await ingestCompanyProfile();

    expect(apiClient.get).toHaveBeenCalledWith('/mopsfin_t187ap03_O');
    expect(saveRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE', expect.any(Date), [baseRow]);
    expect(db.companyProfile.upsert).toHaveBeenCalledOnce();
    // Regression guard: batch upserts must not use Prisma's 5s default $transaction
    // timeout — Neon's pooled connection latency blows past it (see NEON.md).
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE', expect.any(Date));
    expect(result).toEqual({ dataset: 'COMPANY_PROFILE', rows: 1, ok: true });
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestCompanyProfile();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('COMPANY_PROFILE');
  });

  it('extracts par value regardless of currency prefix, ignoring no-par / not-applicable text', () => {
    const [ntd] = normalizeCompanyProfile([baseRow]);
    expect(ntd.parValue).toBe('10.0000');

    const [usd] = normalizeCompanyProfile([{ ...baseRow, ParValueOfCommonStock: '美金0.05元' }]);
    expect(usd.parValue).toBe('0.05');

    const [noPar] = normalizeCompanyProfile([{ ...baseRow, ParValueOfCommonStock: '無面額' }]);
    expect(noPar.parValue).toBeNull();
  });

  it('parses established/listed dates as Gregorian (not ROC) and report date as ROC', () => {
    const [row] = normalizeCompanyProfile([baseRow]);
    expect(row.reportDate.toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(row.establishedDate?.toISOString().slice(0, 10)).toBe('1967-02-18');
    expect(row.listedDate?.toISOString().slice(0, 10)).toBe('2018-08-08');
  });

  it('normalizes domestic placeholder and missing optional fields to null', () => {
    const [row] = normalizeCompanyProfile([{ ...baseRow, Registration: '－ ', IssueShares: '' }]);
    expect(row.foreignRegistrationCountry).toBeNull();
    expect(row.issuedShares).toBeNull();

    const [foreign] = normalizeCompanyProfile([{ ...baseRow, Registration: 'KY 開曼群島                    ' }]);
    expect(foreign.foreignRegistrationCountry).toBe('KY 開曼群島');
  });

  it('uses Address directly as the (already English) address, with no separate englishAddress field', () => {
    const [row] = normalizeCompanyProfile([baseRow]);
    expect(row.address).toBe(baseRow.Address);
  });
});
