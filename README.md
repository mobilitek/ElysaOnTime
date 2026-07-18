# Elysia Ontime

Socle minimal d'une API Bun/ElysiaJS avec PostgreSQL.

## Démarrage local

```bash
cp .env.example .env
docker compose up -d
bun install
bun run db:migrate
bun run dev:api
bun run dev:web
```

L'API répond sur `http://localhost:3000` et son contrôle de santé sur
`http://localhost:3000/health`. L'interface React répond sur
`http://localhost:5173` en développement.

Créez le compte initial avec `bun run user:create`, puis connectez-vous depuis
l'interface React.

Routes disponibles :

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/clients`
- `POST /api/clients`
- `PATCH /api/clients/:id`

## Commandes

```bash
bun test
bun run test:integration
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
