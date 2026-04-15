# Render Status Utility

Check production Render deployment status, recent deploys, and service health.

## Credentials

Load `RENDER_API_KEY` per `shared/references/credentials.md`.

## Service IDs

- Service: `srv-d58bj73uibrs73akacd0` (meet-without-fear-api)
- Env group: `evg-d58bivruibrs73aka8qg` (be-heard-api-env)
- Dashboard: https://dashboard.render.com/web/srv-d58bj73uibrs73akacd0

## Checks (run in parallel)

1. **Health check**: GET `/health` on the service URL
2. **Service info**: GET `/v1/services/{id}` — plan, region, suspended status
3. **Recent deploys**: GET `/v1/services/{id}/deploys?limit=5` — status, commit message, timestamp
4. **Recent events**: GET `/v1/services/{id}/events?limit=10` — deploy/build events
5. **Env vars**: GET `/v1/services/{id}/env-vars` — names only, NEVER print values
