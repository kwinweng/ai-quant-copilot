# Prisma Migrations

This project does not use `prisma migrate dev` history (no `_prisma_migrations`
table baseline exists). Schema upgrades are applied with **`prisma db push`**
on each environment, and additive SQL files live here as a manual record so a
future migrate-deploy workflow can adopt them.

## Local dev upgrade

```bash
npx prisma generate
npx prisma db push       # reads .env / .env.local
```

## Production upgrade

```bash
cd ~/ai-quant-copilot
git pull
npm install
npx prisma generate
npx prisma db push       # additive change, no data loss
pm2 reload ai-quant-copilot
```

If you later want to switch to `prisma migrate deploy`, run
`npx prisma migrate resolve --applied <name>` for each existing folder here to
baseline the migrations table.
