#!/usr/bin/env bash
# Build the share card: public/share-card.png (og:image) and public/share-card.mp4 (og:video).
#
# bear.py writes one SVG per frame. Rendering them one Chrome launch at a time takes
# minutes, so they are laid out as a grid in a single page, screenshotted once, and cut
# back apart with ImageMagick. ImageMagick can't render the SVGs itself: this machine has
# no fonts registered with it, so the wordmark comes out empty.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../public"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (set CHROME=...)" >&2; exit 1; }

W=1200 H=630 COLS=9 FRAMES=90

python3 "$HERE/bear.py" "$WORK" --frames "$FRAMES"
python3 "$HERE/bear.py" "$WORK" --poster

ROWS=$(( (FRAMES + COLS - 1) / COLS ))
{
  echo '<!doctype html><meta charset="utf-8"><style>'
  echo "html,body{margin:0;padding:0;background:#00264c} img{display:block;width:${W}px;height:${H}px}"
  echo "body{display:grid;grid-template-columns:repeat($COLS,${W}px);width:$((COLS*W))px}"
  echo '</style>'
  for f in "$WORK"/f*.svg; do echo "<img src=\"$(basename "$f")\">"; done
} > "$WORK/strip.html"

echo "rendering ${FRAMES} frames as a $((COLS*W))x$((ROWS*H)) grid..."
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=$((COLS*W)),$((ROWS*H)) --screenshot="$WORK/strip.png" \
  "file://$WORK/strip.html" 2>/dev/null

magick "$WORK/strip.png" -crop "${W}x${H}" +repage "$WORK/tile_%04d.png"

mkdir -p "$OUT"
# yuv420p + even dimensions, so every player and preview card can decode it.
ffmpeg -y -loglevel error -framerate 30 -i "$WORK/tile_%04d.png" \
  -vf "scale=${W}:${H}:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 23 -profile:v main -level 4.0 \
  -movflags +faststart -an "$OUT/share-card.mp4"

# The poster is what iMessage, WhatsApp and LinkedIn actually show: they ignore og:video.
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=${W},${H} --screenshot="$WORK/poster.png" "file://$WORK/poster.svg" 2>/dev/null
magick "$WORK/poster.png" -strip -quality 92 "$OUT/share-card.png"

echo "wrote:"
ls -lh "$OUT/share-card.png" "$OUT/share-card.mp4" | awk '{print "  "$9"  "$5}'
ffprobe -v error -show_entries format=duration -show_entries stream=width,height,codec_name \
  -of default=noprint_wrappers=1 "$OUT/share-card.mp4" | sed 's/^/  /'
