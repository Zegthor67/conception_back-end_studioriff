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
