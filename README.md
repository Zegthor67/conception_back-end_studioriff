# Studio Riff : API de réservation

API de réservation des salles de répétition de l'association Studio Riff, en Node.js + Express, avec PostgreSQL 17 et Valkey (cache).

- Les choix de conception sont expliqués dans [DECISIONS.md](DECISIONS.md).
- Les mesures, le cache et la sauvegarde sont décrits dans [REPORT.md](REPORT.md).

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus récent
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), **lancé** avant les commandes `docker`
- Git Bash (installé avec Git pour Windows) pour les scripts `backup.sh` et `restore.sh`

## Démarrage

Toutes les commandes se lancent à la racine du projet.

### 1. Configurer l'environnement

```bash
cp .env.example .env
```

Sous PowerShell : `copy .env.example .env`. Vous pouvez changer le mot de passe dans `.env`, à deux endroits : `POSTGRES_PASSWORD` et `DATABASE_URL`.

> **Port 5433.** PostgreSQL est exposé sur le port **5433** du PC (et non 5432, comme dans le sujet) pour ne pas entrer en conflit avec un PostgreSQL déjà installé sur la machine. Dans le conteneur, il écoute toujours sur 5432.

### 2. Démarrer les bases

```bash
docker compose up -d --wait
```

Les deux conteneurs `postgres` et `valkey` doivent être `Healthy`.

### 3. Installer les dépendances

```bash
npm install
```

### 4. Appliquer les migrations et insérer les données de départ

```bash
npm run migrate
npm run seed
```

`npm run migrate` applique les fichiers de `migrations/` qui ne l'ont pas encore été : on peut le relancer sans risque. `npm run seed` vide les tables et réinsère les salles, membres et réservations de départ.

### 5. Lancer l'API

```bash
npm start
```

L'API écoute sur http://localhost:3000 (changeable avec la variable `PORT`). Laissez ce terminal ouvert, et arrêtez l'API avec `Ctrl + C`.

### 6. Lancer les tests

```bash
npm test
```

PostgreSQL et Valkey doivent être démarrés. Chaque test repart des données de départ, avec l'horloge fixée au lundi 2 novembre 2026, 9 h UTC. Les tests remettent la base dans l'état de départ.

## Routes

| Méthode | Route | Réponses |
|---|---|---|
| GET | `/rooms` | 200 |
| GET | `/rooms/:id/bookings?from=…&to=…` | 200, 400, 404 |
| POST | `/rooms/:id/bookings` | 201 + `Location`, 400, 404, 409 |
| GET | `/bookings/:id` | 200, 404 |
| DELETE | `/bookings/:id` | 204, 404, 409 |
| GET | `/members/:id/bookings` | 200, 404 |

Exemple de création :

```bash
curl -i -X POST http://localhost:3000/rooms/room-1/bookings \
  -H "Content-Type: application/json" \
  -d '{"memberId":"member-3","start":"2026-11-20T14:00:00Z","end":"2026-11-20T16:00:00Z"}'
```

Les dates sont en UTC, au format `2026-11-04T14:00:00Z`.

## Organisation du code

```
src/
  domain/          règles métier pures (créneau, chevauchement, limite, annulation, maintenance)
  application/     cas d'usage : transactions, verrous, cache
  infrastructure/  PostgreSQL, Valkey, horloge système
  http/            routes Express et conversion des erreurs en codes HTTP
migrations/        schéma SQL
seeds/             données de départ
scripts/           lancement des migrations et du seed
sql/               scripts de la mesure EXPLAIN ANALYZE
tests/unit/        tests des règles métier avec une horloge fixe
tests/http/        tests des routes
```

## Sauvegarde et restauration

À lancer dans **Git Bash** :

```bash
./backup.sh
./restore.sh backups/studio_riff_AAAAMMJJ_HHMMSS.dump
```

`backup.sh` écrit une sauvegarde dans `backups/` et supprime celles de plus de 30 jours. `restore.sh` la restaure dans une nouvelle base `studio_riff_restore`, puis compare le nombre de lignes de chaque table avec la base d'origine.

## Commandes utiles

```bash
docker compose ps                                          # état des conteneurs
docker compose exec postgres psql -U studio -d studio_riff # console SQL
docker compose exec valkey valkey-cli KEYS '*'             # clés du cache
docker compose down                                        # arrêter (garde les données)
docker compose down -v                                     # arrêter et supprimer les données
```
