import type { ItemProfile } from "../profile/types";
import { identityMatches } from "./identity";
import { matchPokemonCardIdentity } from "../core/profile/pokemon-card";
import { buildStoreSearchUrl } from "./store-verifier";
import type {
  ExclusionReason,
  TavilyFallbackSnapshot,
  NumericRange,
  PriceSource,
  PriceReferenceResult,
  PriceSample,
  SearchSnapshot,
  StoreSnapshot,
} from "./types";

const SOLD_OUT = /売り切れ|売切れ|販売終了|在庫なし|sold_out/i;
const JUNK = /ジャンク|故障|動作不良|動作未確認|通電のみ|部品取り|訳あり|訳アリ|アウトレット/i;
const NEW_ITEM = /新品|未使用|未開封/i;
const INCOMPLETE = /裏蓋なし|背面蓋なし|欠品|電池なし|バッテリーなし/i;
const ACCESSORY_OR_SOFTWARE = /ソフトのみ|ゲームソフト|UMD|ケースのみ|充電器のみ|バッテリーのみ|液晶|交換部品|パーツ|保護カバー|収納ケース/i;
const BUNDLE = /まとめ売り|まとめて|\d+台セット|本体セット|すぐ(?:に)?遊べるセット|ソフト.*セット|バリュー[・\s-]?パック|ソフトプレゼント|カセット|ソフト\s*\d+本|充電器.*ケース付き|メモリースティック付|モンハンセット/i;

function normalize(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9一-龠ぁ-んァ-ヶ]/g, "");
}

function modelTokens(profile: ItemProfile): string[] {
  const source = `${profile.itemName} ${profile.versionOrPeriod} ${profile.priceSearchKeywordJa}`.normalize("NFKC");
  return [...new Set(source.match(/[A-Za-z]{2,}[\s-]?\d{2,}/g)?.map(normalize) ?? [])];
}

function packageStatus(title: string): PriceSample["packageStatus"] {
  if (/箱付き|箱付|完品|元箱/i.test(title)) return "with_box";
  if (/本体のみ|箱なし|箱無し/i.test(title)) return "without_box";
  return "unknown";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function numericRange(samples: PriceSample[]): NumericRange {
  const prices = samples.map((sample) => sample.price);
  return { low: prices.length ? Math.min(...prices) : null, median: median(prices), high: prices.length ? Math.max(...prices) : null, sampleCount: prices.length };
}

function markAggregation(samples: PriceSample[]): void {
  const used = samples.filter((sample) => sample.condition === "used");
  const usedMedian = median(used.map((sample) => sample.price));
  const deviations = usedMedian === null ? [] : used.map((sample) => Math.abs(sample.price - usedMedian));
  const mad = median(deviations);
  const threshold = used.length >= 4 && mad !== null && mad > 0 ? 3 * 1.4826 * mad : Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    if (sample.condition === "new") {
      sample.aggregationExclusionReason = "new_condition";
    } else if (sample.condition === "unknown" && sample.source !== "Web fallback") {
      sample.aggregationExclusionReason = "unknown_condition";
    } else if (usedMedian !== null && Math.abs(sample.price - usedMedian) > threshold) {
      sample.aggregationExclusionReason = "price_outlier";
    } else {
      sample.aggregationExclusionReason = null;
    }
    sample.includedInReferenceRange = sample.aggregationExclusionReason === null;
  }
}

