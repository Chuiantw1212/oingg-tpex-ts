# Neon Database 筆記

這份文件只講 Neon 特有的東西：pooled 跟 direct 連線的差異、為什麼專案裡兩條連線字串都要、還有各參數的意思。專案整體架構請看 [README.md](README.md)。

---

## Pooled vs Direct：差在哪

Neon 的每個 compute endpoint 其實對外開了兩個連線入口，指向**同一個資料庫**，差別只在有沒有經過 PgBouncer：

```
ep-ancient-lake-azmnr86v-pooler.c-3.ap-southeast-1.aws.neon.tech   ← Pooled（多了 -pooler）
ep-ancient-lake-azmnr86v.c-3.ap-southeast-1.aws.neon.tech          ← Direct（沒有 -pooler）
```

主機名稱差別就只有那個 `-pooler`，其他（帳密、db 名稱）完全一樣。

- **Pooled**：連線先進 Neon 內建的 PgBouncer（transaction pooling 模式），PgBouncer 再把實際的 Postgres 連線借給你用完就收回。一個 PgBouncer 可以讓數百個 client 共用少數幾條真正的 DB 連線。
- **Direct**：跳過 PgBouncer，直接跟 Postgres 建立一條連線。

## 為什麼這個專案兩個都要

| | Pooled (`DATABASE_URL`) | Direct (`DIRECT_URL`) |
|---|---|---|
| 誰用 | app runtime（`src/adapters/db/index.ts` 的 `PrismaClient`） | `prisma migrate` |
| 為什麼 | Cloud Run 會開多個 instance，每個 instance 的 Prisma Client 都會自己開連線池；instance 一多，直連 Postgres 很容易超過 Neon 的連線數上限。走 PgBouncer 可以讓大量 instance 共用少數真實連線 | PgBouncer 的 transaction pooling 模式不支援部分 session 層級的行為（例如某些 prepared statement、`SET` 語句、advisory lock），跑 DDL（`CREATE TABLE` 之類）容易出問題，所以 migration 要繞過它 |

`prisma.config.ts` 只給 CLI（`migrate`/`generate`/`studio`）用 `DIRECT_URL`；runtime 的 `PrismaClient` 在 `src/adapters/db/index.ts` 裡自己用 `@prisma/adapter-pg` 接 `DATABASE_URL`，兩邊各自讀各自的環境變數，不會用錯。

## 連線字串裡的參數

```
postgresql://neondb_owner:xxx@ep-xxx-pooler.../neondb?sslmode=require&channel_binding=require&pgbouncer=true
```

- **`sslmode=require`**：Neon 強制 TLS，不加會直接連線失敗。
- **`channel_binding=require`**：Neon 預設加的 SCRAM channel binding，防止中間人攻擊竄改連線；跟著 Neon Console 複製出來的字串走就好，不要拿掉。
- **`pgbouncer=true`**：只出現在 `DATABASE_URL`（pooled）那條，**不要**加在 `DIRECT_URL`。這是講給 Prisma 聽的參數，告訴它「這條連線背後是 PgBouncer transaction pooling」，Prisma 會因此關掉它自己的 prepared statement 快取機制——不關的話，PgBouncer 每次把連線借給不同 client 時，Prisma 快取的 prepared statement 會對不上，容易噴 `prepared statement "sX" already exists` 這類錯誤。

## Neon 的 autosuspend（冷啟動）

免費 / 入門方案的 Neon compute 會在閒置一段時間後自動暫停，下一個連線進來時才喚醒，這次喚醒可能要數百 ms 到數秒。這也是為什麼：

- README 的 `/healthz` 刻意**不連 DB**——避免冷啟動拖垮健康檢查
- 部署建議加 `--min-instances=1`，讓 Cloud Run 常駐一個 instance，連線不會因為沒人用而斷掉，間接讓 Neon compute 保持醒著

## 常見錯誤對照

| 錯誤訊息 | 原因 |
|---|---|
| `prepared statement "sX" already exists` | 用 pooled 連線但沒加 `pgbouncer=true`，或把 `pgbouncer=true` 誤加在 `DIRECT_URL` 上 |
| `too many connections for role` / `remaining connection slots are reserved` | Runtime 誤用了 direct 連線（`DATABASE_URL` 指到沒有 `-pooler` 的主機），多 instance 情況下把 Neon 連線數上限打爆 |
| migration 卡住或 DDL 相關錯誤 | `prisma migrate` 誤用了 pooled 連線（`DIRECT_URL` 指到有 `-pooler` 的主機） |

## 去哪裡拿連線字串

Neon Console → 選對應的 Project → **Connect** / **Connection Details**。畫面上通常有個 "Pooled connection" 開關，切換它就能同時複製出 pooled 跟 direct 兩種字串（主機名稱差在有沒有 `-pooler`），密碼、db 名稱都一樣不用重打。
