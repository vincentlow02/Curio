export const MARKETPLACE_IDS = {
  rakuten: "Rakuten",
  rakuma: "Rakuma",
  mercari: "Mercari",
  yahooShopping: "Yahoo! Shopping",
  surugayaYahooStore: "Surugaya Yahoo Store",
  yahooFurima: "Yahoo!フリマ",
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
  [MARKETPLACE_IDS.rakuma]: {
    displayName: { en: "Rakuma", zh: "Rakuma", ja: "ラクマ" },
    activityTitle: { en: "Searched Rakuma", zh: "已搜索 Rakuma", ja: "ラクマを検索" },
    logoPath: null,
    marker: "R",
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
  [MARKETPLACE_IDS.surugayaYahooStore]: {
    displayName: { en: "Surugaya Yahoo Store", zh: "骏河屋 Yahoo 店", ja: "駿河屋Yahoo!店" },
    activityTitle: { en: "Searched Surugaya Yahoo Store", zh: "已搜索骏河屋 Yahoo 店", ja: "駿河屋Yahoo!店を検索" },
    logoPath: null,
    marker: "S",
  },
  [MARKETPLACE_IDS.yahooFurima]: {
    displayName: { en: "Yahoo! Flea Market", zh: "Yahoo!フリマ", ja: "Yahoo!フリマ" },
    activityTitle: { en: "Searched Yahoo! Flea Market", zh: "已搜索 Yahoo!フリマ", ja: "Yahoo!フリマを検索" },
    logoPath: null,
    marker: "YF",
  },
} as const satisfies Record<MarketplaceSource, MarketplaceMetadata>;
