CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE rooms (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  capacity int  NOT NULL CHECK (capacity > 0)
);

CREATE TABLE room_maintenances (
  id        serial PRIMARY KEY,
  room_id   text NOT NULL REFERENCES rooms(id),
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE TABLE members (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE bookings (
  id           text PRIMARY KEY,
  room_id      text NOT NULL REFERENCES rooms(id),
  member_id    text NOT NULL REFERENCES members(id),
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed', 'cancelled', 'late_cancelled')),
  cancelled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  -- '[)' : début inclus, fin exclue donc 18h-20h et 20h-22h sont acceptées
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);
