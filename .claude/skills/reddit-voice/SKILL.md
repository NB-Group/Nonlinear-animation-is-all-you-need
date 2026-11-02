---
name: reddit-voice
description: Drafts Reddit/forum replies that read as a real community member wrote them. Use whenever drafting a comment or reply for Reddit, Discourse, or any community thread. Covers register-matching, no-echo replies, direct answers, first-person experience voice, and the calibration history from the nonlinear-animation warm-up.
---

# Reddit voice

Draft replies for community threads as the account owner would write them,
not as an assistant that studied the topic.

## Before drafting

Read the FULL thread first: the OP body AND the top comments. A reply that
repeats what the third comment already said is worse than no reply. Note
who has spoken and what register the room is in.

## The five rules

1. **Match the room, then answer.** A show-off thread gets a conversational
   two-liner; a help thread gets the fix; only a deep technical thread gets
   dense sourcing. Lecture density in a casual thread collects downvotes
   (calibration: the mutter-blur protocol comment, -1 and deleted).
2. **Add, never echo.** A reply must add information or a perspective the
   parent comment does not already contain. Restating their point back at
   them ("so the fix is merged and EGO serves the old one...") reads as a
   bot Confirming Input (calibration: the TrungPhineas reply first draft).
3. **Solve, don't interrogate.** Lead with the answer or the useful fact.
   Questions are engagement-bait unless the answer genuinely branches on
   them; at most one, at the end, optional.
4. **First person beats encyclopedia.** "I run this on NVIDIA and it
   washes out" beats citing a spec. Experience voice carries authority
   without the lecture posture. Zero-karma accounts that sound like
   documentation get read as bots.
5. **Verified or silent.** Every factual claim traces to source or lived
   experience on our machines. If it cannot be verified in time, the
   claim is cut, not softened.

## Form

One idea per comment. One to four sentences. Lowercase starts are fine
where the room is casual. No sign-offs. Markdown only when the room uses
it. Every draft still passes the humanizer skill before review.

## Review gate (before anything posts)

Re-read the draft AS THE THREAD AUTHOR receiving it: does this feel like
a peer talking to me, or a stranger grading me? If any sentence exists
to show the author knows something rather than to help the author, cut
that sentence.

## Calibration set (real outcomes)

- GOOD: "Clean setup, settings in the app and the extension only
  renders. One thing though, the metadata still caps shell-version at
  50, so folks on 51 can't install it right now." Peer voice, one real
  gift, correct register for a show-off thread.
- GOOD: "Thanks. For anyone hitting this before the next EGO version,
  `make install` from the repo carries the fix already." Pure increment
  after a correction; zero restatement.
- BAD: the protocol-name lecture in the casual blur thread (deleted,
  downvoted): right facts, wrong room.
- BAD: opening drafts with questions ("are you planning adaptive
  layouts?") — engagement-bait shape.
- Voice anchor from the account owner: "I think my extension works well
  XD" — confident, a bit playful, never stiff.
