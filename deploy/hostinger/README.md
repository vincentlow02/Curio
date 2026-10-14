# Rakuten Gateway on Hostinger VPS

This deploys only the small Node Gateway, not the Curio Next.js application. Rakuten credentials remain inside the Gateway container. Caddy is the only public service and obtains HTTPS certificates for `GATEWAY_DOMAIN`.

## Prerequisites

- A Hostinger VPS with Docker Engine and Docker Compose plugin available.
- A DNS A record for `GATEWAY_DOMAIN` pointing to the VPS static IPv4 address.
- Firewall ingress limited to SSH administration and TCP 80/443 for Caddy certificate issuance and HTTPS. Port 3001 must not be exposed publicly.

## Configure and start

Copy `.env.example` to `.env` in this directory and set the Gateway domain, Rakuten Application ID, Rakuten Access Key, and a fresh random Gateway server-auth token. Generate a token with `openssl rand -hex 32`; configure the exact same value as `RAKUTEN_GATEWAY_AUTH_TOKEN` in the Vercel project environment. On the VPS the variable is `RAKUTEN_GATEWAY_SERVER_AUTH_TOKEN`; the two variables intentionally represent the same shared secret at opposite ends of the service boundary. Do not commit `.env` or put Rakuten credentials in Vercel.

From this directory, start the Gateway and HTTPS proxy:

```sh
docker compose -f compose.yml up -d --build
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=50 rakuten-gateway
```

Only Caddy publishes ports 80 and 443. The Gateway listens on the private Compose network and accepts only authenticated `POST /internal/rakuten/search` requests containing a bounded keyword. It does not accept an upstream URL or forward arbitrary headers.

In Vercel, set `RAKUTEN_GATEWAY_URL` to the HTTPS origin and `RAKUTEN_GATEWAY_AUTH_TOKEN` to the same independently generated Gateway token. Keep `RAKUTEN_OFFICIAL_API_ENABLED=true`; remove `RAKUTEN_APPLICATION_ID` and `RAKUTEN_ACCESS_KEY` from Vercel after Gateway connectivity is verified. The Rakuten provider continues to emit the same V2 `items[]` response to the existing Candidate Mapper.

The Gateway is intentionally a single instance: its in-memory limiter serializes upstream calls to at most one per second for the Rakuten application ID. Do not scale it horizontally without shared rate limiting. Rotating the Gateway token requires updating both VPS and Vercel environments.