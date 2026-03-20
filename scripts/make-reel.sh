#!/bin/bash
cd "/Users/ggbaldovino/Documents/ARCA Projects/portfolio-screenshots"
mkdir -p clips

PAGES=(index dashboard moodboard sights product TesterTech creative community blog careers support about)

echo "=== Step 1: Creating clips with Ken Burns effect ==="
for i in $(seq 0 $((${#PAGES[@]}-1))); do
  pg="${PAGES[$i]}"
  mod=$((i % 4))
  case $mod in
    0) ZX="iw/2-(iw/zoom/2)"; ZY="ih/2-(ih/zoom/2)" ;;
    1) ZX="0"; ZY="0" ;;
    2) ZX="iw-(iw/zoom)"; ZY="ih-(ih/zoom)" ;;
    3) ZX="iw/2-(iw/zoom/2)"; ZY="0" ;;
  esac
  ffmpeg -y -loop 1 -i "${pg}.png" -t 4 \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0e0d11,zoompan=z='min(zoom+0.001,1.1)':d=120:x='${ZX}':y='${ZY}':s=1920x1080:fps=30,format=yuv420p" \
    -c:v libx264 -preset fast -crf 20 -r 30 \
    "clips/${i}_${pg}.mp4" 2>/dev/null
  echo "  ✓ $pg"
done

echo ""
echo "=== Step 2: Chaining with xfade transitions ==="

ffmpeg -y \
  -i clips/0_index.mp4 \
  -i clips/1_dashboard.mp4 \
  -i clips/2_moodboard.mp4 \
  -i clips/3_sights.mp4 \
  -i clips/4_product.mp4 \
  -i clips/5_TesterTech.mp4 \
  -i clips/6_creative.mp4 \
  -i clips/7_community.mp4 \
  -i clips/8_blog.mp4 \
  -i clips/9_careers.mp4 \
  -i clips/10_support.mp4 \
  -i clips/11_about.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=smoothleft:duration=0.8:offset=3.2[v1];
    [v1][2:v]xfade=transition=fadeblack:duration=0.8:offset=6.4[v2];
    [v2][3:v]xfade=transition=circlecrop:duration=0.8:offset=9.6[v3];
    [v3][4:v]xfade=transition=smoothright:duration=0.8:offset=12.8[v4];
    [v4][5:v]xfade=transition=smoothup:duration=0.8:offset=16.0[v5];
    [v5][6:v]xfade=transition=fadeblack:duration=0.8:offset=19.2[v6];
    [v6][7:v]xfade=transition=wipeleft:duration=0.8:offset=22.4[v7];
    [v7][8:v]xfade=transition=circlecrop:duration=0.8:offset=25.6[v8];
    [v8][9:v]xfade=transition=smoothdown:duration=0.8:offset=28.8[v9];
    [v9][10:v]xfade=transition=fadeblack:duration=0.8:offset=32.0[v10];
    [v10][11:v]xfade=transition=smoothright:duration=0.8:offset=35.2[v11]
  " \
  -map "[v11]" \
  -c:v libx264 -preset medium -crf 22 -r 30 \
  -movflags +faststart \
  reel.mp4 2>&1 | tail -8

echo ""
ls -lh reel.mp4
echo "=== Done ==="
