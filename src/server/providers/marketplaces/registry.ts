import type { MarketplaceSource } from "../../../price/types";
import { env } from "../../config/env";
import { mercariProvider } from "./mercari";
import { rakutenProvider } from "./rakuten";
import type { BrowserMarketplaceProvider } from "./shared/browser-search";
import type { HttpMarketplaceProvider } from "./types";
import { rakutenBrowserProvider } from "./rakuten-browser";
import { yahooShoppingProvider } from "./yahoo-shopping";

export type RegisteredMarketplaceProvider = HttpMarketplaceProvider | BrowserMarketplaceProvider;

type EnabledRegistration = { id: MarketplaceSource; status: "enabled"; provider: RegisteredMarketplaceProvider };
type DisabledRegistration = { id: string; status: "disabled" };
type MarketplaceRegistration = EnabledRegistration | DisabledRegistration;

const yahooShoppingRegistration: MarketplaceRegistration = env.yahooShoppingApiEnabled
  ? { id: "Yahoo! Shopping", status: "enabled", provider: yahooShoppingProvider }
  : { id: "Yahoo! Shopping", status: "disabled" };

export const marketplaceRegistry = [
  { id: "Rakuten", status: "enabled", provider: env.rakutenOfficialApiEnabled ? rakutenProvider : rakutenBrowserProvider },
  { id: "Mercari", status: "enabled", provider: mercariProvider },
  yahooShoppingRegistration,
  { id: "Yahoo!フリマ", status: "disabled" },
  { id: "Rakuma", status: "disabled" },
  { id: "Surugaya", status: "disabled" },
  { id: "BOOKOFF", status: "disabled" },
  { id: "HARD OFF", status: "disabled" },
  { id: "2nd STREET", status: "disabled" },
  { id: "Yahoo! Auctions", status: "disabled" },
  { id: "Mandarake", status: "disabled" },
] as const satisfies readonly MarketplaceRegistration[];