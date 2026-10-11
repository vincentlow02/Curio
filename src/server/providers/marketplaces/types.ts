import type { ItemProfile } from "../../../price/item-profile";
import type { MarketplaceSource, SearchSnapshot } from "../../../price/types";

export type MarketplaceSearchInput = {
  keyword: string;
  maxCards: number;
  signal?: AbortSignal;
};

export type MarketplaceProviderBase = {
  source: MarketplaceSource;
  supportsProfile(profile: ItemProfile): boolean;
};

export type HttpMarketplaceProvider = MarketplaceProviderBase & {
  runtime: "http";
  search(args: MarketplaceSearchInput): Promise<SearchSnapshot["sources"][number]>;
};