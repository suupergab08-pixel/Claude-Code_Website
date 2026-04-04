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
const sizeFlag = args.indexOf("--size");
let size = "3:2";
if (sizeFlag !== -1 && args[sizeFlag + 1]) {
  size = args[sizeFlag + 1];
  args.splice(sizeFlag, 2);
}
const outputFlag = args.indexOf("--output");
let outputFile = null;
if (outputFlag !== -1 && args[outputFlag + 1]) {
  outputFile = args[outputFlag + 1];
  args.splice(outputFlag, 2);
}

const prompt = args.join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run generate -- "Your prompt here" [--model nano-banana-pro] [--size 2:3] [--output filename.png]');
  process.exit(1);
}

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

async function main() {
  const endpoint = getEndpoint(model);
  const outDir = path.join(__dirname, "..", "generated");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n  Single Image Generator`);
  console.log(`  Model: ${model} | Size: ${size}`);
  console.log(`  Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"\n`);

  // Submit
  const body = JSON.stringify({ prompt, size, nVariants: 1 });
  const url = new URL(endpoint.generate);
  const res = await httpRequest(endpoint.generate, {
    method: "POST", hostname: url.hostname, path: url.pathname,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  }, body);

  if (res.code !== 200 || !res.data?.taskId) {
    throw new Error(`Submit failed: ${JSON.stringify(res)}`);
  }
  const taskId = res.data.taskId;
  console.log(`  [submitted] ${taskId.slice(0, 12)}...`);

  // Poll
  const statusUrl = new URL(`${endpoint.status}?taskId=${taskId}`);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const poll = await httpRequest(statusUrl.href, {
      method: "GET", hostname: statusUrl.hostname, path: statusUrl.pathname + statusUrl.search,
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (poll.data?.successFlag === 1) {
      const urls = poll.data.response?.resultUrls || poll.data.response?.result_urls;
      if (urls && urls.length > 0) {
        const filename = outputFile || `generated-${Date.now()}.png`;
        const dest = path.join(outDir, filename);
        await download(urls[0], dest);
        console.log(`  [done] Saved to generated/${filename}\n`);
        return;
      }
    }
    if (poll.data?.successFlag === 2) {
      throw new Error(`Task failed: ${poll.data.errorMessage}`);
    }
    process.stdout.write(`\r  Generating... ${poll.data?.progress || "waiting"}`);
  }
  throw new Error("Timed out after 5 minutes");
}

main().catch((err) => { console.error("\n  Error:", err.message); process.exit(1); });
