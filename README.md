# Elysia Ontime

Socle minimal d'une API Bun/ElysiaJS avec PostgreSQL.

## Démarrage local

```bash
cp .env.example .env
docker compose -f compose.database.yml up -d
bun install
bun run db:migrate
bun run dev:api
bun run dev:web
```

L'API répond sur `http://localhost:3000` et son contrôle de santé sur
`http://localhost:3000/health`. L'interface React répond sur
`http://localhost:5173` en développement.

Le fichier `compose.database.yml` démarre PostgreSQL pour le développement
local. Le fichier `compose.application.yml` construit et démarre l'application
OnTime sur le NAS; il utilise la base PostgreSQL déjà installée sur celui-ci.

## Déploiement manuel sur le NAS

Le déploiement doit être installé dans un clone Git dédié de la branche `prod`
et conserver son fichier secret `.env` à la racine du clone.

```bash
./scripts/deploy.sh
```

L'application répond sur le port `3080`. Le script récupère la branche distante
`prod`, reconstruit uniquement le conteneur d'application, puis valide la route
`/health`.

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
- `GET /api/backup/download`
- `POST /api/backup/analyze`
- `POST /api/backup/restore`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/register`

## Commandes

```bash
bun test
bun run test:integration
bun run typecheck
bun run db:generate
bun run db:wait
bun run db:migrate
bun run db:studio
bun run user:create
bun run user:admin -- --email utilisateur@example.com --grant
```

Retirez le droit administrateur avec la même commande et l'option `--revoke`.

### Export, sauvegarde et restauration

L'export Excel est un rapport construit à partir des filtres du journal. Il
n'est pas destiné à restaurer l'application.

La sauvegarde produit un fichier JSON OnTime versionné contenant tous les
clients, projets et entrées de l'utilisateur, y compris les éléments inactifs
ou supprimés, les statuts facturés, les tarifs historiques et les dates
originales. La restauration analyse ce fichier avant de demander la
confirmation `RESTAURER`. Elle remplace uniquement les données de l'utilisateur
connecté, dans une transaction; son compte et les données des autres
utilisateurs ne sont pas modifiés. Ces outils sont disponibles à tous les
utilisateurs authentifiés.

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
