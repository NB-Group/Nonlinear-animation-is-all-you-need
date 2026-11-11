#!/usr/bin/env python3
"""Dump a thread's comments (author + text) via the safereddit mirror.

Usage: python read_thread.py <post_id> [<post_id> ...]
Prints '== <id>' then 'author | text' lines, oldest first.
"""
import sys
from playwright.sync_api import sync_playwright

UA = ('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) '
      'Gecko/20100101 Firefox/133.0')
ids = sys.argv[1:]

with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp('http://127.0.0.1:9224')
    ctx = b.new_context(user_agent=UA)
    p = ctx.new_page()
    for pid in ids:
        p.goto(f'https://safereddit.com/r/gnome/comments/{pid}/',
               timeout=60000, wait_until='domcontentloaded')
        p.wait_for_timeout(4500)
        for _ in range(5):
            p.mouse.wheel(0, 2500)
            p.wait_for_timeout(600)
        rows = p.evaluate("""() => [...document.querySelectorAll('.comment')]
            .map(c => ({
                a: c.querySelector('.comment_author, .comment_author_link')
                    ?.textContent?.trim(),
                t: (c.querySelector('.comment_body')?.innerText || '')
                    .replace(/\\n+/g, ' ').slice(0, 400)}))""")
        print(f'== {pid} ({len(rows)} comments)')
        for r in rows:
            if r['a']:
                print(f"   {r['a']:24s} | {r['t'][:180]}")
    ctx.close()
    b.close()
