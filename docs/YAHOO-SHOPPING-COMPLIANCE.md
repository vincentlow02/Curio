# Yahoo! Shopping API Use Gate

Status: **PENDING**. `YAHOO_SHOPPING_API_ENABLED` defaults to false. Do not enable it for production until Yahoo confirms that Curio's independent multi-marketplace valuation, display, retention and business model are permitted.

## Verified Official Guidance

- Yahoo! Shopping Product Search API v3 is a public read API at `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch`. It takes a registered Client ID as `appid`; OAuth is not listed as required for this search API.
- `condition=used` requests used listings. `results=30` is supported; response fields include `name`, `description`, `headLine`, `url`, `code`, `condition`, `inStock`, `price`, seller name/ID, image URLs, genre and JAN.
- The documentation asks for at most one query per second and warns repeated identical URLs may be temporarily restricted. The FAQ indicates request limits can also be enforced in bursts and discloses a 50,000-request Client ID limit in its error guidance. The implementation only provides process-local pacing; it is not a cross-instance guarantee.
- Yahoo Developer Network API use requires its guidelines and prescribed credit. The credit must link to the API documentation, use an approved unmodified snippet and appear at the bottom of the application/site.
- Yahoo's commercial-use FAQ says non-commercial use is the default. Commercial/enterprise usage is not categorically prohibited, but requires contacting Yahoo and following its approval process.

## Curio Questions Still Open

- Curio uses Yahoo listing prices to compute an independent combined estimate, not only to introduce Yahoo products. The official material reviewed does not explicitly approve this transformation/comparison purpose.
- The item-search docs link to a separate Yahoo Shopping Store API contract; that contract governs merchant/store operations and includes a no-retention provision for information supplied under that contract. Its scope should not be assumed to cover this public search API. Yahoo must clarify retention/cache rules for Product Search API results.
- Curio's revenue/monetization plan needs review against the non-commercial default and Yahoo's commercial-usage approval requirements.
- Curio does not yet display Yahoo's required official credit or apply a Yahoo-specific cached-data expiry/deletion policy. Local analysis history persists result data until users delete/replace it; Yahoo retention permission is not confirmed.
- Obtain written approval covering independent price estimation, comparative source links, permitted storage/retention and any monetization before enabling the feature flag.

## Janpara Seller Scope

Janpara (`seller_id=janpara`) reuses the Yahoo! Shopping Product Search API and remains part of the `Yahoo! Shopping` Marketplace source. `JANPARA_YAHOO_SHOPPING_STORE_SEARCH_ENABLED` is a conservative, default-off application switch, not a verified Yahoo or Janpara requirement for separate written seller approval. The official Yahoo guidance reviewed here establishes a channel-wide commercial-use approval requirement; it does not establish a per-seller permission gate. Keep the Yahoo channel gate off until its approval scope is confirmed, and leave the Janpara local switch off unless intentionally enabling its additional results.

KOMEHYO also uses the same channel-wide Yahoo gate; no additional seller-specific legal requirement has been established in this review. Confirm that applicable Yahoo API approval and any merchant terms cover Curio's intended use before enabling production collection. When a configured store's dedicated query is selected, matching full-site hits are left to that filtered query; when relevance skips the dedicated query, full-site results remain eligible only after the same seller, store URL, used, in-stock, and positive-price validation, except where a store-specific local gate is explicitly off.

Official references: [Shopping API overview](https://developer.yahoo.co.jp/webapi/shopping/), [Product Search v3](https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html), [Developer guideline](https://developer.yahoo.co.jp/guideline/), [credit rules](https://developer.yahoo.co.jp/attribution/), [rate guidance](https://developer.yahoo.co.jp/appendix/rate.html), [commercial-use FAQ](https://support.yahoo-net.jp/PccDeveloper/s/article/H000011080), [Search API FAQ](https://developer.yahoo.co.jp/webapi/shopping/faq.html).