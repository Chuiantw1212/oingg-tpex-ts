import { apiClient } from '../../adapters/tpex/client';
import { getTaipeiTodayISO } from '../../adapters/tpex/parse';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';
import { CompanyProfileRow, normalizeCompanyProfile, upsertCompanyProfiles } from '../companyProfile';

/**
 * 興櫃公司基本資料（mopsfin_t187ap03_R）。跟上櫃公司基本資料（mopsfin_t187ap03_O, ../companyProfile）
 * 欄位結構完全一樣，但公司代號完全不重疊——興櫃是另一個交易市場層級，不是上櫃。兩邊都寫進同一張
 * company_profile（主鍵 symbol），互不覆蓋，純粹是同一份資料的兩個來源，所以直接沿用
 * companyProfile 的正規化/upsert 邏輯。
 */
async function getCompanyProfileEmerging(): Promise<CompanyProfileRow[]> {
  try {
    const response = await apiClient.get<CompanyProfileRow[]>('/mopsfin_t187ap03_R');
    return response.data;
  } catch (error) {
    console.error('Error fetching COMPANY_PROFILE_EMERGING (mopsfin_t187ap03_R) from TPEx OpenAPI:', error);
    throw new Error('Failed to fetch data from TPEx OpenAPI.');
  }
}

/**
 * 對應 TPEx OpenAPI /mopsfin_t187ap03_R：抓取、存 raw、正規化、upsert company_profile。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestCompanyProfileEmerging(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'COMPANY_PROFILE_EMERGING',
    fetcher: getCompanyProfileEmerging,
    normalizer: normalizeCompanyProfile,
    upserter: upsertCompanyProfiles,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
