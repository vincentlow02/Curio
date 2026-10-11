import type { ItemProfile } from "../../../price/item-profile";
import { marketplaceRegistry, type RegisteredMarketplaceProvider } from "./registry";

export function selectMarketplaceProviders(profile: ItemProfile): RegisteredMarketplaceProvider[] {
  return marketplaceRegistry.flatMap((registration) =>
    registration.status === "enabled" && registration.provider.supportsProfile(profile)
      ? [registration.provider]
      : [],
  );
}