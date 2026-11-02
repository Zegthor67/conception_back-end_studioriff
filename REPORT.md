# REPORT : Studio Riff

## 1. Mesure d'une requête

### La requête mesurée

Le planning de la salle `room-1` sur une semaine, comme dans `GET /rooms/:id/bookings` :

```sql
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, room_id, member_id, start_at, end_at, status
FROM bookings
WHERE room_id = 'room-1'
  AND status = 'confirmed'
  AND start_at < '2028-03-08 00:00+00'
  AND end_at > '2028-03-01 00:00+00'
ORDER BY start_at;
```

La table contient 100 000 réservations générées avec `sql/generate-bookings.sql`.

### Avant l'index

```
 Sort (actual time=10.782..10.787 rows=91 loops=1)
   Sort Key: start_at
   Sort Method: quicksort  Memory: 32kB
   ->  Seq Scan on bookings (actual time=2.402..10.706 rows=91 loops=1)
         Filter: ((start_at < '2028-03-08 00:00:00+00'::timestamp with time zone) AND (end_at > '2028-03-01 00:00:00+00'::timestamp with time zone) AND (room_id = 'room-1'::text) AND (status = 'confirmed'::text))
         Rows Removed by Filter: 99913
 Planning Time: 0.450 ms
 Execution Time: 10.881 ms
(8 rows)
```

### Après l'index

Index ajouté par la migration `migrations/002_index_bookings_room_start.sql` :

```sql
CREATE INDEX bookings_room_start ON bookings (room_id, start_at);
```

```
 Sort (actual time=4.342..4.347 rows=91 loops=1)
   Sort Key: start_at
   Sort Method: quicksort  Memory: 32kB
   ->  Bitmap Heap Scan on bookings (actual time=4.200..4.270 rows=91 loops=1)
         Recheck Cond: ((room_id = 'room-1'::text) AND (start_at < '2028-03-08 00:00:00+00'::timestamp with time zone))
         Filter: ((end_at > '2028-03-01 00:00:00+00'::timestamp with time zone) AND (status = 'confirmed'::text))
         Rows Removed by Filter: 5526
         Heap Blocks: exact=277
         ->  Bitmap Index Scan on bookings_room_start (actual time=0.498..0.499 rows=5617 loops=1)
               Index Cond: ((room_id = 'room-1'::text) AND (start_at < '2028-03-08 00:00:00+00'::timestamp with time zone))
 Planning Time: 1.690 ms
 Execution Time: 4.433 ms
(12 rows)
```

### Analyse

| | Avant l'index | Après l'index |
|---|---|---|
| Lecture de la table | `Seq Scan` (toute la table) | `Bitmap Index Scan` sur `bookings_room_start` |
| Lignes lues puis jetées | 99 913 | 5 526 |
| Lignes renvoyées | 91 | 91 |
| Temps d'exécution | 10,881 ms | 4,433 ms |

Avant l'index, PostgreSQL lit les 100 000 lignes de la table pour n'en garder que 91 : presque tout le travail est perdu. Après l'index, il va directement chercher les lignes de `room-1` qui commencent avant la fin de la semaine. Il n'en lit plus que 5 617, soit environ 18 fois moins, et le temps d'exécution est divisé par 2,5.

Les deux temps restent de l'ordre de la milliseconde, parce que 100 000 lignes tiennent en mémoire. Ce qui compte, c'est que le coût ne dépend plus de la taille de toute la table : sans index, le planning ralentit à chaque nouvelle réservation, quelle que soit la salle.

L'index n'est pas encore parfait : il filtre sur `start_at < fin de la semaine`, donc il ramène toutes les réservations de `room-1` depuis le début des données, et c'est le `Filter` sur `end_at` qui en jette 5 526. Comme un créneau dure au plus 4 h, on pourrait ajouter à la requête `start_at >= from - 4 h` : l'index ne lirait alors que les réservations de la semaine.

## 2. Cache clé-valeur (Valkey)

### Ce qui est mis en cache

Seule la réponse de `GET /rooms/:id/bookings` (le planning) est mise en cache. C'est la ressource la plus consultée, et elle ne change qu'à chaque réservation ou annulation.

| | Choix |
|---|---|
| Clé | `schedule:{roomId}`, par exemple `schedule:room-1` |
| Type | un hash : un champ par période demandée, `{from}\|{to}`, qui contient la liste des réservations en JSON |
| Durée de vie | 5 minutes (`EXPIRE 300`), remise à zéro à chaque écriture |
| Suppression | `DEL schedule:{roomId}` juste après le `COMMIT` d'une réservation ou d'une annulation dans cette salle |

Une clé par salle, plutôt qu'une clé par salle et par période, permet d'invalider tout le planning d'une salle avec une seule commande `DEL`, quelle que soit la période demandée par les membres. Une réservation dans `room-1` ne touche pas au cache des autres salles.

Quand `from` n'est pas fourni, il vaut l'heure actuelle **arrondie à l'heure pile**. Sinon, chaque appel aurait un `from` différent à la milliseconde près, et le cache ne servirait jamais. Le résultat reste le même, puisque tous les créneaux se terminent à une heure pile.

### Pourquoi 5 minutes

Le planning est toujours à jour grâce à la suppression explicite. La durée de vie sert seulement de filet de sécurité : si une donnée est modifiée en dehors de l'API (par exemple une correction faite à la main en SQL), le cache se corrige tout seul en 5 minutes au plus. Une durée plus longue n'apporterait presque rien, puisque recalculer un planning prend quelques millisecondes.

### Si Valkey est indisponible

