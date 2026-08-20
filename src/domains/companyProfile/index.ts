import { apiClient } from '../../adapters/tpex/client';
import { rocDateToISO, gregorianDateToISO, parseTpexBigInt, getTaipeiTodayISO } from '../../adapters/tpex/parse';
import { db as prisma } from '../../adapters/db/index';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

// Based on TPEx OpenAPI spec for /mopsfin_t187ap03_O
// 注意：TPEx 的欄位本來就是英文命名（不像 TWSE 姊妹專案的 t187ap03_L 用中文 key），不需要中文欄位對照。
export interface CompanyProfileRow {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  CompanyAbbreviation: string;
  Registration: string;
  SecuritiesIndustryCode: string;
  Address: string;
  'UnifiedBusinessNo.': string;
  Chairman: string;
  GeneralManager: string;
  Spokesman: string;
  TitleOfSpokesman: string;
  DeputySpokesperson: string;
  Telephone: string;
  DateOfIncorporation: string;
  DateOfListing: string;
  ParValueOfCommonStock: string;
  'Paidin.Capital.NTDollars': string;
  'PrivateStock.shares': string;
  'PreferredStock.shares': string;
  PreparationOfFinancialReportType: string;
  StockTransferAgent: string;
  StockTransferAgentTelephone: string;
  StockTransferAgentAddress: string;
  AccountingFirm: string;
  'CPA.CharteredPublicAccountant.First': string;
  'CPA.CharteredPublicAccountant.Second': string;
  Symbol: string;
  Fax: string;
  EmailAddress: string;
  WebAddress: string;
  IssueShares: string;
}

export interface NormalizedCompanyProfile {
  symbol: string;
  reportDate: Date;
  name: string;
  shortName: string;
  foreignRegistrationCountry: string | null;
  industry: string;
  address: string;
  taxId: string;
  chairman: string;
  generalManager: string;
  spokesperson: string;
  spokespersonTitle: string;
  deputySpokesperson: string | null;
  phone: string;
  establishedDate: Date | null;
  listedDate: Date | null;
  parValue: string | null;
  paidInCapital: bigint | null;
  privatePlacementShares: bigint | null;
  preferredStockShares: bigint | null;
  financialReportType: string;
  stockTransferAgency: string;
  transferAgencyPhone: string;
  transferAgencyAddress: string;
  auditingFirm: string;
  auditor1: string;
  auditor2: string | null;
  englishShortName: string;
  faxNumber: string | null;
  email: string | null;
  website: string | null;
  issuedShares: bigint | null;
}

/**
 * 必填文字欄位：trim，缺值時回傳空字串（schema 裡這些欄位是 NOT NULL）。
 */
function requiredText(value: string | null | undefined): string {
  return value ? value.trim() : '';
}

/**
 * 選填文字欄位：trim 後把空字串跟「－」這類佔位符號轉成 null（例如本國公司的「外國企業註冊地國」）。
 */
function nullableText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^[－\-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 「普通股每股面額」格式是「新台幣          10.0000元」/「美金0.05元」/「無面額」/「不適用」，
 * 不管幣別前綴（也不管少數記錄編碼壞掉的情況），只取數字部分；抓不到數字就回傳 null。
 */
function parseParValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  return match ? match[0] : null;
}

/**
 * 獲取「上櫃股票基本資料」
 */
async function getCompanyProfile(): Promise<CompanyProfileRow[]> {
  try {
    const response = await apiClient.get<CompanyProfileRow[]>('/mopsfin_t187ap03_O');
    return response.data;
  } catch (error) {
    console.error('Error fetching COMPANY_PROFILE (mopsfin_t187ap03_O) from TPEx OpenAPI:', error);
    throw new Error('Failed to fetch data from TPEx OpenAPI.');
  }
}

/**
 * 快照式資料，不是時間序列——重抓就整列覆蓋，不像 daily_price/daily_valuation 那樣按日期累積。
 * TPEx 的 Address 欄位本身就是英文地址（不像 TWSE 姊妹專案的 t187ap03_L 另外給中文「住址」跟
 * 英文「英文通訊地址」兩份），所以這裡只有一個 address 欄位，不需要 englishAddress。
 */
export function normalizeCompanyProfile(rows: CompanyProfileRow[]): NormalizedCompanyProfile[] {
  return rows.map((row) => ({
    symbol: row.SecuritiesCompanyCode,
    reportDate: rocDateToISO(row.Date),
    name: requiredText(row.CompanyName),
    shortName: requiredText(row.CompanyAbbreviation),
    foreignRegistrationCountry: nullableText(row.Registration),
    industry: requiredText(row.SecuritiesIndustryCode),
    address: requiredText(row.Address),
    taxId: requiredText(row['UnifiedBusinessNo.']),
    chairman: requiredText(row.Chairman),
    generalManager: requiredText(row.GeneralManager),
    spokesperson: requiredText(row.Spokesman),
    spokespersonTitle: requiredText(row.TitleOfSpokesman),
    deputySpokesperson: nullableText(row.DeputySpokesperson),
    phone: requiredText(row.Telephone),
    // 成立日期/上市日期是西元年 8 碼，跟出表日期（民國年）不同格式，見 gregorianDateToISO 註解。
    establishedDate: gregorianDateToISO(row.DateOfIncorporation),
    listedDate: gregorianDateToISO(row.DateOfListing),
    parValue: parseParValue(row.ParValueOfCommonStock),
    paidInCapital: parseTpexBigInt(row['Paidin.Capital.NTDollars']),
    privatePlacementShares: parseTpexBigInt(row['PrivateStock.shares']),
    preferredStockShares: parseTpexBigInt(row['PreferredStock.shares']),
    financialReportType: requiredText(row.PreparationOfFinancialReportType),
    stockTransferAgency: requiredText(row.StockTransferAgent),
    transferAgencyPhone: requiredText(row.StockTransferAgentTelephone),
    transferAgencyAddress: requiredText(row.StockTransferAgentAddress),
    auditingFirm: requiredText(row.AccountingFirm),
    auditor1: requiredText(row['CPA.CharteredPublicAccountant.First']),
    auditor2: nullableText(row['CPA.CharteredPublicAccountant.Second']),
    englishShortName: requiredText(row.Symbol),
    faxNumber: nullableText(row.Fax),
    email: nullableText(row.EmailAddress),
    website: nullableText(row.WebAddress),
    issuedShares: parseTpexBigInt(row.IssueShares),
  }));
}

/**
 * upsert company_profile。單一 symbol 為主鍵（不是時間序列），重抓就整列覆蓋成最新狀態。
 */
export async function upsertCompanyProfiles(rows: NormalizedCompanyProfile[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] COMPANY_PROFILE: Starting to upsert ${rows.length} company profile records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, ...updateData } = row;
      return prisma.companyProfile.upsert({
        where: { symbol: row.symbol },
        create: row,
        update: updateData,
      });
    });
    // Neon pooled connections can be slow enough (cold start, latency) that 100 sequential
    // upserts blow past Prisma's default 5s transaction timeout — see NEON.md.
    await prisma.$transaction(operations, { timeout: 30000 });
    totalUpserted += batch.length;
    console.log(`[ingest] COMPANY_PROFILE: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TPEx OpenAPI /mopsfin_t187ap03_O：抓取、存 raw、正規化、upsert company_profile。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestCompanyProfile(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'COMPANY_PROFILE',
    fetcher: getCompanyProfile,
    normalizer: normalizeCompanyProfile,
    upserter: upsertCompanyProfiles,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