export function buildPriceResult(args: {
  profile: ItemProfile;
  snapshot: SearchSnapshot;
  tavilyFallback: TavilyFallbackSnapshot;
  storeSnapshot: StoreSnapshot;
  maxCardsScannedPerSource: number;
  maxSamplesPerSource: number;
}): {
  result: PriceReferenceResult;
  excluded: Array<{ source: PriceSource; rank: number; url: string; reason: ExclusionReason }>;
} {
  const tokens = modelTokens(args.profile);
  const samples: PriceSample[] = [];
  const excluded: Array<{ source: PriceSource; rank: number; url: string; reason: ExclusionReason }> = [];
  const sourceSnapshots = [
    ...args.snapshot.sources,
    ...(args.tavilyFallback.triggered ? [{ source: "Web fallback" as const, keyword: args.tavilyFallback.query, searchUrl: args.tavilyFallback.searchUrl, error: args.tavilyFallback.searchError, candidates: args.tavilyFallback.candidates }] : []),
  ];
  for (const sourceSnapshot of sourceSnapshots) {
    const sourceSamples: PriceSample[] = [];
    const seen = new Set<string>();
    for (const candidate of sourceSnapshot.candidates.slice(0, args.maxCardsScannedPerSource)) {
      let reason: ExclusionReason | null = null;
      const combined = `${candidate.title} ${candidate.availabilityText}`;
      const normalizedTitle = normalize(candidate.title);
      if (candidate.displayedPrice === null || candidate.displayedPrice <= 0) reason = "missing_price";
      else if (SOLD_OUT.test(combined)) reason = "sold_out";
      else if (JUNK.test(candidate.title)) reason = "junk_or_broken";
      else if (candidate.source === "Rakuten" && NEW_ITEM.test(candidate.title)) reason = "new_item";
      else if (INCOMPLETE.test(candidate.title)) reason = "incomplete_item";
      else if (ACCESSORY_OR_SOFTWARE.test(candidate.title)) reason = "accessory_or_software_only";
      else if (args.profile.pokemonCard) {
        const cardMatch = matchPokemonCardIdentity(args.profile.pokemonCard, combined);
        if (cardMatch === "ambiguous") reason = "unconfirmed_card_identity";
        else if (cardMatch === "different") reason = "different_model";
      } else if (!identityMatches(args.profile, combined)) reason = "different_model";
      else if (BUNDLE.test(candidate.title)) reason = "bundle_or_lot";
      else if (candidate.source === "Rakuten" && !/中古|USED/i.test(candidate.title)) reason = "new_item";
      const dedupeKey = `${normalize(candidate.title)}|${candidate.displayedPrice ?? ""}`;
      if (!reason && seen.has(dedupeKey)) reason = "duplicate";
      if (!reason && sourceSamples.length >= args.maxSamplesPerSource) reason = "sample_limit";
      if (reason) {
        excluded.push({ source: candidate.source, rank: candidate.rank, url: candidate.url, reason });
        continue;
      }
      seen.add(dedupeKey);
      const sample: PriceSample = {
        rank: candidate.rank,
        title: candidate.title,
        price: candidate.displayedPrice!,
        currency: "JPY",
        source: candidate.source,
        url: candidate.url,
        shopName: candidate.shopName || "unknown",
        listingStatus: candidate.source === "Web fallback" ? "unknown" : "active",
        condition: NEW_ITEM.test(candidate.title) ? "new" : candidate.source === "Mercari" || /中古|USED/i.test(combined) ? "used" : "unknown",
        versionMatch: tokens.length > 0 ? "exact" : "similar",
        packageStatus: packageStatus(candidate.title),
        includedInReferenceRange: false,
        aggregationExclusionReason: null,
      };
      sourceSamples.push(sample);
      samples.push(sample);
    }
  }
  markAggregation(samples);
  const referenceSamples = samples.filter((sample) => sample.includedInReferenceRange);
  const warnings: string[] = [];
  for (const source of ["Rakuten", "Mercari"] as const) {
    const count = samples.filter((sample) => sample.source === source).length;
    const sourceError = args.snapshot.sources.find((entry) => entry.source === source)?.error;
    if (sourceError) warnings.push(`${source} search page could not be read: ${sourceError}`);
    if (count < args.maxSamplesPerSource) warnings.push(`${source} produced ${count} comparable asking-price samples; the target was ${args.maxSamplesPerSource}.`);
  }
  if (args.tavilyFallback.triggered && !args.tavilyFallback.candidates.length) warnings.push("Rakuten, Mercari and the Tavily fallback did not produce a verifiable price.");
  if (args.tavilyFallback.candidates.length) warnings.push("Rakuten and Mercari produced no valid result. Tavily only discovered source URLs; sale and condition details may remain unconfirmed.");
  const outlierCount = samples.filter((sample) => sample.aggregationExclusionReason === "price_outlier").length;
  if (outlierCount) warnings.push(`${outlierCount} extreme asking-price listings remain visible but were excluded from the reference range.`);
  const ambiguousCardCount = excluded.filter((entry) => entry.reason === "unconfirmed_card_identity").length;
  if (ambiguousCardCount) warnings.push(`${ambiguousCardCount} same-name Pokémon Card listings were excluded because their exact card number could not be confirmed.`);
  if (referenceSamples.length < 3) warnings.push("The reference range contains fewer than 3 samples and should be treated as preliminary.");
  if (args.storeSnapshot.error) warnings.push(`Store verification failed. Only area search links were retained: ${args.storeSnapshot.error}`);
  const prices = samples.map((sample) => sample.price);
  return {
    result: {
      query: {
        itemName: args.profile.itemName,
        versionOrPeriod: args.profile.versionOrPeriod,
        priceSearchKeywordJa: args.profile.priceSearchKeywordJa,
        sources: sourceSnapshots.map(({ source, keyword, searchUrl }) => ({ source, keyword, searchUrl })),
      },
      recommendedAreas: args.profile.recommendedAreas.map((area) => ({
        ...area,
        storeSearchUrl: buildStoreSearchUrl(area.storeSearchKeywordJa),
        verifiedStores: args.storeSnapshot.enabled && args.storeSnapshot.query === area.storeSearchKeywordJa
          ? args.storeSnapshot.stores.map((store) => ({ ...store, verificationStatus: "maps_search_result" as const }))
          : [],
      })),
      storeRecommendationDisclaimer: args.profile.storeRecommendationDisclaimer,
      samples,
      observedRange: { currency: "JPY", min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, sampleCount: prices.length },
      referenceRange: { currency: "JPY", ...numericRange(referenceSamples), label: "Online asking-price reference", method: "median_absolute_deviation" },
      referenceRangeBySource: (["Rakuten", "Mercari", ...(args.tavilyFallback.triggered ? ["Web fallback" as const] : [])] as PriceSource[]).map((source) => ({ source, ...numericRange(referenceSamples.filter((sample) => sample.source === source)) })),
      conditionRanges: (["used", "new", "unknown"] as const)
        .map((condition) => ({ condition, ...numericRange(samples.filter((sample) => sample.condition === condition && (condition !== "used" || sample.includedInReferenceRange))) }))
        .filter((entry) => entry.sampleCount > 0),
      warnings,
    },
    excluded,
  };
}
