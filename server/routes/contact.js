const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { sendContactConfirmation } = require('../email');
const { trackInteraction } = require('../track');

// POST /api/contact — Submit contact form
router.post('/', async (req, res) => {
  try {
    const { name, email, message, newsletter_subscribed } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name,
        email: email.toLowerCase(),
        message,
        newsletter_subscribed: newsletter_subscribed || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error.message);
      return res.status(500).json({ error: 'Failed to save contact' });
    }

    // Track form submission
    await trackInteraction(email, 'form_submitted', { name, message, contact_id: data.id }, 'website');

    // Send confirmation email and store the email ID
    const emailId = await sendContactConfirmation({ name, email, message });
    if (emailId) {
      await supabase.from('contacts').update({ email_id: emailId }).eq('id', data.id);
      await trackInteraction(email, 'email_sent', { email_id: emailId, type: 'contact_confirmation' });
    }

    // If user opted into newsletter, add to newsletter table
    if (newsletter_subscribed) {
      await supabase
        .from('newsletter')
        .upsert({ email: email.toLowerCase() }, { onConflict: 'email' });
      await trackInteraction(email, 'newsletter_subscribed', { source: 'contact_form' });
    }

    // Also send to Google Sheets (fire and forget)
    const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw_I5NLSjPX3y_hPEcmNN7wZkYsWdcYec5UD4amsQ0DBOnGbxLrR_KWF1dGFkBL7L0skA/exec';
    fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ name, email, message }),
    }).catch(() => console.log('Google Sheets sync skipped'));

    res.status(201).json({ status: 'success', id: data.id });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /api/contact — List all submissions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/contact/:id/replied — Mark as replied + auto-subscribe to newsletter
router.patch('/:id/replied', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('contacts')
      .update({
        reply_status: 'replied',
        replied_at: new Date().toISOString(),
        newsletter_subscribed: true,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Contact not found' });

    // Sync subscription across all tables
    await supabase
      .from('newsletter')
      .upsert({ email: data.email }, { onConflict: 'email' });
    await supabase
      .from('users')
      .update({ newsletter_subscribed: true })
      .eq('email', data.email);

    await trackInteraction(data.email, 'replied', { contact_id: id });
    await trackInteraction(data.email, 'newsletter_subscribed', { source: 'reply' });

    res.json({ status: 'success', contact: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/contact/:id/status — Update reply status + sync subscription
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { reply_status } = req.body;

    if (!['pending', 'replied', 'ignored'].includes(reply_status)) {
      return res.status(400).json({ error: 'Invalid status. Use: pending, replied, or ignored' });
    }

    const update = { reply_status };
    if (reply_status === 'replied') {
      update.replied_at = new Date().toISOString();
      update.newsletter_subscribed = true;
    }

    const { data, error } = await supabase
      .from('contacts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Contact not found' });

    // If replied, subscribe across all tables
    if (reply_status === 'replied') {
      await supabase
        .from('newsletter')
        .upsert({ email: data.email }, { onConflict: 'email' });
      await supabase
        .from('users')
        .update({ newsletter_subscribed: true })
        .eq('email', data.email);
      await trackInteraction(data.email, 'replied', { contact_id: id });
      await trackInteraction(data.email, 'newsletter_subscribed', { source: 'reply' });
    }

    await trackInteraction(data.email, 'status_updated', { contact_id: id, reply_status });

    res.json({ status: 'success', contact: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contact/:id/subscribe — Manually opt-in a contact to newsletter
router.post('/:id/subscribe', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('contacts')
      .update({ newsletter_subscribed: true })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Contact not found' });

    // Sync across all tables
    await supabase
      .from('newsletter')
      .upsert({ email: data.email }, { onConflict: 'email' });
    await supabase
      .from('users')
      .update({ newsletter_subscribed: true })
      .eq('email', data.email);

    res.json({ status: 'success', message: `${data.email} subscribed to newsletter` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
