# TPEx 資料同步微服務

從證券櫃檯買賣中心 (TPEx / Taipei Exchange) OpenAPI 抓取盤後資料，正規化後存入 Neon Postgres。
TypeScript + ultimate-express + Prisma。跟姊妹專案 [oingg-twse-ts](https://github.com/Chuiantw1212/oingg-twse-ts)（抓 TWSE 上市資料）架構完全一樣，差別只在 API 端點跟 payload 格式。

---

## ⚠️ 最重要的限制

**`www.tpex.org.tw/openapi` 只給「今天」的資料，沒有歷史查詢。**

跟 TWSE OpenAPI 一樣，這個平台的所有端點都沒有日期參數。所以：

- **漏抓一次，那次的資料就永久消失**，沒有任何補救方式
- 因此原始 JSON 必須先存下來（`tpex_raw` 表），正規化失敗才有機會重跑
- 因此排程失敗必須告警，不能靜默忽略

Neon 資料庫連線的細節（pooled vs direct、autosuspend、常見錯誤）另外寫在 [NEON.md](NEON.md)。

---

## 跟 TWSE 姊妹專案的差異

架構、資料流、每個 dataset 一個檔案的慣例，全部照抄 `oingg-twse-ts`。真正不同的地方：

| | TWSE | TPEx |
|---|---|---|
| JSON 欄位命名 | 部分端點（如 `t187ap03_L`）用**中文** key（`公司代號`、`董事長`...） | 全部端點都用**英文** key（`SecuritiesCompanyCode`、`Chairman`...），不需要中文欄位對照 |
| 數值缺值佔位符 | `"--"`、`""`、單一個 `"+"`/`"-"`/`"X"` | `"N/A"`（本益比）、`"---"`（收盤價，注意前面常帶空白）、單一個 `"+"`/`"X"` |
| 數字千分位逗號 | 有（`"1,234,567"`） | 目前觀察到的欄位都沒有，但清理函式仍保留去逗號邏輯以防例外 |
| 帶正負號的數值 | 不適用 | `Change`（漲跌）帶 `"+0.94"` 這種前綴，但這個欄位本來就不存（可由前後兩天 close 算出） |
| 公司基本資料的地址欄位 | 分開給中文「住址」跟英文「英文通訊地址」兩個欄位 | 只有一個 `Address`，本身就是英文，所以 `company_profile` 沒有 `englishAddress` 欄位 |

這些差異都封裝在 `src/adapters/tpex/parse.ts`（對應 TWSE 的 `adapters/twse/parse.ts`），呼叫端（`domains/**/index.ts`）的邏輯結構跟 TWSE 版本幾乎一模一樣。

---

## 資料流

```
Cloud Scheduler  →  POST /api/ingest/<dataset>  →  抓 TPEx  →  存 tpex_raw  →  正規化  →  存 daily_price / daily_valuation / company_profile
```

每個 dataset 各自獨立觸發（見下面「API」），方便手動驗證某個 dataset 的資料。沒有訊息隊列、沒有背景 worker。每日資料量小，同步處理幾秒內完成。

---

## 目前抓哪些

| TPEx 端點 | dataset | 寫入表 |
|---|---|---|
| `/tpex_mainboard_daily_close_quotes` | `MAINBOARD_DAILY_CLOSE_QUOTES` | `daily_price`（開高低收、成交股數、成交金額、成交筆數） |
| `/tpex_mainboard_peratio_analysis` | `MAINBOARD_PERATIO_ANALYSIS` | `daily_valuation`（本益比、股價淨值比、殖利率） |
| `/mopsfin_t187ap03_O` | `COMPANY_PROFILE` | `company_profile`（上櫃公司基本資料，含股本、董監事、簽證會計師等） |
| `/mopsfin_t187ap03_R` | `COMPANY_PROFILE_EMERGING` | `company_profile`（興櫃公司基本資料，欄位跟 `t187ap03_O` 完全一樣，但公司代號不重疊——興櫃是另一個交易市場層級，不是上櫃） |

`company_profile` 是快照式資料，主鍵只有 `symbol`，不是時間序列——重抓就整列覆蓋，不保留歷史版本。`COMPANY_PROFILE` 跟 `COMPANY_PROFILE_EMERGING` 寫的是同一張表，只是來源（上櫃 vs 興櫃）不同、公司代號不會撞在一起，raw 資料各自存在 `tpex_raw` 用不同 dataset 名稱區分。

`daily_price` 目前不存 `Change`（漲跌價差，可由前後兩天 close 算出）以及 TPEx 特有的 `Average`／`LatestBidPrice`／`LatesAskPrice`／`Capitals`／`NextReferencePrice`／`NextLimitUp`／`NextLimitDown` 等欄位，跟 TWSE 姊妹專案的 `daily_price` schema 保持一致，之後有需要再擴充。

判斷要不要抓某個 dataset 的標準：**能不能從已有資料算出來？** 不能就抓，因為明天就沒了。

---

## 專案結構

```
oingg-tpex-ts/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                       # Express app、路由、Swagger 掛載、啟動
│   ├── routes.ts                       # 中央路由，把各 domain 掛到 /api/ingest 底下
│   ├── adapters/
│   │   ├── db/index.ts                 # Prisma client、connectDb()、saveRawResponse()
│   │   ├── swagger/index.ts            # swagger-jsdoc + swagger-ui-express 設定
│   │   └── tpex/
│   │       ├── client.ts               # 共用的 axios instance
│   │       └── parse.ts                # 共用純函式：rocDateToISO、parseTpexNumber、getTaipeiTodayISO
│   ├── domains/
│   │   ├── system/                     # "/" 和 "/healthz"
│   │   ├── mainboardDailyCloseQuotes/  # fetch + normalize + upsert + ingest + route，全部同一組檔案
│   │   ├── mainboardPeratioAnalysis/
│   │   ├── companyProfile/
│   │   └── companyProfileEmerging/     # 沿用 companyProfile 的 normalize/upsert，只有 fetcher 不同
│   ├── shared/
│   │   ├── config.ts                    # 環境變數 + X-Task-Secret 驗證（timingSafeEqual）
│   │   ├── ingest-helper.ts              # handleDatasetIngestion()：抓取→存 raw→正規化→upsert→刪 raw 的通用流程
│   │   ├── middleware.ts                 # requireTaskSecret（掛在各路由上）
│   │   └── types.ts                      # DatasetResult
│   └── tests/
├── NEON.md                              # Neon pooled/direct 連線細節
├── pnpm-workspace.yaml                   # 必要，見「安裝」
├── prisma.config.ts                      # Prisma CLI 專用設定（migrate/generate 用 DIRECT_URL）
├── package.json
└── tsconfig.json
```

**每個 dataset 一個資料夾**：要追某個 dataset 的完整流程（抓 → 清理 → 存），打開 `domains/` 底下對應的資料夾就好。`adapters/tpex/`、`adapters/db/` 只放真正跨 dataset 共用、不屬於任何單一 dataset 的東西。

---

## 給 AI agent 的規則

把以下內容放進專案根目錄的 `GEMINI.md`（或對應的 agent 規則檔），Gemini CLI 會自動載入：

```markdown
# 專案規則

## 資料處理（違反會導致靜默的錯誤資料）
- 資料日期（Date）是民國年字串："1150820" → 2026-08-20（前三位 + 1911）
- 公司基本資料的成立/上市日期是西元年 8 碼字串，跟資料日期格式不同，不要用 rocDateToISO
- 所有 JSON 欄位都是字串，包含數字。必須明確轉型
- TPEx 的缺值佔位符是 "N/A"、"---"（注意常帶前後空白），不是 TWSE 的 "--"
- 價格一律用 Prisma Decimal / Postgres NUMERIC，禁止 Float
- 交易日判定必須用 Asia/Taipei 計算，禁止用 new Date() 直接取當地時間

## 資料庫
- 所有寫入用 upsert，必須可重複執行不出錯
- 原始回應先存 tpex_raw，再正規化
- schema 變更用 prisma migrate，禁止 db push
- 禁止在容器啟動時執行 migration

## 其他
- 每個 dataset 一個資料夾，放在 src/domains/ 底下，fetch + normalize + upsert + ingest 放 index.ts，路由放 route.ts
- 每個資料清理函式都要有對應的單元測試
```

---

## 安裝

```bash
pnpm install
```

### `pnpm-workspace.yaml` 是必要檔案

`ultimate-express` 依賴的 `uWebSockets.js` 走 GitHub 安裝，pnpm 預設會擋：

```
[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "uWebSockets.js" ...
```

根目錄的 `pnpm-workspace.yaml` 解除限制，**必須提交到 Git，也必須 COPY 進 Docker**。雲端不會 install，但 Docker build 會。

### Node 版本要固定 22

`uWebSockets.js` 是 native module，綁 Node ABI，build 和 runtime 版本不同會壞。`package.json` 已經加了 `"engines": { "node": ">=22 <23" }`。

---

## 環境變數

```dotenv
# runtime 用（host 帶 -pooler）
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require&channel_binding=require&pgbouncer=true"

# migration 用（不帶 -pooler）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require&channel_binding=require"

TASK_SECRET="本機開發用的密鑰"
PORT=8083
```

複製 `.env.example` 成 `.env` 填入實際值。`.env` 已經在 `.gitignore` 裡，不會被追蹤。兩條連線字串為什麼要分開、`pgbouncer=true` 是做什麼用的、Neon 的 autosuspend 冷啟動——都寫在 [NEON.md](NEON.md)。

---

## 資料庫

```bash
pnpm prisma generate                      # 改完 schema 就要跑
pnpm prisma migrate dev --name init       # 本機
pnpm prisma migrate deploy                # 部署時
```

**不要用 `prisma db push`**——不產生 migration 檔，無法追蹤也無法回溯。

**不要在容器啟動時跑 migration**——多 instance 會互相競爭。

`(symbol, tradeDate)` 複合主鍵讓 `daily_price`/`daily_valuation` 的 upsert 天生幂等，重複觸發、補抓都安全。估值分開存是因為缺值意義不同：虧損公司沒有本益比（TPEx 用 `"N/A"` 標示）、沒發股利的殖利率是 `0`，這跟「沒抓到」不是一回事，混在一張表就分不出來了。

---

## 執行

```bash
pnpm run dev        # tsx watch src/index.ts
pnpm run build       # tsc → dist/
pnpm run start       # node dist/index.js
pnpm test            # vitest
```

---

## API

Swagger UI：`GET /api-docs`（spec 直接從各 `domains/**/route.ts` 的 `@swagger` JSDoc 註解產生）。

### `GET /healthz`

回 200，不驗證。**不要連 DB**，否則 Neon 冷啟動會讓健康檢查失敗。

### `POST /api/ingest/mainboard-daily-close-quotes`

對應 `/tpex_mainboard_daily_close_quotes`：

```jsonc
{ "date": "2026-08-20" }   // 選填，省略 = 今天（Asia/Taipei），實際仍取決於 API 只回傳今天的資料
```

### `POST /api/ingest/mainboard-peratio-analysis`

對應 `/tpex_mainboard_peratio_analysis`，無參數。

### `POST /api/ingest/company-profile`

對應 `/mopsfin_t187ap03_O`（上櫃公司基本資料），無參數。

### `POST /api/ingest/company-profile-emerging`

對應 `/mopsfin_t187ap03_R`（興櫃公司基本資料），寫入跟上櫃公司基本資料相同的 `company_profile` 表。

### 本機測試

```bash
curl -X POST http://localhost:8083/api/ingest/mainboard-daily-close-quotes \
  -H "X-Task-Secret: 你的密鑰" \
  -H "Content-Type: application/json"
```

---

## 端點驗證

沒驗證的話任何人都能無限觸發，結果是你的 IP 被 TPEx 封鎖、Neon 寫入配額耗盡。

**本機**：比對 `X-Task-Secret` 標頭。用 `crypto.timingSafeEqual`，不要用 `===`——而且呼叫前一定要先檢查長度和是否存在，`timingSafeEqual` 對長度不同或 `undefined` 的輸入會直接 throw，沒接住的話一個沒帶標頭的請求就能把整個 process 打掛（`src/shared/config.ts` 的 `compareTaskSecret` 已經處理了這兩種情況，`src/shared/middleware.ts` 的 `requireTaskSecret` 是掛在路由上的簡化版）。

**GCP（尚未設定，見「待辦」）**：預計用 Cloud Run 內建的 IAM 驗證，程式不用自己驗 token。

---

## 資料清理規則

| 原始值 | 處理 |
|---|---|
| `"1150820"`（資料日期） | 民國年 → `2026-08-20`（前三位 + 1911） |
| `"19670218"`（成立/上市日期） | 西元年 8 碼 → `1967-02-18`，不經過 `rocDateToISO` |
| `"N/A"` | `null`（本益比缺值標示，跟 TWSE 的 `"--"` 不同） |
| `" ---"` / `"---"` | `null`（收盤價等缺值標示，注意常帶前後空白） |
| `"+0.94"` | 去掉前綴 `+` 再轉數字 |
| `"1,234,567"` | 去掉逗號再轉數字（防禦性保留，目前觀察到的欄位沒遇過） |

實作在 `src/adapters/tpex/parse.ts`（`rocDateToISO`、`gregorianDateToISO`、`parseTpexNumber`、`parseTpexBigInt`），所有 domain 都在用。

**這是最需要測試的地方**——出錯不會拋異常，只會靜默寫入錯誤資料，你要等到看盤畫面出現離譜數字才會發現。

---

## 待辦

- [ ] Dockerfile、Cloud Run 部署設定
- [ ] Cloud Run IAM 驗證（取代/搭配本機的 `X-Task-Secret`）
- [ ] 交易日曆（國定假日、颱風假）
- [ ] 補漏機制（排程失敗、TPEx 延遲發布時自動回補）
- [ ] 排程失敗告警
- [ ] 除權息資料
- [ ] 歷史資料回填（若 TPEx 有提供舊版查詢 API，需另外評估 IP 風險）
- [ ] 視需要擴充 `daily_price`／`daily_valuation` 欄位（`Average`、`LatestBidPrice`、`DividendPerShare` 等目前刻意省略的欄位）

---

MIT Licence
