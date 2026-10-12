import type { MarketplaceSource } from "../../../price/types";
import { MARKETPLACE_IDS } from "../../../core/marketplace";
import { env } from "../../config/env";
import { mercariProvider } from "./mercari";
import { rakutenProvider } from "./rakuten";
import type { BrowserMarketplaceProvider } from "./shared/browser-search";
import type { HttpMarketplaceProvider } from "./types";
import { rakumaProvider } from "./rakuma";
import { rakutenBrowserProvider } from "./rakuten-browser";
import { yahooShoppingProvider } from "./yahoo-shopping";
import { yahooFurimaProvider } from "./yahoo-furima";

export type RegisteredMarketplaceProvider = HttpMarketplaceProvider | BrowserMarketplaceProvider;

type EnabledRegistration = { id: MarketplaceSource; status: "enabled"; provider: RegisteredMarketplaceProvider };
type DisabledRegistration = { id: string; status: "disabled" };
type MarketplaceRegistration = EnabledRegistration | DisabledRegistration;

const yahooShoppingRegistration: MarketplaceRegistration = env.yahooShoppingApiEnabled
  ? { id: MARKETPLACE_IDS.yahooShopping, status: "enabled", provider: yahooShoppingProvider }
  : { id: MARKETPLACE_IDS.yahooShopping, status: "disabled" };

const yahooFurimaRegistration: MarketplaceRegistration = env.yahooFurimaDataLicenseVerified
  ? { id: MARKETPLACE_IDS.yahooFurima, status: "enabled", provider: yahooFurimaProvider }
  : { id: MARKETPLACE_IDS.yahooFurima, status: "disabled" };

const rakumaRegistration: MarketplaceRegistration = env.rakumaDataLicenseVerified
  ? { id: MARKETPLACE_IDS.rakuma, status: "enabled", provider: rakumaProvider }
  : { id: MARKETPLACE_IDS.rakuma, status: "disabled" };

export const marketplaceRegistry = [
  { id: MARKETPLACE_IDS.rakuten, status: "enabled", provider: env.rakutenOfficialApiEnabled ? rakutenProvider : rakutenBrowserProvider },
  { id: MARKETPLACE_IDS.mercari, status: "enabled", provider: mercariProvider },
  yahooShoppingRegistration,
  yahooFurimaRegistration,
  rakumaRegistration,
  { id: "Surugaya", status: "disabled" },
  { id: "BOOKOFF", status: "disabled" },
  { id: "HARD OFF", status: "disabled" },
  { id: "2nd STREET", status: "disabled" },
  { id: "Yahoo! Auctions", status: "disabled" },
  { id: "Mandarake", status: "disabled" },
] as const satisfies readonly MarketplaceRegistration[];