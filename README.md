# Elysia Ontime

Socle minimal d'une API Bun/ElysiaJS avec PostgreSQL.

## Démarrage local

```bash
cp .env.example .env
docker compose up -d
bun install
bun run dev
```

L'API répond sur `http://localhost:3000` et son contrôle de santé sur
`http://localhost:3000/health`.

## Commandes

```bash
bun test
bun run typecheck
```

La structure métier et le schéma PostgreSQL seront ajoutés lorsque les besoins
fonctionnels d'Ontime auront été définis.
