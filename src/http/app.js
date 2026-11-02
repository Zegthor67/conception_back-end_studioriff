const express = require('express');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');
const { toUtcString } = require('../domain/dates');
const bookingService = require('../application/bookingService');

function toJson(booking) {
  return { ...booking, start: toUtcString(booking.start), end: toUtcString(booking.end) };
}

function errorHandler(err, req, res, next) {
  if (err instanceof ValidationError || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message });

  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
}

function createApp({ clock }) {
  const app = express();
  app.use(express.json());

  app.get('/rooms', async (req, res) => {
    res.json(await bookingService.listRooms());
  });

  app.get('/rooms/:id/bookings', async (req, res) => {
    const bookings = await bookingService.getRoomSchedule(req.params.id, req.query.from, req.query.to, clock);
    res.json(bookings.map(toJson));
  });

  app.post('/rooms/:id/bookings', async (req, res) => {
    const booking = await bookingService.bookRoom(req.params.id, req.body, clock);
    res.status(201).location(`/bookings/${booking.id}`).json(toJson(booking));
  });

  app.get('/bookings/:id',async (req, res) => {
    res.json(toJson(await bookingService.getBooking(req.params.id)));
  });

  app.get('/members/:id/bookings', async (req, res) => {
    const bookings = await bookingService.listMemberBookings(req.params.id);
    res.json(bookings.map(toJson));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
