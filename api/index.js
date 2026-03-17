const express = require('express');
const app = express();
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasSupabase: !!process.env.SUPABASE_URL,
    hasResend: !!process.env.RESEND_API_KEY,
    hasJwt: !!process.env.JWT_SECRET,
  });
});
module.exports = app;
