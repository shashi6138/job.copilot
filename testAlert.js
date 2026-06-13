const telegram = require('./src/alerts/telegram');

(async () => {
  await telegram.send(
    '🚀 Job Copilot Pipeline Test\n\nIf you received this message, alerts are working.'
  );

  process.exit(0);
})();