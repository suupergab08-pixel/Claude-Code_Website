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

// ── Parse CLI args ──
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { model: "4o", count: 1, width: 1920, height: 1080, file: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--file": opts.file = args[++i]; break;
      case "--model": opts.model = args[++i]; break;
      case "--count": opts.count = parseInt(args[++i], 10); break;
      case "-w": opts.width = parseInt(args[++i], 10); break;
      case "-h": opts.height = parseInt(args[++i], 10); break;
      default:
        if (!opts.file && !args[i].startsWith("-")) opts.file = args[i];
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!opts.file) {
  console.error("Usage: npm run batch -- --file ./references/blog-post.md --count 3 -w 1080 -h 1350");
  console.error("\nOptions:");
  console.error("  --file <path>     Markdown file with ## headings (required)");
  console.error("  --count <n>       Variants per section (default: 1)");
  console.error("  -w <px>           Image width (default: 1920)");
  console.error("  -h <px>           Image height (default: 1080)");
  console.error("  --model <name>    Model: 4o | nano-banana-pro (default: 4o)");
  console.error("\nSize presets:");
  console.error("  -w 1080 -h 1350   LinkedIn portrait");
  console.error("  -w 1920 -h 1080   YouTube / wide");
  console.error("  -w 1080 -h 1080   Square");
  process.exit(1);
}

const filePath = path.resolve(opts.file);
if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

// Map pixel dimensions to kie.ai aspect ratio strings
function toAspectRatio(w, h) {
  const r = w / h;
  if (Math.abs(r - 1) < 0.05) return "1:1";
  if (Math.abs(r - 16 / 9) < 0.1) return "3:2";
  if (Math.abs(r - 9 / 16) < 0.1) return "2:3";
  if (r > 1) return "3:2";
  return "2:3";
}

const size = toAspectRatio(opts.width, opts.height);
const orientation = opts.width >= opts.height ? "Landscape" : "Portrait";

// ── Shared Design System ──
const STYLE = [
  "STRICT DESIGN RULES (apply to every image in this set):",
  "Background: solid flat dark navy #0F1628, NO gradients, NO patterns, NO noise.",
  "Accent color: single cyan-blue #00B4D8 used for all icons, dividers, and highlights.",
  "Secondary accent: white #FFFFFF for titles and primary text only.",
  "Tertiary text: light gray #B0BEC5 for subtitles and body copy.",
  "Typography: one single geometric sans-serif font (Montserrat/Inter style), bold for titles, medium for body.",
  "Layout: title top-left aligned, thin 2px cyan horizontal rule below the title, content centered below.",
  "Icons: simple flat line-art icons in cyan #00B4D8 on transparent, consistent 48px size, 2px stroke weight.",
  "Cards/boxes: rounded rectangles with 1px cyan border, semi-transparent dark fill rgba(0,180,216,0.08), 12px border-radius.",
  "Spacing: generous whitespace, 32px gaps between elements, nothing crowded.",
  "No photographs, no 3D renders, no gradients, no glow effects, no drop shadows. Pure flat vector design only.",
].join(" ");

// ── Networking helpers ──
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

// ── Content parsing ──
function parseSections(content) {
  let sections = content.split(/\n---+\n|\n(?=## )/);
  return sections.map((s) => s.trim()).filter((s) => s.length > 20);
}

function sectionToSlug(section, index) {
  const headingMatch = section.match(/^#{1,3}\s+(.+)/m);
  const heading = headingMatch ? headingMatch[1].trim() : `Section ${index + 1}`;
  return {
    heading,
    slug: `section-${index + 1}`,
  };
}

function sectionToPrompt(section, index, totalSections) {
  const { heading } = sectionToSlug(section, index);
  const body = section
    .replace(/^#{1,3}\s+.+/m, "")
    .replace(/[#*_`>\[\]()]/g, "")
    .trim()
    .slice(0, 200);

  return `${STYLE} Blog post illustration (image ${index + 1} of ${totalSections}). Title "${heading}" in bold white at top-left with cyan underline. Content area visually represents the key concept using flat line-art icons and labeled cards: ${body}. Use diagrams, icon grids, or flowcharts as appropriate. ${orientation} composition.`;
}

// ── API calls ──
async function submitTask(prompt) {
  const endpoint = getEndpoint(opts.model);
  const body = JSON.stringify({ prompt, size, nVariants: 1 });
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
  const endpoint = getEndpoint(opts.model);
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

// ── Main ──
async function main() {
  const content = fs.readFileSync(filePath, "utf-8");
  const sections = parseSections(content);
  const baseDir = path.join(__dirname, "..", "generated");
  const totalImages = sections.length * opts.count;

  console.log(`\n  Batch Image Generator`);
  console.log(`  Source: ${path.basename(filePath)} (${sections.length} sections)`);
  console.log(`  Variants: ${opts.count} per section | Total: ${totalImages} images`);
  console.log(`  Size: ${opts.width}x${opts.height} (${size}) | Model: ${opts.model}`);
  console.log(`  Est. cost: ~$${(totalImages * 0.08).toFixed(2)}`);
  console.log(`  Output: generated/<section-folder>/\n`);

  // Build task list: each section x count variants
  const allTasks = [];
  for (let si = 0; si < sections.length; si++) {
    const { heading, slug } = sectionToSlug(sections[si], si);
    const sectionDir = path.join(baseDir, slug);
    fs.mkdirSync(sectionDir, { recursive: true });

    for (let vi = 0; vi < opts.count; vi++) {
      allTasks.push({
        sectionIndex: si,
        variant: vi,
        heading,
        slug,
        sectionDir,
        prompt: sectionToPrompt(sections[si], si, sections.length),
      });
    }
  }

  // Submit all tasks in parallel
  console.log("  Submitting tasks...");
  const submitted = await Promise.all(
    allTasks.map(async (task) => {
      const taskId = await submitTask(task.prompt);
      const label = `${task.slug}/image-${String(task.variant + 1).padStart(2, "0")}`;
      console.log(`  [submitted] ${label} -> ${taskId.slice(0, 12)}...`);
      return { ...task, taskId, label };
    })
  );

  // Poll all tasks
  console.log("\n  Waiting for generation...\n");
  const results = await Promise.all(
    submitted.map(async (task) => {
      const imageUrl = await pollTask(task.taskId);
      console.log(`\n  [done] ${task.label}`);
      return { ...task, imageUrl };
    })
  );

  // Download all images into section subfolders
  console.log("\n\n  Downloading images...\n");
  await Promise.all(
    results.map(async (r) => {
      const filename = `image-${String(r.variant + 1).padStart(2, "0")}.png`;
      const dest = path.join(r.sectionDir, filename);
      await download(r.imageUrl, dest);
      console.log(`  [saved] ${r.slug}/${filename}`);
    })
  );

  console.log(`\n  Done! ${results.length} images saved to generated/\n`);
  console.log("  Folders:");
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.slug)) {
      seen.add(r.slug);
      console.log(`    generated/${r.slug}/  (${opts.count} variant${opts.count > 1 ? "s" : ""})`);
    }
  }
  console.log("");
}

main().catch((err) => { console.error("\n  Error:", err.message); process.exit(1); });
