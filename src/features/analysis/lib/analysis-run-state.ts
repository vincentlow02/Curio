import { buildPokemonCardSearchKeyword } from "../../../core/profile/pokemon-card";
import type { DetectionResult, PokemonCardIdentity } from "../../../core/profile/types";

export function updateRecognitionDraft<Key extends keyof DetectionResult>(
  current: DetectionResult | null,
  key: Key,
  value: DetectionResult[Key],
): DetectionResult | null {
  if (!current) return current;
  const next = { ...current, [key]: value };
  if (key === "category" && value !== "Cards & Game Collectibles") delete next.pokemonCard;
  return next;
}

export function updatePokemonCardDraft<Key extends keyof PokemonCardIdentity>(
  current: DetectionResult | null,
  key: Key,
  value: PokemonCardIdentity[Key],
): DetectionResult | null {
  if (!current?.pokemonCard) return current;
  const pokemonCard = { ...current.pokemonCard, [key]: value };
  return { ...current, pokemonCard, priceSearchKeywordJa: buildPokemonCardSearchKeyword(pokemonCard) };
}
