# Elysia Ontime

Socle minimal d'une API Bun/ElysiaJS avec PostgreSQL.

## Démarrage local

```bash
cp .env.example .env
docker compose -f compose.database.dev.yml up -d
bun install
bun run db:migrate
bun run dev:api
bun run dev:web
```

L'API répond sur `http://localhost:3000` et son contrôle de santé sur
`http://localhost:3000/health`. L'interface React répond sur
`http://localhost:5173` en développement.

Le fichier `compose.database.dev.yml` démarre uniquement PostgreSQL pour le
développement local. Le fichier `compose.application.staging.yml` construit et
démarre uniquement l'application OnTime sur le NAS; il utilise la base
PostgreSQL déjà installée sur celui-ci.

## Déploiement manuel sur le NAS

Chaque environnement doit être installé dans son propre clone Git et conserver
son fichier secret à la racine du clone :

- `.env.staging` pour la branche `staging`;
- `.env.prod` pour la branche `prod`.

Depuis le clone concerné, lancez :

```bash
./scripts/deploy-staging.sh
```

ou :

```bash
./scripts/deploy-prod.sh
```

Le staging répond sur le port `3080` et la production sur le port `3081`.
Les deux scripts récupèrent leur branche distante, reconstruisent uniquement
le conteneur d'application, puis valident la route `/health`.

Créez le compte initial avec `bun run user:create`, puis connectez-vous depuis
l'interface React.

Routes disponibles :

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/clients`
- `POST /api/clients`
- `PATCH /api/clients/:id`
- `GET /api/projects?clientId=:clientId`
- `POST /api/projects`
- `PATCH /api/projects/:id`
- `GET /api/work-entries`
- `POST /api/work-entries`
- `PATCH /api/work-entries/:id`
- `POST /api/work-entries/toggle-billed`
- `POST /api/work-entries/toggle-deleted`
- `POST /api/work-entries/:id/duplicate`
- `GET /api/work-entries/export`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/register`

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

### Import historique Excel

La commande d'import historique attend les colonnes `Client`, `Project`, `Day`,
`Date`, `Rate`, `Value`, `Description`, `Hours` et `Billed`.

Validez toujours le fichier sans écriture en premier :

```bash
bun run data:import-legacy -- --file /chemin/export.xlsx --email utilisateur@example.com --dry-run
```

L'import réel exige une confirmation explicite dans la commande. Il remplace
uniquement les clients, projets et entrées de l'utilisateur ciblé; les comptes et
sessions ne sont pas supprimés.

```bash
bun run data:import-legacy -- --file /chemin/export.xlsx --email utilisateur@example.com --replace-user-data
```

L'opération est transactionnelle. Les clients et projets importés sont actifs,
les entrées ne sont pas supprimées, et leur statut facturé provient du fichier.
Les doublons strictement identiques sont distingués en ajoutant `-1`, `-2`, etc.
à leur description.

Le schéma Drizzle se trouve dans `src/db/schema.ts`. Les migrations SQL générées
et versionnées se trouvent dans `drizzle/`.

Lors d'une modification du schéma :

```bash
bun run db:generate
bun run db:migrate
```
