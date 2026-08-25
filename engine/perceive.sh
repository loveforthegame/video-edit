#!/usr/bin/env bash
# Deterministic frame sampler. Both footage-scout and edit-critic MUST use this
# so that a cell reference means the same thing on both sides of the pipeline.
#
#   perceive.sh <video> <outdir> [rate]
#
# rate: "global" -> 6 frames spread evenly across the whole file (mode A)
#       <number>  -> that many samples per second (mode B; default 1)
#
# Emits frames as <outdir>/f_<index>.jpg plus <outdir>/index.tsv mapping
# index -> timestamp so nothing downstream has to recompute timing.
set -euo pipefail

VIDEO="${1:?usage: perceive.sh <video> <outdir> [rate]}"
OUTDIR="${2:?usage: perceive.sh <video> <outdir> [rate]}"
RATE="${3:-1}"

[ -r "$VIDEO" ] || { echo "BLOCKER: cannot read $VIDEO" >&2; exit 2; }
command -v ffmpeg  >/dev/null || { echo "BLOCKER: ffmpeg not found" >&2; exit 2; }
command -v ffprobe >/dev/null || { echo "BLOCKER: ffprobe not found" >&2; exit 2; }

mkdir -p "$OUTDIR"
rm -f "$OUTDIR"/f_*.jpg "$OUTDIR"/index.tsv

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width  -of csv=p=0 "$VIDEO")
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$VIDEO")

# Long edge to 640: small enough to be cheap, large enough to read burned-in text.
if [ "$W" -ge "$H" ]; then SCALE="640:-2"; else SCALE="-2:640"; fi

if [ "$RATE" = "global" ]; then
  # 6 frames at 1/12, 3/12, 5/12, 7/12, 9/12, 11/12 of the duration — never the
  # very first or last frame, which are routinely black or a slate.
  i=0
  for n in 1 3 5 7 9 11; do
    T=$(awk -v d="$DUR" -v n="$n" 'BEGIN{printf "%.3f", d*n/12}')
    i=$((i+1))
    ffmpeg -nostdin -v error -ss "$T" -i "$VIDEO" -frames:v 1 \
           -vf "scale=$SCALE" -q:v 4 "$OUTDIR/f_$(printf '%03d' $i).jpg"
    printf '%s\t%s\n' "$(printf '%03d' $i)" "$T" >> "$OUTDIR/index.tsv"
  done
else
  ffmpeg -nostdin -v error -i "$VIDEO" \
         -vf "fps=$RATE,scale=$SCALE" -q:v 4 "$OUTDIR/f_%03d.jpg"
  i=0
  for f in "$OUTDIR"/f_*.jpg; do
    i=$((i+1))
    T=$(awk -v i="$i" -v r="$RATE" 'BEGIN{printf "%.3f", (i-1)/r}')
    printf '%s\t%s\n' "$(basename "$f" .jpg | sed 's/^f_//')" "$T" >> "$OUTDIR/index.tsv"
  done
fi

COUNT=$(find "$OUTDIR" -name 'f_*.jpg' | wc -l | tr -d ' ')
echo "frames=$COUNT duration=$DUR source=${W}x${H} index=$OUTDIR/index.tsv"
