export const MARKETPLACE_IDS = {
  rakuten: "Rakuten",
  mercari: "Mercari",
  yahooShopping: "Yahoo! Shopping",
} as const;

export type MarketplaceSource = (typeof MARKETPLACE_IDS)[keyof typeof MARKETPLACE_IDS];

export const MARKETPLACE_SOURCE_IDS = Object.freeze(Object.values(MARKETPLACE_IDS)) as readonly MarketplaceSource[];
export const WEB_FALLBACK_SOURCE = "Web fallback" as const;
export type PriceSource = MarketplaceSource | typeof WEB_FALLBACK_SOURCE;
export const PRICE_SOURCE_IDS = Object.freeze([...MARKETPLACE_SOURCE_IDS, WEB_FALLBACK_SOURCE]) as readonly PriceSource[];

export type MarketplaceMetadata = {
  displayName: { en: string; zh: string; ja: string };
  activityTitle: { en: string; zh: string; ja: string };
  logoPath: string | null;
  marker: string | null;
};

export const MARKETPLACE_METADATA = {
  [MARKETPLACE_IDS.rakuten]: {
    displayName: { en: "Rakuten", zh: "乐天", ja: "楽天" },
    activityTitle: { en: "Searched Rakuten", zh: "已搜索乐天", ja: "楽天を検索" },
    logoPath: "/brands/rakuten.ico",
    marker: null,
  },
  [MARKETPLACE_IDS.mercari]: {
    displayName: { en: "Mercari", zh: "Mercari", ja: "メルカリ" },
    activityTitle: { en: "Searched Mercari", zh: "已搜索 Mercari", ja: "メルカリを検索" },
    logoPath: "/brands/mercari.ico",
    marker: null,
  },
  [MARKETPLACE_IDS.yahooShopping]: {
    displayName: { en: "Yahoo! Shopping", zh: "Yahoo! Shopping", ja: "Yahoo!ショッピング" },
    activityTitle: { en: "Searched Yahoo! Shopping", zh: "已搜索 Yahoo! Shopping", ja: "Yahoo!ショッピングを検索" },
    logoPath: null,
    marker: "Y!",
  },
} as const satisfies Record<MarketplaceSource, MarketplaceMetadata>;
