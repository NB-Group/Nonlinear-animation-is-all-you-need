#!/usr/bin/env python3
"""Reply to a specific comment via the www shreddit UI.

Old reddit does not render nested children (the target cannot be found
there), and /api/comment returns 403 from this network. The www UI
composer works: scroll the target into view, REAL-click its reply
button (JS dispatch does not open the composer), type in the visible
contenteditable, click the submit button.

Usage: python reply_comment.py <comment_permalink> <textfile>
  comment_permalink: /r/<sub>/comments/<post>/comment/<id>/
Verifies by locating the new comment and printing its depth.
"""
import sys
from playwright.sync_api import sync_playwright

link, textfile = sys.argv[1], sys.argv[2]
text = open(textfile).read().strip()

with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9224')
    p = b.contexts[0].pages[0]
    p.goto('https://www.reddit.com' + link, timeout=60000,
           wait_until='domcontentloaded')
    p.wait_for_timeout(6000)
    p.evaluate("""() => document.querySelector('shreddit-comment')
        ?.scrollIntoView({block: 'center'})""")
    p.wait_for_timeout(2000)
    btns = p.locator('button:has-text("回复"), button:has-text("Reply")')
    clicked = False
    for i in range(btns.count()):
        try:
            btns.nth(i).click(timeout=4000, force=True)
            clicked = True
            break
        except Exception:
            continue
    print('reply button clicked:', clicked)
    p.wait_for_timeout(5000)
    typed = p.evaluate("""() => {
        const rtes = [...document.querySelectorAll(
            'div[contenteditable="true"]')]
            .filter(r => r.offsetParent !== null);
        if (!rtes.length) return 0;
        rtes[0].focus();
        return rtes.length;}""")
    if not typed:
        print('no visible composer')
        b.close()
        sys.exit(2)
    p.keyboard.type(text, delay=8)
    p.wait_for_timeout(1500)
    subs = p.locator('button:has-text("评论"):visible, button:has-text("Comment"):visible')
    if subs.count() == 0:
        print('no submit button')
        b.close()
        sys.exit(2)
    subs.last.click()
    p.wait_for_timeout(9000)
    depths = p.evaluate("""(t) => [...document.querySelectorAll('shreddit-comment')]
        .filter(c => (c.innerText || '').includes(t.slice(0, 30)))
        .map(c => c.getAttribute('depth'))""", text)
    print('posted depths:', depths)
    b.close()
    sys.exit(0 if depths else 2)
