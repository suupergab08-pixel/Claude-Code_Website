const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const KIE_API_KEY = process.env.KIE_API_KEY || '9837ed515038aab8ee1ac68c6c60f92e';

// Generate design prompts from idea/theme/products using Groq
router.post('/generate', async (req, res) => {
  try {
    const { idea, theme, products } = req.body;
    if (!idea) return res.status(400).json({ error: 'Idea is required' });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a world-class visual designer and creative director. Generate exactly 4 image generation prompts for a moodboard. Each prompt should be detailed, vivid, and optimized for AI image generation (Flux/Midjourney style). Include lighting, composition, color palette, mood, and style details. Return ONLY a JSON array of 4 objects with "title" (short 3-5 word label) and "prompt" (the full image prompt, 80-150 words). No markdown, no explanation, just the JSON array.`
        },
        {
          role: 'user',
          content: `Create 4 moodboard image prompts for:\n- Idea: ${idea}\n- Theme: ${theme || 'not specified'}\n- Products: ${products || 'not specified'}`
        }
      ],
      temperature: 0.9,
      max_tokens: 2000,
    });

    const text = completion.choices[0]?.message?.content || '[]';
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const prompts = match ? JSON.parse(match[0]) : [];

    res.json({ prompts });
  } catch (err) {
    console.error('Prompt generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate image via kie.ai API (OpenAI 4o — most reliable)
router.post('/image', async (req, res) => {
  try {
    const { prompt, aspect_ratio = '3:2' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // Map common ratios to OpenAI 4o supported sizes
    const sizeMap = { '16:9': '3:2', '1:1': '1:1', '9:16': '2:3', '3:2': '3:2', '2:3': '2:3' };
    const size = sizeMap[aspect_ratio] || '3:2';

    const response = await fetch(`${KIE_API_BASE}/gpt4o-image/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        size,
        nVariants: 1,
        enableFallback: true,
        fallbackModel: 'FLUX_MAX',
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'kie.ai API error');

    res.json({ taskId: data.data?.taskId, status: 'pending' });
  } catch (err) {
    console.error('Image generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Check image generation status
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    // Try gpt4o-image endpoint first, fallback to jobs
    const response = await fetch(`${KIE_API_BASE}/gpt4o-image/record-info?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Status check failed');

    const taskData = data.data || {};
    const resultUrls = taskData.response?.resultUrls || [];
    const state = taskData.state || taskData.status || 'pending';
    const isDone = taskData.successFlag === 1 || state === 'SUCCESS';
    const isFailed = taskData.successFlag === 3 || state === 'fail';

    res.json({
      status: isDone ? 'completed' : isFailed ? 'failed' : 'pending',
      imageUrl: resultUrls[0] || null,
      allImages: resultUrls,
      progress: taskData.progress || null,
      error: taskData.failMsg || null,
    });
  } catch (err) {
    console.error('Status check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
