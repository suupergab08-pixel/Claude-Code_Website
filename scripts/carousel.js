const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Parse CLI args ──
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { slides: null, inputDir: null, width: 1080, height: 1350 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--slides": opts.slides = args[++i]; break;
      case "--width": opts.width = parseInt(args[++i], 10); break;
      case "--height": opts.height = parseInt(args[++i], 10); break;
      default:
        if (!opts.inputDir && !args[i].startsWith("-")) opts.inputDir = args[i];
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);

if (!opts.slides && !opts.inputDir) {
  console.error("Usage:");
  console.error("");
  console.error("  Mode 1 — Pick specific images:");
  console.error('  npm run carousel -- --slides "generated/section-1/image-01.png,generated/section-2/image-01.png" --width 1080 --height 1350');
  console.error("");
  console.error("  Mode 2 — Resize all images in a folder:");
  console.error("  npm run carousel -- output-option-a --width 1080 --height 1350");
  console.error("");
  console.error("Options:");
  console.error("  --slides <paths>  Comma-separated list of image paths");
  console.error("  --width <px>      Output width (default: 1080)");
  console.error("  --height <px>     Output height (default: 1350)");
  process.exit(1);
}

// Resolve image file list
let imageFiles = [];

if (opts.slides) {
  // Mode 1: explicit slide list
  imageFiles = opts.slides.split(",").map((f) => f.trim());
  for (const f of imageFiles) {
    const resolved = path.resolve(f);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: File not found: ${resolved}`);
      process.exit(1);
    }
  }
} else {
  // Mode 2: all images in a folder
  const inputPath = path.resolve(opts.inputDir);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Folder not found: ${inputPath}`);
    process.exit(1);
  }
  imageFiles = fs.readdirSync(inputPath)
    .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
    .sort()
    .map((f) => path.join(inputPath, f));
}

if (imageFiles.length === 0) {
  console.error("No images found to process.");
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, "..", "carousel-output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log(`\n  LinkedIn Carousel Assembler`);
console.log(`  Input: ${imageFiles.length} images`);
console.log(`  Output: carousel-output/ (${opts.width}x${opts.height})`);
console.log("");

// Build PowerShell resize script
const psLines = ["Add-Type -AssemblyName System.Drawing"];

imageFiles.forEach((file, i) => {
  const padded = String(i + 1).padStart(2, "0");
  const inputFile = path.resolve(file).replace(/\//g, "\\");
  const outputFile = path.join(OUTPUT_DIR, `slide-${padded}.png`).replace(/\//g, "\\");
  const w = opts.width;
  const h = opts.height;

  psLines.push(`
$img = [System.Drawing.Image]::FromFile("${inputFile}")
$bmp = New-Object System.Drawing.Bitmap(${w}, ${h})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 22, 40))
$g.FillRectangle($brush, 0, 0, ${w}, ${h})
$scaleX = ${w} / $img.Width
$scaleY = ${h} / $img.Height
$scale = [Math]::Min($scaleX, $scaleY)
$nw = [int]($img.Width * $scale)
$nh = [int]($img.Height * $scale)
$x = [int]((${w} - $nw) / 2)
$y = [int]((${h} - $nh) / 2)
$g.DrawImage($img, $x, $y, $nw, $nh)
$bmp.Save("${outputFile}", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose(); $brush.Dispose()
Write-Host "  [saved] slide-${padded}.png  (${w}x${h})"
`);
});

// Write temp script and execute
const tempScript = path.join(OUTPUT_DIR, "_resize.ps1");
fs.writeFileSync(tempScript, psLines.join("\n"));

try {
  execSync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, {
    stdio: "inherit",
    timeout: 120000,
  });
} finally {
  if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript);
}

console.log(`\n  Done! ${imageFiles.length} slides saved to carousel-output/\n`);
