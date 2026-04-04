require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const API_KEY = process.env.KIE_AI_API_KEY;
if (!API_KEY) {
  console.error("Error: KIE_AI_API_KEY not set in .env");
  process.exit(1);
}

const args = process.argv.slice(2);
const modelFlag = args.indexOf("--model");
let model = "4o";
if (modelFlag !== -1 && args[modelFlag + 1]) {
  model = args[modelFlag + 1];
  args.splice(modelFlag, 2);
}
const topic = args.join(" ").trim();
if (!topic) {
  console.error('Usage: npm run option-c -- "Your Topic" [--model nano-banana-pro]');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, "..", "output-option-c");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Shared Design System ──
const STYLE = [
  "STRICT DESIGN RULES (apply to every slide in this set):",
  "Background: solid flat dark navy #0F1628, NO gradients, NO patterns, NO noise.",
  "Accent color: single cyan-blue #00B4D8 used for all icons, dividers, and highlights.",
  "Secondary accent: white #FFFFFF for titles and primary text only.",
  "Tertiary text: light gray #B0BEC5 for subtitles and body copy.",
  "Typography: one single geometric sans-serif font throughout (like Montserrat or Inter), bold weight for titles, medium for body.",
  "Layout: 100px top margin, title centered horizontally, content stacked vertically below. Thin 2px cyan horizontal rule below the title.",
  "Icons: simple flat line-art icons in cyan #00B4D8 on transparent, consistent 48px size, 2px stroke weight.",
  "Cards/boxes: rounded rectangles with 1px cyan border, semi-transparent dark fill rgba(0,180,216,0.08), 12px border-radius.",
  "Spacing: generous whitespace, 40px gaps between elements, nothing crowded.",
  "Slide number: small \"01/05\" style indicator in bottom-right corner in gray #546E7A.",
  "No photographs, no 3D renders, no gradients, no glow effects, no drop shadows. Pure flat vector design only.",
  "Portrait orientation 1080x1350.",
].join(" ");

// 5 LinkedIn post frames (1080x1350 portrait)
const FRAMES = [
  {
    name: "post-01-headline",
    prompt: (t) =>
      `${STYLE} LinkedIn carousel slide 1 of 5. Headline slide. Large bold white title text "${t}" centered vertically in the upper third. A single cyan line-art lightbulb icon centered above the title. Small gray subtitle below: "Swipe to learn more." Thin cyan horizontal accent line between icon and title. Slide number "01/05" bottom-right.`,
  },
  {
    name: "post-02-insight",
    prompt: (t) =>
      `${STYLE} LinkedIn carousel slide 2 of 5. Title "Did You Know?" centered at top in white with cyan underline. Content shows exactly 3 data points about "${t}" stacked vertically. Each data point is a card (rounded rectangle, cyan border) containing: a large bold cyan number/stat on the left, and white label text on the right. Cards evenly spaced with 40px gaps. Slide number "02/05" bottom-right.`,
  },
  {
    name: "post-03-breakdown",
    prompt: (t) =>
      `${STYLE} LinkedIn carousel slide 3 of 5. Title "How It Works" centered at top in white with cyan underline. Content shows exactly 4 numbered steps about "${t}" stacked vertically. Each step: a cyan circle with the step number inside, connected by a thin vertical cyan dashed line to the next step. Bold white step title and gray description to the right of each circle. Slide number "03/05" bottom-right.`,
  },
  {
    name: "post-04-comparison",
    prompt: (t) =>
      `${STYLE} LinkedIn carousel slide 4 of 5. Title "Before vs After" centered at top in white with cyan underline. Two columns side by side. Left column header "Before" in gray with a small red-tinted X icon. Right column header "After" in white with a cyan checkmark icon. Each column has 3 text rows inside a card. A vertical cyan dashed divider between columns. Comparison relates to "${t}". Slide number "04/05" bottom-right.`,
  },
  {
    name: "post-05-cta",
    prompt: (t) =>
      `${STYLE} LinkedIn carousel slide 5 of 5. Title "Get Started" centered at top in white with cyan underline. Three benefit bullet points about "${t}" with cyan arrow icons, stacked vertically in cards. Below the bullets, a prominent rounded rectangle button with solid cyan #00B4D8 fill and bold white text "Let's Connect". Small gray text below: "Like, Comment & Share". Slide number "05/05" bottom-right.`,
  },
];

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getEndpoint(model) {
  if (model === "nano-banana-pro") {
    return {
      generate: "https://api.kie.ai/api/v1/nano-banana/generate",
      status: "https://api.kie.ai/api/v1/nano-banana/record-info",
    };
  }
  return {
    generate: "https://api.kie.ai/api/v1/gpt4o-image/generate",
    status: "https://api.kie.ai/api/v1/gpt4o-image/record-info",
  };
}

async function submitTask(prompt) {
  const endpoint = getEndpoint(model);
  const body = JSON.stringify({ prompt, size: "2:3", nVariants: 1 });
  const url = new URL(endpoint.generate);
  const res = await httpRequest(endpoint.generate, {
    method: "POST", hostname: url.hostname, path: url.pathname,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  }, body);
  if (res.code !== 200 || !res.data?.taskId) {
    throw new Error(`Submit failed: ${JSON.stringify(res)}`);
  }
  return res.data.taskId;
}

async function pollTask(taskId) {
  const endpoint = getEndpoint(model);
  const url = new URL(`${endpoint.status}?taskId=${taskId}`);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const res = await httpRequest(url.href, {
      method: "GET", hostname: url.hostname, path: url.pathname + url.search,
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (res.data?.successFlag === 1) {
      const urls = res.data.response?.resultUrls || res.data.response?.result_urls;
      if (urls && urls.length > 0) return urls[0];
    }
    if (res.data?.successFlag === 2) {
      throw new Error(`Task failed: ${res.data.errorMessage}`);
    }
    process.stdout.write(`\r  Polling ${taskId.slice(0, 8)}... ${res.data?.progress || "waiting"}`);
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function main() {
  console.log(`\n  LinkedIn Social Media Kit`);
  console.log(`  Topic: "${topic}"`);
  console.log(`  Model: ${model}`);
  console.log(`  Size: 1080x1350 (portrait)`);
  console.log(`  Output: output-option-c/\n`);

  // Submit all 5
  console.log("  Submitting 5 posts...");
  const tasks = await Promise.all(
    FRAMES.map(async (frame) => {
      const taskId = await submitTask(frame.prompt(topic));
      console.log(`  [submitted] ${frame.name} -> ${taskId.slice(0, 12)}...`);
      return { ...frame, taskId };
    })
  );

  // Poll all
  console.log("\n  Waiting for generation...\n");
  const results = await Promise.all(
    tasks.map(async (task) => {
      const imageUrl = await pollTask(task.taskId);
      console.log(`\n  [done] ${task.name}`);
      return { ...task, imageUrl };
    })
  );

  // Download all
  console.log("\n\n  Downloading images...\n");
  await Promise.all(
    results.map(async (r) => {
      const dest = path.join(OUTPUT_DIR, `${r.name}.png`);
      await download(r.imageUrl, dest);
      console.log(`  [saved] ${r.name}.png`);
    })
  );

  console.log(`\n  Done! 5 LinkedIn posts saved to output-option-c/\n`);
}

main().catch((err) => { console.error("\n  Error:", err.message); process.exit(1); });
