import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import test from "node:test";
import { POST } from "../src/app/api/analytics/visit/route";
import {
  getAnonymousVisitReport,
  incrementAnonymousVisit,
  normalizeVisitGeography,
} from "../src/lib/anonymous-visits";
import { ensureSchema } from "../src/lib/db";
import { recordAnonymousVisitOnce } from "../src/lib/anonymous-visit-client";

function sessionStorageFixture(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("one session flag covers rerenders, navigation, reload, and failed-request retries", () => {
  const storage = sessionStorageFixture();
  let requests = 0;
  const failedRequest = () => {
    requests += 1;
    throw new Error("synthetic network failure");
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordAnonymousVisitOnce(storage, failedRequest);
  }

  assert.equal(requests, 1);
});

test("unavailable browser storage leaves analytics optional", () => {
  let requests = 0;
  const storage = {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("storage disabled");
    },
  };

  assert.doesNotThrow(() => recordAnonymousVisitOnce(storage, () => requests++));
  assert.equal(requests, 0);
});

test("geography is normalized to coarse provider codes and missing values stay unknown", () => {
  assert.deepEqual(normalizeVisitGeography("jp", "13"), { country: "JP", region: "13" });
  assert.deepEqual(normalizeVisitGeography("us", "ca"), { country: "US", region: "CA" });
  assert.deepEqual(normalizeVisitGeography("US", "California"), {
    country: "US",
    region: "unknown",
  });
  assert.deepEqual(normalizeVisitGeography(null, "13"), {
    country: "unknown",
    region: "unknown",
  });
  assert.deepEqual(normalizeVisitGeography("?U", "13"), {
    country: "unknown",
    region: "unknown",
  });
});

test("daily aggregate counts and reporting contain no individual visit fields", async () => {
  const db = createClient({ url: "file::memory:" });
  await ensureSchema(db);

  const beforeAnalytics = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'anonymous_daily_visits'",
  );
  assert.equal(beforeAnalytics.rows.length, 0);

  await incrementAnonymousVisit(db, "2026-10-04", "US", "CA");
  await incrementAnonymousVisit(db, "2026-10-04", "US", "CA");
  await incrementAnonymousVisit(db, "2026-10-04", null, "13");
  await incrementAnonymousVisit(db, "2026-10-03", "JP", "13");

  const report = await getAnonymousVisitReport(db);
  assert.deepEqual(report, {
    totalVisits: 4,
    days: [
      { date: "2026-10-04", visits: 3 },
      { date: "2026-10-03", visits: 1 },
    ],
    locations: [
      { country: "US", region: "CA", visits: 2 },
      { country: "JP", region: "13", visits: 1 },
      { country: "unknown", region: "unknown", visits: 1 },
    ],
  });

  const columns = await db.execute("PRAGMA table_info(anonymous_daily_visits)");
  assert.deepEqual(
    columns.rows.map((row) => row.name),
    ["visit_date", "country", "region", "visit_count"],
  );
  assert.equal(
    (await db.execute("SELECT COUNT(*) AS rows FROM anonymous_daily_visits")).rows[0].rows,
    3,
  );
  await assert.rejects(
    incrementAnonymousVisit(db, "2026-02-30", "US", "CA"),
    /valid UTC calendar date/,
  );
});

test("collector rejects non-empty input and is a no-op outside configured production", async () => {
  const env = {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
  };
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_AUTH_TOKEN;

  try {
    const oversized = await POST(
      new Request("https://example.test/api/analytics/visit", {
        method: "POST",
        body: "discarded payload",
      }),
    );
    assert.equal(oversized.status, 413);

    const noop = await POST(
      new Request("https://example.test/api/analytics/visit", { method: "POST" }),
    );
    assert.equal(noop.status, 204);
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
