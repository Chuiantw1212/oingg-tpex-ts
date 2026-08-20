-- CreateTable
CREATE TABLE "tpex_raw" (
    "id" BIGSERIAL NOT NULL,
    "dataset" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "tpex_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_price" (
    "symbol" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "open" DECIMAL(10,4),
    "high" DECIMAL(10,4),
    "low" DECIMAL(10,4),
    "close" DECIMAL(10,4),
    "volume" BIGINT,
    "turnover" BIGINT,
    "transaction" BIGINT,

    CONSTRAINT "daily_price_pkey" PRIMARY KEY ("symbol","tradeDate")
);

-- CreateTable
CREATE TABLE "daily_valuation" (
    "symbol" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "peRatio" DECIMAL(10,2),
    "pbRatio" DECIMAL(10,2),
    "dividendYield" DECIMAL(10,2),

    CONSTRAINT "daily_valuation_pkey" PRIMARY KEY ("symbol","tradeDate")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "symbol" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "foreign_registration_country" TEXT,
    "industry" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "chairman" TEXT NOT NULL,
    "general_manager" TEXT NOT NULL,
    "spokesperson" TEXT NOT NULL,
    "spokesperson_title" TEXT NOT NULL,
    "deputy_spokesperson" TEXT,
    "phone" TEXT NOT NULL,
    "established_date" DATE,
    "listed_date" DATE,
    "par_value" DECIMAL(14,4),
    "paid_in_capital" BIGINT,
    "private_placement_shares" BIGINT,
    "preferred_stock_shares" BIGINT,
    "financial_report_type" TEXT NOT NULL,
    "stock_transfer_agency" TEXT NOT NULL,
    "transfer_agency_phone" TEXT NOT NULL,
    "transfer_agency_address" TEXT NOT NULL,
    "auditing_firm" TEXT NOT NULL,
    "auditor1" TEXT NOT NULL,
    "auditor2" TEXT,
    "english_short_name" TEXT NOT NULL,
    "fax_number" TEXT,
    "email" TEXT,
    "website" TEXT,
    "issued_shares" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE UNIQUE INDEX "tpex_raw_dataset_tradeDate_key" ON "tpex_raw"("dataset", "tradeDate");
