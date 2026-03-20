const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

router.post('/search', async (req, res) => {
  try {
    const { query, category = 'all' } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a trend analyst and market researcher. Given a topic and category, return exactly 6 current trends as a JSON array. Each trend object must have: "title" (concise trend name), "description" (2-3 sentences explaining the trend and why it matters), "status" (one of: "hot", "rising", "stable"), "relevance" (one of: "Critical", "High", "Medium"), "timeframe" (e.g. "2025-2026"), "category" (the relevant category). Make trends specific, data-informed, and actionable. Return ONLY the JSON array, no markdown or explanation.`
        },
        {
          role: 'user',
          content: `Find 6 current trends for: "${query}". Category focus: ${category}`
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const text = completion.choices[0]?.message?.content || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    const trends = match ? JSON.parse(match[0]) : [];

    res.json({ trends });
  } catch (err) {
    console.error('Trend search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
