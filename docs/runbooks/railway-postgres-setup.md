# Railway PostgreSQL Setup

## Add the PostgreSQL add-on

1. Open your Railway project dashboard
2. Click **New** > **Database** > **Add PostgreSQL**
3. Railway automatically injects `DATABASE_URL` into your service environment
4. Redeploy the service -- the `lifespan()` handler will connect and run migrations on startup

## Run migrations manually (if needed)

Using the Railway CLI:
```bash
railway run psql $DATABASE_URL -f api/migrations/001_initial.sql
```

Or connect directly with psql:
```bash
psql $DATABASE_URL -f api/migrations/001_initial.sql
```

## Verify connection

After deploy, check Railway logs for:
```
asyncpg connection pool created
Database migrations applied
```

If `DATABASE_URL` is not set, you will see:
```
DATABASE_URL not set -- database features disabled
```
This is expected in local dev.
