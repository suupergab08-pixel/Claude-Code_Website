const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { trackInteraction } = require('../track');

// POST /api/webhook/resend — Handle Resend email events
router.post('/resend', async (req, res) => {
  try {
    const { type, data } = req.body;
    const emailId = data?.email_id;

    if (!emailId) return res.json({ received: true });

    console.log(`Webhook: ${type} for email ${emailId}`);

    const recipientEmail = data?.to?.[0] || 'unknown';

    if (type === 'email.delivered') {
      await supabase.from('contacts').update({ email_delivered: true }).eq('email_id', emailId);
      await trackInteraction(recipientEmail, 'email_delivered', { email_id: emailId });
    }

    if (type === 'email.opened') {
      await supabase.from('contacts').update({ email_opened: true }).eq('email_id', emailId);
      await supabase.from('users').update({ welcome_email_opened: true }).eq('email_id', emailId);
      await supabase.from('followup_log').update({ status: 'opened' }).eq('email_id', emailId);
      await trackInteraction(recipientEmail, 'email_opened', { email_id: emailId });
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.json({ received: true });
  }
});

module.exports = router;
