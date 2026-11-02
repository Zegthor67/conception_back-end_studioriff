# DECISIONS : Studio Riff

Dans ce document, j'explique comment j'ai organisé le projet avant de commencer à coder : à quel endroit se trouve chaque règle métier, comment les couches sont découpées et à quoi ressemble le modèle de la base de données. Les trois ADR sont à la fin.

Pour la stack, j'utilise Node.js avec Express (en JavaScript), PostgreSQL 17, et Valkey pour le cache qui arrivera plus tard. Le choix entre un driver simple et un ORM est justifié dans l'ADR-003.

## Les couches

J'ai découpé l'application en quatre couches. Les dépendances pointent toujours vers le domaine, jamais dans l'autre sens.

```
   +------------------------------------------+
   |  HTTP (routes Express)                   |
   |  lit la requete, appelle un use case,    |
   |  transforme les erreurs en codes HTTP    |
   +--------------------+---------------------+
                        |
                        v
   +------------------------------------------+
   |  Application (use cases)                 |
   |  bookRoom, cancelBooking, getSchedule... |
   |  ouvre la transaction, charge les objets |
   |  via les repositories, appelle le domaine|
   +--------------------+---------------------+
                        |
                        v
   +------------------------------------------+
   |  Domaine                                 |
   |  fonctions pures sur les reservations,   |
   |  les creneaux, la maintenance, erreurs   |
   |  -> aucune dependance a Express ou SQL   |
   +------------------------------------------+
                        ^
                        | utilise les erreurs du domaine
   +--------------------+---------------------+
   |  Infrastructure                          |
   |  repositories PostgreSQL (pg), horloge   |
   |  systeme, cache Valkey (etape 6)         |
   +------------------------------------------+
```

