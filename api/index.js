let app;
try {
  app = require('../server/index.js');
} catch (err) {
  app = (req, res) => res.status(500).json({ error: err.message, stack: err.stack });
}
module.exports = app;
