const { createApp } = require('./http/app');
const { systemClock } = require('./infrastructure/clock');

const PORT = process.env.PORT || 3000;

createApp({ clock: systemClock }).listen(PORT, () => {
  console.log(`API Studio Riff sur http://localhost:${PORT}`);
});
