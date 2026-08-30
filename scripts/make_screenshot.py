#!/usr/bin/env python3
"""Hero image for the EGO page: one clean in-out cubic curve, nothing else."""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

BLUE = '#3584e4'
BG = '#1d1d20'

t = np.linspace(0, 1, 500)
y = np.where(t < .5, 4 * t ** 3, 1 - (-2 * t + 2) ** 3 / 2)

fig, ax = plt.subplots(figsize=(6, 6), dpi=220, facecolor=BG)
ax.set_facecolor(BG)
# soft glow underneath, then the crisp curve
ax.plot(t, y, color=BLUE, lw=16, alpha=0.12, solid_capstyle='round')
ax.plot(t, y, color=BLUE, lw=4.5, solid_capstyle='round')
# endpoint dots
ax.scatter([0, 1], [0, 1], s=55, color=BLUE, zorder=3)

ax.set_xlim(-0.04, 1.04)
ax.set_ylim(-0.04, 1.04)
ax.set_xticks([])
ax.set_yticks([])
for s in ax.spines.values():
    s.set_visible(False)

fig.tight_layout(pad=0.4)
fig.savefig('screenshots/curves.png', facecolor=BG)
print('saved screenshots/curves.png')
