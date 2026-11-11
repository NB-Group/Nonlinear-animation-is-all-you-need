#!/usr/bin/env python3
"""Post a TOP-LEVEL comment via old.reddit's HTML form.

Requires a logged-in CDP Chrome on :9224 (see launch_chrome.sh).
Usage: python post_comment.py <permalink> <textfile>
Exit 3 if the session is not logged in.
"""
import sys
from playwright.sync_api import sync_playwright

permalink, textfile = sys.argv[1], sys.argv[2]
text = open(textfile).read().strip()

with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9224')
    p = b.contexts[0].pages[0]
    p.goto('https://old.reddit.com' + permalink, timeout=60000,
           wait_until='domcontentloaded')
    p.wait_for_timeout(2500)
    if '/login' in p.url:
        print('LOGIN-WALLED (paste the login page URL into the CDP window)')
        b.close()
        sys.exit(3)
    p.wait_for_selector('.comment-form textarea, .usertext-edit textarea',
                        timeout=25000)
    p.evaluate("""() => {
        document.querySelectorAll('.usertext-edit')
            .forEach(e => e.style.display = 'block');
        const f = document.querySelector('.comment-form form');
        if (f) f.style.display = 'block';}""")
    ta = p.locator('.comment-form textarea').first
    if ta.count() == 0:
        ta = p.locator('.usertext-edit textarea').first
    ta.wait_for(state='visible', timeout=10000)
    ta.fill(text)
    try:
        p.click('.comment-form button[type="submit"]', timeout=5000)
    except Exception:
        p.click('.usertext-buttons button[type="submit"]', timeout=5000)
    p.wait_for_timeout(7000)
    ok = text[:50] in p.inner_text('body')
    print('posted:', ok, '|', permalink)
    b.close()
    sys.exit(0 if ok else 2)
