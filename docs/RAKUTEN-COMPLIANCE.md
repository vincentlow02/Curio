# Rakuten API Use Gate

Status: **PENDING**. The API Provider is opt-in with `RAKUTEN_OFFICIAL_API_ENABLED=true`; otherwise the preserved Rakuten Browser Provider remains selected. Do not enable the API in production until the intended Curio use is confirmed with Rakuten.

## Verified Official Guidance

- The 2026-07-01 Item Search endpoint is `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`.
- `applicationId` is a query parameter. `accessKey` is required and may be sent in a header or query; Curio uses the header.
- `format=json`, `formatVersion=2`, `hits` up to 30, `page` 1 through 100, and `availability=1` are supported. V2 item objects are read from `items[]`.
- Rakuten's FAQ says each application ID should make no more than one request per second. The implementation serializes requests in one Node.js process only; it cannot enforce the limit across Vercel instances. Production rate limiting remains blocked until a shared limiter or an approved low-volume deployment strategy exists.
- The FAQ generally permits caching price/availability for up to 24 hours and other fields for up to three months, subject to deletion instructions. Displayed price/availability must be refreshed at least weekly; if refreshed less often than hourly, adjacent update time and the prescribed disclaimer are required.
- Rakuten data may be used to introduce Rakuten products and link to their Rakuten pages. Displaying products from other services side by side is conditionally allowed with source attribution. Monetization outside Rakuten Affiliate and services that compete with Rakuten are restricted by the Terms/FAQ.
- Required Rakuten Web Service credit must use an official supplied snippet without modification.

## Curio Questions Still Open

- Curio uses listings as inputs to an independent multi-marketplace price estimate, rather than solely introducing Rakuten products and linking to their Rakuten pages. This use is not confirmed as permitted.
- Curio's planned revenue model and any affiliate-link behavior need review against the Terms, including the prohibition on earning income through the API other than Rakuten Affiliate absent explicit permission.
- Curio does not currently implement the required Rakuten credit, adjacent price timestamp/disclaimer, cache refresh/deletion policy, or a shared cross-instance rate limiter for API data.
- Obtain written confirmation from Rakuten that Curio's comparison, price-estimation, display, retention, and monetization model is permitted before production activation.

Official references: [Item Search API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search), [Terms](https://webservice.rakuten.co.jp/guide/rule), [Branding credit](https://webservice.rakuten.co.jp/guide/credit), [rate limit FAQ](https://webservice.faq.rakuten.net/hc/ja/articles/900001974383), [cache/display FAQ](https://webservice.faq.rakuten.net/hc/ja/articles/900001974343), [data-use FAQ](https://webservice.faq.rakuten.net/hc/ja/articles/900001974363), [combined-display FAQ](https://webservice.faq.rakuten.net/hc/ja/articles/900001970786), [paid-tools FAQ](https://webservice.faq.rakuten.net/hc/ja/articles/900001970826).