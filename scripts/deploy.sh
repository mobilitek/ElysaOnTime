#!/bin/sh

set -eu

BRANCH=prod
COMPOSE_FILE=compose.application.yml
CONTAINER_NAME=ontime-app
HEALTH_URL=http://127.0.0.1:3080/health
DOCKER_BIN=/var/packages/ContainerManager/target/usr/bin/docker
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname -- "$SCRIPT_DIR")

cd "$PROJECT_DIR"

if [ ! -d .git ]; then
  echo "Erreur: $PROJECT_DIR doit être un clone Git dédié au déploiement." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Erreur: le fichier secret $PROJECT_DIR/.env est absent." >&2
  exit 1
fi

if [ ! -x "$DOCKER_BIN" ]; then
  echo "Erreur: Docker Container Manager est introuvable." >&2
  exit 1
fi

echo "Mise à jour depuis origin/$BRANCH..."
git fetch --prune origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"

echo "Construction et déploiement de $CONTAINER_NAME..."
sudo -n "$DOCKER_BIN" compose -f "$COMPOSE_FILE" up -d --build

echo "Vérification de $HEALTH_URL..."
curl --fail --silent --show-error \
  --retry 10 --retry-delay 3 --retry-all-errors \
  "$HEALTH_URL"
echo

STATUS=$(sudo -n "$DOCKER_BIN" inspect "$CONTAINER_NAME" \
  --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')
echo "$CONTAINER_NAME: $STATUS"
