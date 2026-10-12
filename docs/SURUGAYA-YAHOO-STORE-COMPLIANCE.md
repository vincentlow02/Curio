# Surugaya Yahoo Store Data Use Gate

Status: **PENDING**. The HTTP provider is disabled unless `SURUGAYA_YAHOO_STORE_DATA_LICENSE_VERIFIED=true`. Public page access and a permissive robots rule do not establish permission to collect, retain, display, or use listing data in Curio's independent price estimates.

Before enabling the provider, obtain and record approval for automated search-page access, listing title/price/availability extraction, comparative display, retention and refresh duration, and Curio's commercial model. Keep the gate unset until those uses are confirmed. The provider only reads the Surugaya Yahoo Store search page over ordinary HTTP; it does not use browser automation, proxies, or access-control workarounds.

Unknown availability is exposed as a discovered listing, but its price is omitted from the `MarketplaceCandidate` passed to the existing price pipeline. Product-level `__NEXT_DATA__` stock evidence is required to mark a listing in or out of stock.