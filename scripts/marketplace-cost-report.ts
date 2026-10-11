import { buildMarketplaceCostReport } from "../src/server/analysis/marketplace-cost-report";
import { marketplaceMetricsPath, readMarketplaceCostRecords } from "../src/server/analysis/marketplace-cost-report";

const path = process.argv[2] || process.env.MARKETPLACE_COST_METRICS_PATH;
const resolvedPath = marketplaceMetricsPath(path);

try {
  const records = await readMarketplaceCostRecords(resolvedPath);
  const providerRecords = records.filter((record) => record.kind === "provider_metric");
  if (!providerRecords.length) {
    console.log(JSON.stringify({ status: "NO_RECORDED_DATA", path: resolvedPath, persistenceScope: "local-filesystem-nondurable", marketplaces: [] }, null, 2));
  } else {
    const marketplaces = buildMarketplaceCostReport(providerRecords).map((row) => ({
      ...row,
      estimatedUSD: row.estimatedUSD ?? "N/A",
      actualUSD: row.actualUSD ?? "N/A",
      estimatedCostPerValidProductUSD: row.estimatedCostPerValidProductUSD ?? "N/A",
    }));
    console.log(JSON.stringify({ status: "RECORDED_DATA", path: resolvedPath, persistenceScope: "local-filesystem-nondurable", marketplaces }, null, 2));
  }
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.log(JSON.stringify({ status: "NO_RECORDED_DATA", path: resolvedPath, persistenceScope: "local-filesystem-nondurable", marketplaces: [] }, null, 2));
  } else {
    console.error("Unable to read Marketplace cost records.");
    process.exitCode = 1;
  }
}
