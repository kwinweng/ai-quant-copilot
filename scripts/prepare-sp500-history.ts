// Phase 6.5 — One-shot data prep: transform fja05680/sp500's change-day CSV
// into prisma/seed-data/sp500-history.json (one entry per month).
//
// Run when refreshing the upstream snapshot (rough cadence: quarterly):
//
//   curl -sS "https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes(MM-DD-YYYY).csv" \
//     -o /tmp/sp500-raw.csv
//   npx tsx scripts/prepare-sp500-history.ts /tmp/sp500-raw.csv
//
// The output JSON is the canonical seed source (committed to the repo).
// At runtime, scripts/seed-sp500-history.ts upserts each row into the
// UniverseSnapshot table.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const INPUT = process.argv[2];
if (!INPUT) {
  console.error("Usage: tsx scripts/prepare-sp500-history.ts <input.csv>");
  process.exit(1);
}

const OUTPUT = path.join(
  process.cwd(),
  "prisma",
  "seed-data",
  "sp500-history.json",
);

interface Row {
  date: string; // YYYY-MM-DD
  tickers: string[];
}

// CSV is "date,\"ticker1,ticker2,…\"" — pulling the quoted body manually is
// cheaper and safer than dragging in a CSV lib for this one file.
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const firstComma = line.indexOf(",");
    if (firstComma < 0) continue;
    const date = line.slice(0, firstComma);
    let tickersField = line.slice(firstComma + 1);
    if (tickersField.startsWith('"') && tickersField.endsWith('"')) {
      tickersField = tickersField.slice(1, -1);
    }
    const tickers = tickersField
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || tickers.length === 0) continue;
    out.push({ date, tickers });
  }
  return out;
}

function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function nextMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function endOfMonthDate(key: string): string {
  // Last day of month = day 0 of next month.
  const [y, m] = key.split("-").map(Number);
  const eom = new Date(Date.UTC(y, m, 0));
  return `${eom.getUTCFullYear()}-${(eom.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${eom.getUTCDate().toString().padStart(2, "0")}`;
}

interface Snapshot {
  monthKey: string;
  indexName: "SP500";
  tickers: string[];
}

function buildMonthlySnapshots(rows: Row[]): Snapshot[] {
  // Upstream is already chronological but we don't trust file order.
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const firstMonth = monthKeyOf(rows[0].date);
  const lastMonth = monthKeyOf(rows[rows.length - 1].date);

  const out: Snapshot[] = [];
  let cursor = 0;
  let last: string[] = [];

  let month = firstMonth;
  while (true) {
    const eom = endOfMonthDate(month);
    while (cursor < rows.length && rows[cursor].date <= eom) {
      last = rows[cursor].tickers;
      cursor++;
    }
    if (last.length > 0) {
      out.push({ monthKey: month, indexName: "SP500", tickers: [...last] });
    }
    if (month >= lastMonth) break;
    month = nextMonth(month);
  }
  return out;
}

const csv = readFileSync(INPUT, "utf8");
const rows = parseCsv(csv);
if (rows.length === 0) {
  console.error(`No usable rows parsed from ${INPUT}`);
  process.exit(1);
}

const snapshots = buildMonthlySnapshots(rows);

// Sanity: known historical landmines must be present where they should be.
function assertContains(monthKey: string, ticker: string) {
  const row = snapshots.find((s) => s.monthKey === monthKey);
  if (!row || !row.tickers.includes(ticker)) {
    throw new Error(
      `Sanity check failed: ${ticker} expected in ${monthKey} snapshot (got ${row?.tickers.length ?? 0} tickers)`,
    );
  }
}
function assertMissing(monthKey: string, ticker: string) {
  const row = snapshots.find((s) => s.monthKey === monthKey);
  if (!row || row.tickers.includes(ticker)) {
    throw new Error(
      `Sanity check failed: ${ticker} should NOT be in ${monthKey} snapshot`,
    );
  }
}
assertContains("2008-08", "LEHMQ"); // Lehman alive end-Aug 2008
assertMissing("2008-09", "LEHMQ"); // Removed before 2008-09-30 (bankrupt 9/15)
assertContains("2008-02", "BSC"); // Bear Stearns alive Feb 2008
assertMissing("2008-06", "BSC"); // JPM acquired by end-May 2008
assertContains("1996-01", "AAPL"); // Sanity floor — Apple has always been there

// One snapshot per line so a quarterly refresh produces a clean ~5-line diff
// (typically a handful of months change). Pretty-printing each entry would
// explode this into 360k lines and obscure real changes.
const body = snapshots
  .map((s) => "  " + JSON.stringify(s))
  .join(",\n");
writeFileSync(OUTPUT, `[\n${body}\n]\n`);

const sizeKb = (JSON.stringify(snapshots).length / 1024).toFixed(1);
console.log(
  `[prepare-sp500] wrote ${snapshots.length} monthly snapshots ` +
    `(${snapshots[0].monthKey} → ${snapshots[snapshots.length - 1].monthKey}, ${sizeKb} KB) → ${OUTPUT}`,
);
