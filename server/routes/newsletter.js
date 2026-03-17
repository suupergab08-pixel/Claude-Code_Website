const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { trackInteraction } = require('../track');

// POST /api/newsletter — Subscribe
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { data, error } = await supabase
      .from('newsletter')
      .insert({ email: email.toLowerCase() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Already subscribed' });
      }
      return res.status(500).json({ error: error.message });
    }

    await trackInteraction(email, 'newsletter_subscribed', { source: 'direct' });
    res.status(201).json({ status: 'success', message: 'Subscribed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/newsletter — List subscribers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('newsletter')
      .select('*')
      .order('subscribed_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/newsletter/:email — Toggle subscription
router.patch('/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be true or false' });
    }

    const { data, error } = await supabase
      .from('newsletter')
      .update({ active })
      .eq('email', email)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    // Also update contacts and users tables
    await supabase
      .from('contacts')
      .update({ newsletter_subscribed: active })
      .eq('email', email);

    await supabase
      .from('users')
      .update({ newsletter_subscribed: active })
      .eq('email', email);

    const eventType = active ? 'newsletter_subscribed' : 'newsletter_unsubscribed';
    await trackInteraction(email, eventType, { source: 'toggle' });

    res.json({ status: 'success', subscriber: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
