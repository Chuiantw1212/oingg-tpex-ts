import { saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { DatasetResult } from './types';
import { rocDateToISO } from '../adapters/tpex/parse';

interface IngestOptions<TRaw, TNormalized> {
  dataset: string;
  rawDatasetName?: string; // For datasets where the name in tpex_raw differs from the logical name
  fetcher: () => Promise<TRaw[]>;
  normalizer: (rawRows: TRaw[]) => TNormalized[];
  upserter: (normalizedRows: TNormalized[]) => Promise<number>;
  dateExtractor: (row: TRaw) => string;
  requestedDate?: string;
}

export async function handleDatasetIngestion<TRaw extends object, TNormalized>(
  options: IngestOptions<TRaw, TNormalized>
): Promise<DatasetResult> {
  const { dataset, rawDatasetName, fetcher, normalizer, upserter, dateExtractor, requestedDate } = options;
  const dbDatasetName = rawDatasetName || dataset;

  try {
    console.log(`[ingest] ${dataset}: Fetching data...`);
    const rawRows = await fetcher();
    console.log(`[ingest] ${dataset}: Fetched ${rawRows.length} records.`);

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return { dataset, rows: 0, ok: true };
    }

    const actualTradeDate = rocDateToISO(dateExtractor(rawRows[0]));
    const actualTradeDateISO = actualTradeDate.toISOString().slice(0, 10);

    if (requestedDate && actualTradeDateISO !== requestedDate) {
      console.warn(
        `[ingest] ${dataset}: requested ${requestedDate} but TPEx OpenAPI only serves today's data (got ${actualTradeDateISO}); historical dates cannot be re-fetched from this endpoint.`
      );
    }

    await saveRawResponse(dbDatasetName, actualTradeDate, rawRows);
    const normalized = normalizer(rawRows);
    const rowCount = await upserter(normalized);
    await deleteRawResponse(dbDatasetName, actualTradeDate);

    console.log(`[ingest] ${dataset}: Successfully processed and deleted raw data for ${actualTradeDateISO}.`);
    return { dataset, rows: rowCount, ok: true };
  } catch (error) {
    console.error(`[ingest] ${dataset} failed:`, error);
    return { dataset, rows: 0, ok: false, error: (error as Error).message };
  }
}
