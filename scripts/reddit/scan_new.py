#!/usr/bin/env python3
"""Scan r/gnome/new via the safereddit (redlib) mirror, no login needed.

Requires Chrome with CDP on :9224 (see launch_chrome.sh).
Usage: python scan_new.py [hours_max]
"""
import sys
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

hours_max = float(sys.argv[1]) if len(sys.argv) > 1 else 26
now = datetime.now(timezone.utc)
UA = ('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) '
      'Gecko/20100101 Firefox/133.0')

with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9224')
    ctx = b.new_context(user_agent=UA)
    p = ctx.new_page()
    p.goto('https://safereddit.com/r/gnome/new/', timeout=60000,
           wait_until='domcontentloaded')
    p.wait_for_timeout(5000)
    for _ in range(6):
        p.mouse.wheel(0, 3000)
        p.wait_for_timeout(900)
    rows = p.evaluate("""() => [...document.querySelectorAll('.post')].map(e => ({
        title: [...e.querySelectorAll('h2.post_title a')]
            .filter(a => !a.classList.contains('post_flair'))
            .map(a => a.textContent.trim())[0],
        time: e.querySelector('.created')?.getAttribute('title'),
        comments: e.querySelector('.post_comments')?.textContent.trim(),
        url: [...e.querySelectorAll('h2.post_title a')]
            .filter(a => !a.classList.contains('post_flair'))
            .map(a => a.getAttribute('href'))[0]}))""")
    for r in rows:
        if not r['title'] or not r['time']:
            continue
        try:
            t = datetime.strptime(r['time'], '%b %d %Y, %H:%M:%S UTC'
                                  ).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        age = (now - t).total_seconds() / 3600
        if 0.4 < age < hours_max:
            print(f"{age:5.1f}h  c={r['comments'] or '?':>3s}  "
                  f"{r['title'][:74]}  {r['url']}")
    ctx.close()
    b.close()
