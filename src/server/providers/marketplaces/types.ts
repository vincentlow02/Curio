import type { ItemProfile } from "../../../price/item-profile";
import type { MarketplaceSource, SearchSnapshot } from "../../../price/types";

export type MarketplaceSearchInput = {
  profile: ItemProfile;
  keyword: string;
  maxCards: number;
  signal?: AbortSignal;
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
};

export type MarketplaceProviderBase = {
  source: MarketplaceSource;
  supportsProfile(profile: ItemProfile): boolean;
};

export type HttpMarketplaceProvider = MarketplaceProviderBase & {
  runtime: "http";
  search(args: MarketplaceSearchInput): Promise<SearchSnapshot["sources"][number]>;
};