Le domaine ne sait rien de la base de données. Il est composé de fonctions qui prennent des objets simples en entrée (une réservation, une liste de réservations, l'heure actuelle) et qui renvoient un résultat, ou lèvent une erreur si une règle n'est pas respectée.

Les use cases reçoivent l'horloge en paramètre, qui n'est rien d'autre qu'un objet `{ now() }`, et importent directement les repositories. L'intérêt, c'est que dans les tests unitaires je peux passer une fausse horloge bloquée au lundi 2 novembre 2026 à 9h, sans avoir besoin de lancer Postgres.

Les routes, elles, ne contiennent aucune règle métier. Elles lisent le JSON, appellent le use case et renvoient la réponse. La conversion des erreurs du domaine en codes HTTP se fait à un seul endroit, dans un middleware d'erreur Express.

## Où se trouve chaque règle

### 1. Un créneau dure entre 1h et 4h, commence à une heure pile, entre 10h et 23h

Cette règle est dans le domaine, dans une fonction `validateSlot(start, end, now)` qui lève une erreur si le créneau n'est pas valide.

Elle vérifie que `start` et `end` tombent sur une heure pile (minutes, secondes et millisecondes à 0), que la durée est de 1, 2, 3 ou 4 heures, et enfin que `start` est à 10h ou après et que `end` est au plus tard à 23h00 le même jour que `start`. Un créneau qui commence avant `now` est refusé avec un 400.

La condition sur le même jour est importante. Sans elle, un créneau de 22h à 2h du matin serait accepté, puisque 2 est bien inférieur à 23. En comparant `end` à 23h00 le jour de `start`, ce cas est correctement refusé.

Le sujet dit que le créneau « commence entre 10h et 23h ». J'ai interprété ça comme le fait que tout le créneau doit tenir dans cette plage, ce qui veut dire que le dernier départ possible pour une heure de réservation est 22h. Cette lecture me paraît cohérente avec le script de l'étape 5, qui génère des créneaux entre 10h et 23h.

J'ai mis cette règle dans le domaine parce qu'elle ne dépend que des deux dates et de l'heure actuelle passée en paramètre : c'est une règle pure, donc facile à tester avec la fausse horloge. Je ne l'ai pas dupliquée en `CHECK` dans la base. Côté SQL, je vérifie seulement `end_at > start_at`, pour éviter d'avoir la même règle écrite à deux endroits et qu'elles finissent par ne plus correspondre.

En cas d'erreur, l'API renvoie un 400.

### 2. Pas de chevauchement sur une même salle, même avec deux requêtes simultanées

Cette règle est volontairement présente à deux endroits.

D'abord dans le use case : avant l'insertion, je vérifie s'il existe déjà une réservation confirmée qui chevauche le créneau demandé. Dans la très grande majorité des cas, ça permet de renvoyer un 409 propre.

Ensuite dans la base, avec une contrainte d'exclusion sur `(room_id, tstzrange(start_at, end_at, '[)'))` grâce à l'extension `btree_gist`, appliquée uniquement aux réservations `confirmed`.

La vérification côté code ne suffit pas à elle seule. Si deux requêtes arrivent exactement en même temps, elles peuvent toutes les deux lire que la salle est libre et toutes les deux insérer leur réservation. La contrainte d'exclusion, elle, ne peut pas être contournée de cette façon. Quand elle bloque une insertion, Postgres renvoie l'erreur `23P01`. Le repository l'intercepte et la transforme en erreur du domaine, ce qui donne au final un 409, comme dans le premier cas.

La notation `'[)'` signifie que la borne de début est incluse et que la borne de fin est exclue. Un créneau de 18h à 20h et un autre de 20h à 22h ne se chevauchent donc pas, ce qui respecte la règle selon laquelle un créneau peut commencer à l'heure exacte où le précédent se termine.

Le `WHERE status = 'confirmed'` sur la contrainte permet qu'une réservation annulée libère bien la salle.

### 3. Un membre a au maximum 2 réservations à venir

C'est la règle la plus délicate, parce qu'elle porte sur plusieurs lignes à la fois, et une contrainte SQL classique ne sait pas compter des lignes.

J'ai défini une réservation « à venir » comme une réservation au statut `confirmed` dont le début est postérieur à l'instant présent. Une réservation déjà commencée ou terminée n'est donc pas comptée.

La solution retenue (détaillée dans l'ADR-001) fonctionne de la manière suivante. La règle elle-même est dans le domaine, dans une fonction `checkMemberLimit(memberBookings, now)`. Elle reçoit les réservations du membre et l'heure actuelle, ne garde que celles qui sont confirmées et qui commencent après `now`, puis lève une erreur s'il y en a déjà deux. Le calcul de « à venir » se fait donc dans le domaine, avec l'horloge passée en paramètre, et non dans le SQL.

De son côté, le use case `bookRoom` ouvre une transaction et verrouille la ligne du membre avec `SELECT ... FROM members WHERE id = $1 FOR UPDATE` avant de charger ses réservations. Si un même membre envoie deux requêtes en même temps, la seconde attend que la première soit validée, et elle compte alors bien 2 réservations au lieu d'une.

En cas d'erreur, l'API renvoie un 409.

### 4. Annulation : `cancelled` ou `late_cancelled`, et jamais deux fois

Cette règle est dans le domaine, dans une fonction `cancelBooking(booking, now)` qui renvoie le nouveau statut. Si la réservation n'est pas `confirmed`, elle lève une erreur (409). Si le début est dans moins de 24h, le statut devient `late_cancelled`, et sinon il devient `cancelled`.

Une réservation n'est jamais supprimée. On met simplement à jour son statut et on enregistre la date d'annulation dans `cancelled_at`. La route `DELETE` renvoie un 204, mais la ligne reste bien en base.

Pour le cas limite où l'annulation a lieu exactement 24h avant, j'ai considéré qu'elle n'était pas tardive, puisque le sujet parle de « moins de 24h », donc strictement moins. Avec l'horloge utilisée dans les tests, booking-3 (le 2 novembre à 19h) commence dix heures plus tard : elle passe donc en `late_cancelled`.

Le sujet ne précise pas ce qu'il faut faire si on essaie d'annuler une réservation qui a déjà commencé. J'ai choisi de refuser dès que le début est passé, c'est-à-dire quand `start <= now`, avec un 409. Ça couvre aussi le cas d'une réservation en cours : par exemple, annuler à 19h30 un créneau de 19h à 21h est refusé, puisque la séance a déjà démarré.

Pour gérer deux annulations simultanées de la même réservation, le use case la charge avec `FOR UPDATE`. La seconde requête voit alors le statut déjà modifié et reçoit un 409.

### 5. Une salle en maintenance refuse les réservations qui la chevauchent

Cette règle est dans le domaine, avec une fonction `checkMaintenance(maintenances, start, end)` qui reçoit les périodes de maintenance de la salle. La logique de chevauchement est la même que pour les réservations, avec la fin exclue. Par exemple, pour la salle Björk, en maintenance du 5 novembre à 0h au 8 novembre à 0h, un créneau le 4 novembre de 21h à 23h est accepté, alors qu'un créneau le 5 novembre de 14h à 16h est refusé.

Aucun verrou n'est nécessaire ici : il n'existe pas de route pour créer une maintenance, donc elles ne peuvent pas changer pendant une réservation.

En cas d'erreur, l'API renvoie un 409, car la requête est correcte en soi : c'est l'état de la salle qui empêche la réservation.

### 6. Toutes les heures sont en UTC

Il s'agit plutôt d'une règle technique, et elle est appliquée à plusieurs niveaux.

En base, les colonnes sont en `timestamptz` et la connexion Postgres est configurée avec `timezone = UTC`. Côté JavaScript, je travaille avec des objets `Date` en utilisant uniquement les méthodes UTC (`getUTCHours()`, etc.), et jamais `getHours()`, qui dépend du fuseau de la machine.

En entrée, j'accepte uniquement le format ISO terminé par `Z`, sinon je renvoie un 400. Ça évite qu'un client envoie une date en `+01:00` en pensant qu'elle sera prise en compte.

En sortie, les dates sont toujours renvoyées au format demandé dans le sujet, c'est-à-dire `2026-11-04T14:00:00Z`. Il faut faire attention, car `toISOString()` renvoie `2026-11-04T14:00:00.000Z` : je retire donc les millisecondes.

## Le planning d'une salle

La route `GET /rooms/:id/bookings?from=…&to=…` renvoie uniquement les réservations `confirmed` qui chevauchent la période demandée (`start_at < to` et `end_at > from`), triées par date de début. Une réservation annulée n'a pas sa place dans un planning. C'est aussi cette requête qui sera mesurée à l'étape 5.

Si `from` n'est pas fourni, je prends l'heure actuelle donnée par l'horloge, arrondie à l'heure pile pour que le cache puisse servir la même clé pendant toute l'heure. Si `to` n'est pas fourni, je prends `from + 7 jours`. Si l'une des deux dates est mal formée, l'API renvoie un 400.

## Les codes HTTP

Pour résumer, je renvoie un 400 quand la requête elle-même est fausse : JSON invalide, champ manquant, date mal formée, créneau qui ne respecte pas la règle 1, ou `memberId` qui n'existe pas dans le body. Le 404 est réservé aux cas où la salle, la réservation ou le membre indiqué dans l'URL est inconnu. Enfin, le 409 sert pour tout ce qui est bloqué par l'état actuel des données : chevauchement, limite de 2 réservations atteinte, salle en maintenance, ou annulation d'une réservation déjà annulée ou déjà commencée.

Pour le `memberId` inconnu, j'ai hésité avec un 404. J'ai finalement choisi le 400, parce que le 404 concerne la ressource visée par l'URL, alors qu'ici c'est le contenu du body qui est incorrect.

## Modèle relationnel

```
rooms
  id          text PK            -- 'room-1'
  name        text not null
  capacity    int not null  check (capacity > 0)

room_maintenances
  id          serial PK
  room_id     text not null FK -> rooms.id
  starts_at   timestamptz not null
  ends_at     timestamptz not null
  check (ends_at > starts_at)

members
  id          text PK            -- 'member-1'
  name        text not null

bookings
  id          text PK            -- 'booking-1' pour les données de départ, uuid pour les nouvelles
  room_id     text not null FK -> rooms.id
  member_id   text not null FK -> members.id
  start_at    timestamptz not null
  end_at      timestamptz not null
  status      text not null default 'confirmed'
              check (status in ('confirmed', 'cancelled', 'late_cancelled'))
  cancelled_at timestamptz null
  created_at  timestamptz not null default now()
  check (end_at > start_at)
  exclude using gist (room_id with =, tstzrange(start_at, end_at, '[)') with &&)
    where (status = 'confirmed')
```

```
rooms 1 ---- * bookings * ---- 1 members
  |
  1
  |
  *
room_maintenances
```

Les identifiants sont en `text` parce que les données de départ utilisent des id comme `room-1` ou `booking-1`, et que le contrat de l'API renvoie des chaînes de caractères.

J'ai mis la maintenance dans une table séparée plutôt que dans deux colonnes de `rooms`. Pour l'instant seule la salle Björk a une période de maintenance, mais une salle peut très bien en avoir plusieurs dans l'année.

La première migration contient `CREATE EXTENSION IF NOT EXISTS btree_gist`, sinon la contrainte d'exclusion ne peut pas être créée (l'opérateur `=` sur du `text` a besoin de cette extension dans un index GiST). L'index qui accélère le planning d'une salle sera ajouté à l'étape 5, une fois les mesures faites.

## ADR-001 : où placer la limite de 2 réservations à venir

Contexte : cette règle porte sur l'ensemble des réservations d'un membre. Si un membre qui a déjà une réservation envoie deux requêtes en même temps, chacune compte une seule réservation existante, et les deux sont acceptées. Le membre se retrouve alors avec trois réservations.

J'ai regardé plusieurs options. La première, c'est de faire la vérification uniquement dans le code, sans verrou : c'est simple, mais ça devient faux dès qu'il y a de la concurrence.

La deuxième, c'est un trigger Postgres qui compte les réservations avant l'insertion. Le problème, c'est que la notion de « à venir » dépend de l'heure actuelle, qui serait `now()` dans le trigger, donc l'heure du système. Ça ne respecte plus la consigne de l'horloge passée en paramètre, et je ne pourrais plus fixer l'heure au 2 novembre à 9h dans les tests. En plus, la règle se retrouverait en SQL, en dehors du domaine.

La troisième, c'est de passer la transaction en `SERIALIZABLE`. Ça fonctionne, mais il faut gérer les erreurs de sérialisation et rejouer les transactions, ce qui est assez lourd pour un seul cas.

La dernière, c'est de poser un verrou pessimiste sur la ligne du membre (`SELECT ... FOR UPDATE`) dans le use case, puis de charger ses réservations et d'appliquer la règle du domaine.

Décision : j'ai retenu cette dernière option. Le verrou est dans la couche application, puisqu'il relève de la gestion des transactions et pas du métier, et la règle de comptage reste dans le domaine avec l'horloge injectée.

Conséquences : deux réservations simultanées d'un même membre sont traitées l'une après l'autre, ce qui ne pose aucun problème de performance pour une association de quelques dizaines de membres. Les réservations de membres différents, elles, ne se bloquent pas entre elles. Il faut par contre penser à prendre ce verrou dans tous les use cases qui créent une réservation ; pour l'instant il n'y en a qu'un, donc le risque reste limité. Enfin, la base ne garantit pas cette règle toute seule : quelqu'un qui insère des lignes directement en SQL peut dépasser la limite. J'accepte ce compromis, contrairement au chevauchement qui lui est protégé au niveau de la base.

## ADR-002 : pas de CQRS ni d'event sourcing

Contexte : le sujet précise que les annulations doivent « rester enregistrées », et le planning est une lecture très sollicitée qui sera mise en cache. On pourrait donc être tenté de séparer la lecture et l'écriture (CQRS), voire de stocker des événements (`BookingCreated`, `BookingCancelled`) plutôt que l'état courant.

Décision : je ne le fais pas. Il n'y a qu'un seul modèle, avec une table `bookings` et un statut.

Pour garder la trace d'une annulation, un statut et une colonne `cancelled_at` suffisent, on n'a pas besoin de pouvoir rejouer tout l'historique d'une réservation. Le planning, lui, est une simple requête filtrée par salle et par dates, ce qui ne justifie pas un modèle de lecture séparé ; le cache Valkey de l'étape 6 suffira à soulager la base.

Il y a aussi un vrai risque avec l'event sourcing : la contrainte d'exclusion deviendrait compliquée à appliquer, puisqu'il faudrait maintenir une projection à jour de manière synchrone. On risquerait de perdre la garantie la plus importante du sujet. Et pour 4 salles et 3 membres, ajouter un bus de commandes, des projections et des handlers ferait beaucoup de code pour pas grand-chose, ce qui n'est pas réaliste en 4h.

Conséquences : si l'association a besoin un jour de statistiques plus détaillées sur l'historique (qui a annulé quoi, quand, et combien de fois), il sera possible d'ajouter une table d'audit à côté, sans remettre en cause le reste.

## ADR-003 : le driver `pg` avec du SQL écrit à la main, sans ORM

Contexte : il faut accéder à PostgreSQL depuis Node.js. Trois choix sont possibles : un ORM (Prisma, Sequelize), un query builder (Knex), ou le driver `pg` seul.

Décision : j'utilise directement `pg`, avec des requêtes SQL paramétrées (`$1`, `$2`). Les paramètres sont envoyés à part de la requête, ce qui protège contre l'injection SQL.

Pourquoi : le projet s'appuie sur des fonctionnalités propres à PostgreSQL, comme `tstzrange`, la contrainte `EXCLUDE USING gist` et `SELECT ... FOR UPDATE`. Les ORM les gèrent mal, et il faudrait de toute façon écrire du SQL brut pour ces parties. Avec 4 tables et une dizaine de requêtes, un ORM ajouterait de la configuration sans rien simplifier. Enfin, avec `pg`, je sais exactement quelle requête est exécutée, ce qui sera utile pour la mesurer avec `EXPLAIN ANALYZE` à l'étape 5.

Conséquences : les migrations sont de simples fichiers `.sql`, appliqués dans l'ordre par un petit script (`scripts/migrate.js`) qui retient ceux déjà passés dans une table `schema_migrations`. Je dois convertir moi-même les lignes de la base (`start_at`, `room_id`) en objets JSON (`start`, `roomId`). Rien ne vérifie le SQL avant son exécution : ce sont les tests qui détectent une requête fausse.