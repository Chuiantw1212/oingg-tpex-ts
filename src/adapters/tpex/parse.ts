/**
 * 民國年日期字串轉為 UTC 午夜的 Date（前三碼 + 1911）。
 * 用 Date.UTC 建構，避免存進 Postgres @db.Date 欄位時因時區被 Prisma 序列化成前一天。
 */
export function rocDateToISO(rocDate: string): Date {
  const year = Number(rocDate.slice(0, 3)) + 1911;
  const month = Number(rocDate.slice(3, 5));
  const day = Number(rocDate.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 清理 TPEx 回傳的數值字串。跟 TWSE 不同，TPEx 的佔位符號是 "N/A"、"---"（而非 "--"），
 * 數字本身也不帶千分位逗號，但仍保留去逗號邏輯以防個別欄位例外。
 * 前綴 "+" 也會被拿掉（例如 "+0.94"），避免直接餵進 Prisma Decimal 時格式不一致。
 */
export function parseTpexNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'N/A' || /^-+$/.test(trimmed)) return null;
  if (/^[+xX]$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, '').replace(/^\+/, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null;
  return cleaned;
}

/**
 * 跟 parseTpexNumber 一樣的清理規則，但轉成 bigint——Prisma 的 BigInt 欄位（volume/turnover/transaction
 * 這類整數量）吃 bigint | number，不吃 string，不能直接沿用 parseTpexNumber 的回傳值。
 */
export function parseTpexBigInt(value: string | null | undefined): bigint | null {
  const cleaned = parseTpexNumber(value);
  if (cleaned === null) return null;
  return BigInt(cleaned);
}

/**
 * 西元年 YYYYMMDD 字串轉為 UTC 午夜的 Date。跟 rocDateToISO 不同——mopsfin_t187ap03_O/_R 的
 * 「成立日期」「上市日期」是西元年（Date 出表日期才是民國年）。長度不對或空字串回傳 null。
 */
export function gregorianDateToISO(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const day = Number(dateStr.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 取得 Asia/Taipei 當地的今天日期（YYYY-MM-DD）。用 Intl 取得該時區的曆法日期，
 * 不能用 new Date() 直接取值，因為容器 TZ=UTC，本地時間不等於台北時間。
 */
export function getTaipeiTodayISO(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' });
  return formatter.format(new Date());
}
