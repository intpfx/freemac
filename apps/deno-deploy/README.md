# freemac Deno Deploy relay

This app is intended to be deployed on Deno Deploy.

## What it does

- accepts a POST request from the Mac with the latest public IPv6 and port
- persists the latest target in Deno KV
- serves a simple web page that renders the latest target in an iframe
- exposes a JSON status endpoint

## Endpoints

- `GET /` - HTML viewer page
- `GET /api/status` - current stored target
- `POST /api/report` - update the stored target

## Environment variables

- `FREEMAC_UPDATE_TOKEN` - optional bearer token required by `POST /api/report`

## Example report request

```bash
curl -X POST https://your-deno-app.deno.dev/api/report \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -d '{
    "ipv6": "2409:8a62:3210:3010:4845:d014:d517:117e",
    "port": 43200,
    "protocol": "http",
    "source": "freemac-home"
  }'
```

## Important browser limitation

If this Deno Deploy app is served over `https://` and the target freemac page is only available over
`http://[ipv6]:port`, browsers will usually block the iframe as mixed content.

In that case the stored target is still useful as a status page and launch link, but the embedded
iframe will not fully work until the target is exposed over HTTPS.
