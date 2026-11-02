EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, room_id, member_id, start_at, end_at, status
FROM bookings
WHERE room_id = 'room-1'
  AND status = 'confirmed'
  AND start_at < '2028-03-08 00:00+00'
  AND end_at > '2028-03-01 00:00+00'
ORDER BY start_at;
