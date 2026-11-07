# r/gnome 发布包 · 终稿

## 发帖设置

- 标题：GNOME animates with six different easing curves. I made them follow one, yours.
- Flair：LLM Assisted（规则 4 必选）
- 附件（视频）：brand/demo-compare.mp4
- 发布时段：北京 21:00-23:00

## 首评正文（发完帖子立刻发，整段复制）

The video shows the same window minimize and restore with interruptions, ours first, stock second. The capture drops frames here and there; that's the recording, not the extension. Day to day it runs smooth.

GNOME does ease its window animations, but each area grew its own curve and stuck with it: expo for windows, sine for the overview, cubic for pages, and a few spots, like icons spawning into the overview, just run linear. Six curves across the shell, no shared motion language, and none of it keeps momentum: interrupt an animation and the replacement starts at zero speed, while an interrupted workspace switch gets torn down and teleports.

So this extension hooks the four ease methods the shell itself uses (`ease`, `ease_property`, `easeAsync`, and the adjustment one) and puts one curve behind all of them:

- **Draw your own curve.** A canvas editor: drag control points, double-click to add, right-click to remove, endpoints pinned. Values above 1 give you overshoot, a replay button previews the motion. Curves export as tiny JSON files people trade like themes.
- **Interrupted animations keep their momentum.** Flip two app-grid pages fast, or restore a window mid-minimize: the new animation carries the old velocity instead of restarting from standstill. Separate knobs for same-direction momentum and opposite-direction rebound.
- **Workspace switching stops teleporting.** An interrupted switch turns its ongoing slide toward the new workspace instead of rebuilding from scratch.
- **Touchpad gestures stay native**, because gesture motion already tracks your finger and stacking a curve on it would fight it.

Presets cost nothing per frame (one enum swap before the native Clutter call). Custom curves run one small analytic callback per frame, nothing allocated on the frame path. The system reduce-motion and disable-animations settings are honored, and GNOME Shell 49, 50 and 51 are declared and were read side by side before declaring that.

Install: https://extensions.gnome.org/extension/10649/nonlinear-animation-is-all-you-need/
Source (AGPL): https://github.com/NB-Group/Nonlinear-animation-is-all-you-need

The name is a transformer joke, yes.

LLM disclosure, per rule 4: this project is LLM-assisted. I set the direction, test every build on real hardware, chase bugs through the shell's journal, and make every release call; Claude writes most of the code under that supervision. Two of this week's fixes came from user reports within hours, and one of them, an overshooting curve that froze shells, was found, fixed, and source-audited in a day. The repo has thirteen weeks of documented history, and every GNOME-behavior claim in this post was verified against the 50.0 source before writing it; the audit is in the repo.
