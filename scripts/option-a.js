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

// Parse CLI args
const args = process.argv.slice(2);
const modelFlag = args.indexOf("--model");
let model = "4o"; // default
if (modelFlag !== -1 && args[modelFlag + 1]) {
  model = args[modelFlag + 1];
  args.splice(modelFlag, 2);
}
const topic = args.join(" ").trim();
if (!topic) {
  console.error("Usage: npm run option-a -- \"Your Topic\" [--model nano-banana-pro]");
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, "..", "output-option-a");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Shared Design System ──
// Every frame shares the same visual DNA so the set looks like one cohesive deck.
const STYLE = [
  "STRICT DESIGN RULES (apply to every frame in this set):",
  "Background: solid flat dark navy #0F1628, NO gradients, NO patterns, NO noise.",
  "Accent color: single cyan-blue #00B4D8 used for all icons, dividers, and highlights.",
  "Secondary accent: white #FFFFFF for titles and primary text only.",
  "Tertiary text: light gray #B0BEC5 for subtitles and body copy.",
  "Typography: one single geometric sans-serif font throughout (like Montserrat or Inter), bold weight for titles, medium for body.",
  "Layout: 80px top margin, title always top-left aligned, content centered below. Thin 2px cyan horizontal rule below the title.",
  "Icons: simple flat line-art icons in cyan #00B4D8 on transparent, consistent 48px size, 2px stroke weight.",
  "Cards/boxes: rounded rectangles with 1px cyan border, semi-transparent dark fill rgba(0,180,216,0.08), 12px border-radius.",
  "Spacing: generous whitespace, 32px gaps between elements, nothing crowded.",
  "Frame number: small \"01/05\" style indicator in bottom-right corner in gray #546E7A.",
  "No photographs, no 3D renders, no gradients, no glow effects, no drop shadows. Pure flat vector design only.",
].join(" ");

// Frame definitions
const FRAMES = [
  {
    name: "frame-01-hook",
    prompt: (t) =>
      `${STYLE} YouTube explainer frame 1 of 5. Hook/title slide. Large bold white title text "${t}" centered vertically. A single large cyan line-art question mark icon (matching the design system) to the right of the text. Small subtitle in gray below: "Let's break it down." Frame number "01/05" bottom-right. Landscape 16:9 composition.`,
  },
  {
    name: "frame-02-problem",
    prompt: (t) =>
      `${STYLE} YouTube explainer frame 2 of 5. Title "The Problem" top-left in white with cyan underline. Content area shows exactly 3 pain points about "${t}", each as a horizontal row: a cyan line-art warning-triangle icon on the left, bold white text label, and gray description text on the right. Rows separated by thin horizontal lines in dark gray #1E2A3A. Frame number "02/05" bottom-right. Landscape 16:9 composition.`,
  },
  {
    name: "frame-03-concept",
    prompt: (t) =>
      `${STYLE} YouTube explainer frame 3 of 5. Title "How It Works" top-left in white with cyan underline. Content area shows a horizontal flowchart explaining "${t}" with exactly 4 steps. Each step is a card (rounded rectangle with cyan border) containing a cyan line-art icon and a bold white label. Steps connected by thin cyan arrows pointing right. All cards same size, evenly spaced. Frame number "03/05" bottom-right. Landscape 16:9 composition.`,
  },
  {
    name: "frame-04-example",
    prompt: (t) =>
      `${STYLE} YouTube explainer frame 4 of 5. Title "Real Example" top-left in white with cyan underline. Content shows a before-and-after comparison for "${t}". Left column labeled "Before" with a small red-tinted icon and 3 short gray text items. Right column labeled "After" with a small cyan checkmark icon and 3 short white text items. A vertical cyan dashed divider separates the columns. Both columns use the same card styling. Frame number "04/05" bottom-right. Landscape 16:9 composition.`,
  },
  {
    name: "frame-05-summary",
    prompt: (t) =>
      `${STYLE} YouTube explainer frame 5 of 5. Title "Key Takeaways" top-left in white with cyan underline. Content shows exactly 3 takeaway points about "${t}", each as a row with a cyan checkmark circle icon and bold white text. Below the takeaways, a thin cyan horizontal rule, then a call-to-action line in gray: "Like & Subscribe for more" with a small cyan bell icon. Frame number "05/05" bottom-right. Landscape 16:9 composition.`,
  },
];

// API endpoints by model
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

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
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
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function submitTask(prompt) {
  const endpoint = getEndpoint(model);
  const body = JSON.stringify({ prompt, size: "3:2", nVariants: 1 });
  const url = new URL(endpoint.generate);
  const res = await httpRequest(endpoint.generate, {
    method: "POST",
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
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
      method: "GET",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (res.data?.successFlag === 1) {
      const urls = res.data.response?.resultUrls || res.data.response?.result_urls;
      if (urls && urls.length > 0) return urls[0];
    }
    if (res.data?.successFlag === 2) {
      throw new Error(`Task failed: ${res.data.errorMessage}`);
    }
    const progress = res.data?.progress || "waiting";
    process.stdout.write(`\r  Polling ${taskId.slice(0, 8)}... ${progress}`);
  }
  throw new Error(`Task ${taskId} timed out after 5 minutes`);
}

async function main() {
  console.log(`\n  YouTube Explainer Pack`);
  console.log(`  Topic: "${topic}"`);
  console.log(`  Model: ${model}`);
  console.log(`  Output: output-option-a/\n`);

  // Submit all 5 frames in parallel
  console.log("  Submitting 5 frames...");
  const tasks = await Promise.all(
    FRAMES.map(async (frame) => {
      const taskId = await submitTask(frame.prompt(topic));
      console.log(`  [submitted] ${frame.name} -> ${taskId.slice(0, 12)}...`);
      return { ...frame, taskId };
    })
  );

  // Poll all tasks in parallel
  console.log("\n  Waiting for generation...\n");
  const results = await Promise.all(
    tasks.map(async (task) => {
      const imageUrl = await pollTask(task.taskId);
      console.log(`\n  [done] ${task.name}`);
      return { ...task, imageUrl };
    })
  );

  // Download all images
  console.log("\n\n  Downloading images...\n");
  await Promise.all(
    results.map(async (r) => {
      const dest = path.join(OUTPUT_DIR, `${r.name}.png`);
      await download(r.imageUrl, dest);
      console.log(`  [saved] ${r.name}.png`);
    })
  );

  console.log(`\n  Done! 5 frames saved to output-option-a/\n`);
}

main().catch((err) => {
  console.error("\n  Error:", err.message);
  process.exit(1);
});
