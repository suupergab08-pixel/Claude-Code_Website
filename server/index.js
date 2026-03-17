const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/contact', require('./routes/contact'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/webhook', require('./routes/webhook'));

// Interactions log
app.get('/api/interactions', async (req, res) => {
  const supabase = require('./supabase');
  const { email, event_type, limit: lim } = req.query;
  let query = supabase.from('interactions').select('*').order('created_at', { ascending: false }).limit(parseInt(lim) || 100);
  if (email) query = query.eq('email', email.toLowerCase());
  if (event_type) query = query.eq('event_type', event_type);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Engagement summary per email
app.get('/api/interactions/summary/:email', async (req, res) => {
  const supabase = require('./supabase');
  const email = req.params.email.toLowerCase();
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const summary = {
    email,
    total_interactions: data.length,
    events: data.map(d => ({ event: d.event_type, details: d.details, at: d.created_at })),
    first_seen: data[0]?.created_at || null,
    last_seen: data[data.length - 1]?.created_at || null,
  };
  res.json(summary);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'supabase', timestamp: new Date().toISOString() });
});

// Manually trigger follow-ups
app.post('/api/followups/run', async (req, res) => {
  const { runFollowups } = require('./followup');
  await runFollowups();
  res.json({ status: 'success', message: 'Follow-up check complete' });
});

// Get follow-up log
app.get('/api/followups', async (req, res) => {
  const supabase = require('./supabase');
  const { data, error } = await supabase
    .from('followup_log')
    .select('*')
    .order('sent_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Start server (local only — Vercel uses module.exports)
if (require.main === module) {
  const { runFollowups } = require('./followup');
  setInterval(() => {
    runFollowups().catch(err => console.error('Scheduled follow-up error:', err.message));
  }, 24 * 60 * 60 * 1000);
  setTimeout(() => runFollowups().catch(() => {}), 30000);

  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;
