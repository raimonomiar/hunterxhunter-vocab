import type { Client } from "@libsql/client";

const UNKNOWN = "unknown";

type DbExecutor = Pick<Client, "execute">;

export type VisitLocationTotal = {
  country: string;
  region: string;
  visits: number;
};

export type VisitDayTotal = {
  date: string;
  visits: number;
};

export type AnonymousVisitReport = {
  totalVisits: number;
  days: VisitDayTotal[];
  locations: VisitLocationTotal[];
};

export function normalizeVisitGeography(
  countryHeader: string | null,
  regionHeader: string | null,
): { country: string; region: string } {
  const country = countryHeader?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    return { country: UNKNOWN, region: UNKNOWN };
  }

  const region = regionHeader?.toUpperCase();
  return {
    country,
    region: region && /^[A-Z0-9]{1,3}$/.test(region) ? region : UNKNOWN,
  };
}

function isUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const schemaInitializations = new WeakMap<object, Promise<void>>();

/** Creates only the isolated aggregate table, outside the vocabulary schema path. */
export async function ensureAnonymousVisitSchema(db: DbExecutor): Promise<void> {
  let initialized = schemaInitializations.get(db);
  if (!initialized) {
    initialized = db
      .execute(
        `
        CREATE TABLE IF NOT EXISTS anonymous_daily_visits (
          visit_date TEXT NOT NULL CHECK (
            length(visit_date) = 10 AND
            visit_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          ),
          country TEXT NOT NULL CHECK (
            country = 'unknown' OR country GLOB '[A-Z][A-Z]'
          ),
          region TEXT NOT NULL CHECK (
            region = 'unknown' OR (
              length(region) BETWEEN 1 AND 3 AND
              region NOT GLOB '*[^A-Z0-9]*'
            )
          ),
          visit_count INTEGER NOT NULL CHECK (visit_count > 0),
          PRIMARY KEY (visit_date, country, region)
        ) WITHOUT ROWID
      `,
      )
      .then(() => undefined);
    schemaInitializations.set(db, initialized);
  }

  try {
    await initialized;
  } catch (error) {
    schemaInitializations.delete(db);
    throw error;
  }
}

/** Adds one count to a bounded daily geography bucket; no visit row is retained. */
export async function incrementAnonymousVisit(
  db: DbExecutor,
  date: string,
  countryHeader: string | null,
  regionHeader: string | null,
): Promise<void> {
  if (!isUtcDate(date)) throw new Error("Visit date must be a valid UTC calendar date");
  const geography = normalizeVisitGeography(countryHeader, regionHeader);
  await ensureAnonymousVisitSchema(db);
  await db.execute({
    sql: `
      INSERT INTO anonymous_daily_visits (visit_date, country, region, visit_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT (visit_date, country, region)
      DO UPDATE SET visit_count = visit_count + 1
    `,
    args: [date, geography.country, geography.region],
  });
}

function countValue(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Stored visit aggregate is outside the safe integer range");
  }
  return count;
}

/** Reads daily and location aggregates only; it never reads individual visits. */
export async function getAnonymousVisitReport(db: DbExecutor): Promise<AnonymousVisitReport> {
  await ensureAnonymousVisitSchema(db);
  const result = await db.execute(`
    SELECT visit_date, country, region, SUM(visit_count) AS visits
    FROM anonymous_daily_visits
    GROUP BY visit_date, country, region
    ORDER BY visit_date DESC, country ASC, region ASC
  `);

  let totalVisits = 0;
  const days = new Map<string, number>();
  const locations = new Map<string, VisitLocationTotal>();
  for (const row of result.rows) {
    const visits = countValue(row.visits);
    totalVisits += visits;
    if (!Number.isSafeInteger(totalVisits)) {
      throw new Error("Stored visit total is outside the safe integer range");
    }

    const date = String(row.visit_date);
    days.set(date, (days.get(date) ?? 0) + visits);

    const country = String(row.country);
    const region = String(row.region);
    const key = `${country}/${region}`;
    const current = locations.get(key);
    locations.set(key, {
      country,
      region,
      visits: (current?.visits ?? 0) + visits,
    });
  }

  return {
    totalVisits,
    days: [...days.entries()]
      .map(([date, visits]) => ({ date, visits }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    locations: [...locations.values()].sort(
      (a, b) =>
        b.visits - a.visits ||
        a.country.localeCompare(b.country) ||
        a.region.localeCompare(b.region),
    ),
  };
}