Chaque appel au cache est dans un `try/catch` : une erreur est traitée comme « rien en cache ». L'API lit alors PostgreSQL et répond normalement. Chaque appel est aussi coupé au bout de 200 ms : sous Windows, une connexion vers un port fermé met 1 à 2 secondes à échouer, et sans cette limite chaque requête serait ralentie d'autant quand Valkey est arrêté. Le test `tests/http/cacheDown.test.js` le vérifie en pointant l'application vers un port où rien n'écoute.

Limite connue : si Valkey est injoignable au moment d'une réservation mais revient ensuite avec ses anciennes données, la suppression n'a pas eu lieu, et le planning peut être faux pendant 5 minutes au plus. C'est une autre raison de garder une durée de vie courte.

### Répartition des données entre PostgreSQL et Valkey

**Dans PostgreSQL** : tout ce qui est une donnée de référence, c'est-à-dire les salles, les maintenances, les membres et les réservations, y compris celles qui sont annulées. Ce sont les données qu'on ne peut pas perdre et sur lesquelles reposent les règles métier. PostgreSQL apporte ce que Valkey n'a pas : les transactions, les verrous (`FOR UPDATE`), les clés étrangères, les `CHECK`, la contrainte d'exclusion contre le chevauchement, et une écriture durable sur disque.

**Dans Valkey** : seulement des copies qu'on peut recalculer, ici le planning. Si Valkey perd tout, il n'y a aucune perte de données : le prochain appel relit PostgreSQL. D'autres usages auraient leur place dans Valkey s'ils existaient : des sessions de connexion, un compteur de requêtes pour limiter les abus.

**Les réservations pourraient-elles être stockées dans Valkey ?** Non. Le problème de départ de Studio Riff, c'est deux groupes dans la même salle le même soir. Pour l'éviter, il faut que la base refuse elle-même deux réservations qui se chevauchent, même quand deux requêtes arrivent en même temps. Valkey ne sait pas faire de contrainte d'exclusion, ni de transaction qui lit puis écrit en toute sécurité, ni de requête « toutes les réservations qui chevauchent cette période ». Il faudrait tout recoder dans l'application, avec les mêmes problèmes de concurrence que le tableur partagé. Et par défaut, Valkey garde les données en mémoire : un redémarrage peut faire perdre les dernières écritures.

**À l'échelle de Studio Riff**, il y a 4 salles, quelques groupes et quelques dizaines de réservations par semaine. PostgreSQL répond au planning en quelques millisecondes, même avec 100 000 réservations et l'index de la partie 1. Le cache n'est donc pas indispensable aujourd'hui : il est là parce que le sujet le demande, et il est conçu pour ne jamais être une source de vérité. Pour une association de cette taille, on pourrait très bien s'en passer et faire tourner un seul service de base de données, ce qui ferait un composant de moins à surveiller et à sauvegarder.

## 3. Sauvegarde et restauration

### Les scripts

- `backup.sh` lance `pg_dump -Fc` dans le conteneur PostgreSQL et écrit le fichier dans `backups/studio_riff_AAAAMMJJ_HHMMSS.dump`. Il supprime ensuite les sauvegardes de plus de 30 jours.
- `restore.sh backups/fichier.dump` crée une **nouvelle** base `studio_riff_restore`, y restaure la sauvegarde avec `pg_restore`, puis compare le nombre de lignes de chaque table avec la base d'origine. Il refuse de restaurer dans la base d'origine.

Valkey n'est pas sauvegardé : il ne contient que du cache, qui se reconstruit tout seul à partir de PostgreSQL.

### Preuve de la restauration

```
$ ./restore.sh backups/studio_riff_20261102_152616.dump
Sauvegarde backups/studio_riff_20261102_152616.dump restaurée dans la base studio_riff_restore

table                 studio_riff studio_riff_restore
rooms                           4            4
room_maintenances               1            1
members                         3            3
bookings                        5            5
schema_migrations               2            2
```

La sauvegarde a été restaurée dans une nouvelle base, `studio_riff_restore`, sans toucher à `studio_riff`. Chaque table a le même nombre de lignes des deux côtés. La table `bookings` contient 5 lignes : les 4 réservations de départ, plus une réservation créée pendant les essais manuels de l'API.

### RPO, RTO et rétention

| | Valeur | Pourquoi |
|---|---|---|
| **RPO** (perte de données maximale) | 24 h | Une sauvegarde par nuit. Studio Riff reçoit quelques réservations par jour : en cas de panne, on perd au pire celles de la journée. Les groupes concernés peuvent réserver de nouveau, et on peut les retrouver avec l'historique des messages ou des mails. Une sauvegarde toutes les heures, ou une réplication continue comme dans une banque, demanderait une infrastructure qu'une association de bénévoles ne peut pas surveiller. |
| **RTO** (durée maximale d'indisponibilité) | 4 h | Techniquement, la restauration prend moins d'une minute (voir ci-dessus). Le vrai délai, c'est le temps qu'un bénévole voie la panne et lance `restore.sh`. 4 h permettent de réparer dans la journée, avant les répétitions du soir. En attendant, les réservations peuvent se prendre par téléphone. |
| **Rétention** | 30 jours | Une sauvegarde par jour gardée 30 jours, soit 30 fichiers de quelques kilo-octets. Ça laisse le temps de remarquer une erreur passée inaperçue (une réservation supprimée à la main, une mauvaise manipulation en SQL) et de revenir avant. Au-delà, les réservations sont passées et n'ont plus d'intérêt pour l'association. |

Pour que la sauvegarde survive à la perte de l'ordinateur, le dossier `backups/` doit aussi être copié ailleurs, par exemple sur le drive de l'association. Le lancement automatique chaque nuit se ferait avec une tâche planifiée (cron sous Linux, Planificateur de tâches sous Windows).
