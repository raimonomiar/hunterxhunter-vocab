import { getDb } from "../src/lib/db";
import { getAnonymousVisitReport } from "../src/lib/anonymous-visits";

async function main(): Promise<void> {
  const report = await getAnonymousVisitReport(getDb());

  console.log("Anonymous visits (approximate tab sessions; UTC days)");
  console.log(`Total recorded: ${report.totalVisits}`);
  console.log("By day:");
  if (report.days.length === 0) console.log("  No recorded visits");
  for (const day of report.days) {
    console.log(`  ${day.date}: ${day.visits}`);
  }

  console.log("By country and coarse region:");
  if (report.locations.length === 0) console.log("  No recorded visits");
  for (const location of report.locations) {
    console.log(`  ${location.country} / ${location.region}: ${location.visits}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
