#!/usr/bin/env python3
"""Plot the EGO download curve from data/downloads.csv.

Usage: ~/micromamba/envs/physidit/bin/python scripts/ego-downloads-plot.py \
           [output.png] [--rate]
--rate also draws the per-hour gain rate on a second axis.
"""
import sys
from datetime import datetime

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

CSV = '/mnt/Code/Nonlinear-animation-is-all-you-need/data/downloads.csv'
out = next((a for a in sys.argv[1:] if not a.startswith('--')),
           '/tmp/nla/downloads.png')
rate = '--rate' in sys.argv

df = pd.read_csv(CSV, parse_dates=['timestamp'])
df = df.drop_duplicates(subset='timestamp', keep='last')
if len(df) < 2:
    sys.exit('need at least two rows before plotting')

fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(df.timestamp, df.downloads, lw=2)
ax.set_title('Nonlinear animation is all you need - EGO downloads')
ax.set_ylabel('downloads')
ax.grid(alpha=0.3)

if rate:
    per_hour = df.set_index('timestamp').downloads.resample('1h').max().diff()
    ax2 = ax.twinx()
    ax2.bar(per_hour.index, per_hour.fillna(0), alpha=0.25, color='tab:orange',
            width=1 / 26)
    ax2.set_ylabel('gain per hour', color='tab:orange')
    ax2.grid(False)

# annotate version changes if any are recorded
for _, row in df.iterrows():
    if row.get('version') and row.version != getattr(df, '_lastv', None):
        ax.axvline(row.timestamp, color='red', alpha=0.3, lw=1)
        setattr(df, '_lastv', row.version)

fig.autofmt_xdate()
fig.tight_layout()
fig.savefig(out, dpi=140)
print(f'wrote {out} ({len(df)} samples, '
      f'{df.downloads.iloc[0]} -> {df.downloads.iloc[-1]})')
