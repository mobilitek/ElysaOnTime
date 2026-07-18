# Elysia Ontime

Socle minimal d'une API Bun/ElysiaJS avec PostgreSQL.

## Démarrage local

```bash
cp .env.example .env
docker compose up -d
bun install
bun run db:migrate
bun run dev
```

L'API répond sur `http://localhost:3000` et son contrôle de santé sur
`http://localhost:3000/health`.

## Commandes

```bash
bun test
bun run typecheck
bun run db:generate
bun run db:migrate
bun run db:studio
bun run user:create
```

Le schéma Drizzle se trouve dans `src/db/schema.ts`. Les migrations SQL générées
et versionnées se trouvent dans `drizzle/`.

Lors d'une modification du schéma :

```bash
bun run db:generate
bun run db:migrate
```
