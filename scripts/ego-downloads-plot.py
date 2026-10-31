#!/usr/bin/env python3
"""Plot the EGO download curve from data/downloads.csv.

Two stacked panels sharing the time axis (never a dual y-axis):
total downloads on top, gain per hour below. Stdlib csv only; no pandas.

Usage: ~/micromamba/envs/physidit/bin/python scripts/ego-downloads-plot.py \
           [output.png]
"""
import csv
import sys
from collections import defaultdict
from datetime import datetime

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

CSV = '/mnt/Code/Nonlinear-animation-is-all-you-need/data/downloads.csv'
out = next((a for a in sys.argv[1:] if not a.startswith('--')),
           '/mnt/Code/Nonlinear-animation-is-all-you-need/data/downloads.png')

INK, MUTED, GRID, ACCENT = '#24292f', '#57606a', '#d0d7de', '#3563e9'
RATE = '#8b949e'

rows = []
with open(CSV) as f:
    for r in csv.DictReader(f):
        try:
            rows.append((datetime.fromisoformat(r['timestamp']),
                         int(r['downloads'])))
        except (ValueError, KeyError):
            continue
rows.sort()
if len(rows) < 3:
    sys.exit('need at least three samples before plotting')
times = [r[0] for r in rows]
counts = [r[1] for r in rows]

# hourly gain: max minus min within each clock hour
hour_hi, hour_lo = defaultdict(int), defaultdict(lambda: 10 ** 9)
for t, c in rows:
    h = t.replace(minute=0, second=0, microsecond=0)
    hour_hi[h] = max(hour_hi[h], c)
    hour_lo[h] = min(hour_lo[h], c)
hours = sorted(hour_hi)
gains = [max(0, hour_hi[h] - hour_lo[h]) for h in hours]

fig, (ax, ax2) = plt.subplots(
    2, 1, figsize=(10, 6), sharex=True,
    gridspec_kw={'height_ratios': [3, 1.4], 'hspace': 0.12})

ax.plot(times, counts, color=ACCENT, lw=2, solid_capstyle='round')
ax.set_title('Nonlinear animation is all you need - EGO downloads',
             loc='left', fontsize=13, color=INK, pad=12)
ax.set_ylabel('downloads', color=MUTED, fontsize=9)
ax.grid(True, color=GRID, lw=0.8, alpha=0.6)
ax.set_axisbelow(True)
for s in ax.spines.values():
    s.set_visible(False)
ax.tick_params(colors=MUTED, labelsize=9, length=0)
ax.annotate(f'{counts[-1]}', xy=(times[-1], counts[-1]),
            xytext=(6, 2), textcoords='offset points',
            color=INK, fontsize=11, fontweight='bold')
ymin, ymax = min(counts) - 10, max(counts) + (max(counts) - min(counts)) * 0.15 + 5
ax.set_ylim(ymin, ymax)

ax2.bar(hours, gains, width=1 / 30, color=RATE)
ax2.set_ylabel('per hour', color=MUTED, fontsize=9)
ax2.grid(True, axis='y', color=GRID, lw=0.8, alpha=0.6)
ax2.set_axisbelow(True)
for s in ax2.spines.values():
    s.set_visible(False)
ax2.tick_params(colors=MUTED, labelsize=9, length=0)
ax2.xaxis.set_major_formatter(mdates.DateFormatter('%m-%d %H:%M'))

fig.autofmt_xdate(rotation=0, ha='center')
for label in ax2.get_xticklabels():
    label.set_color(MUTED)
fig.patch.set_facecolor('white')
fig.savefig(out, dpi=140, bbox_inches='tight', facecolor='white')
print(f'wrote {out} ({len(rows)} samples, {counts[0]} -> {counts[-1]})')
