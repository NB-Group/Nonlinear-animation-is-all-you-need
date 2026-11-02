#!/usr/bin/env python3
"""Scan r/gnome new posts for warm-up comment candidates.

Two modes:
  login  - opens a VISIBLE Chrome window on reddit login; the user logs
           in once; the session persists in ~/.cache/reddit-chrome-profile
  scan   - headful off-screen scan reusing that profile (system Chrome,
           anti-automation flags; proxy is per-flag because reddit is
           blocked direct on this machine)

Playwright lives in the physidit conda env.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = 'https://www.reddit.com/r/gnome/new/'
PROFILE = os.path.expanduser('~/.cache/reddit-chrome-profile')
MODE = sys.argv[1] if len(sys.argv) > 1 else 'scan'

env = {k: v for k, v in os.environ.items()
       if not k.lower().endswith('_proxy') and k != 'NO_PROXY'}
env['DISPLAY'] = os.environ.get('DISPLAY') or ':0'

with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        PROFILE,
        executable_path='/usr/bin/google-chrome-stable',
        headless=False,
        viewport={'width': 1280, 'height': 900},
        args=['--no-sandbox',
              '--proxy-server=http://127.0.0.1:7890',
              '--disable-blink-features=AutomationControlled'] +
            ([] if MODE == 'login' else ['--window-position=3000,3000']),
        env=env,
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        if MODE == 'login':
            page.goto('https://www.reddit.com/login/', timeout=60000,
                      wait_until='domcontentloaded')
            print('Browser window is open on the reddit login page. '
                  'Log in, then come back here; waiting up to 4 minutes...')
            for _ in range(240):
                page.wait_for_timeout(1000)
                if 'reddit.com/login' not in page.url:
                    print('Login detected, profile saved at', PROFILE)
                    break
            else:
                print('Timeout waiting for login; profile saved anyway '
                      '(finish logging in next run).')
            sys.exit(0)

        page.goto(URL, timeout=60000, wait_until='domcontentloaded')
        try:
            page.wait_for_selector('shreddit-post', timeout=25000)
        except Exception:
            print('DIAG-URL:', page.url, file=sys.stderr)
            print('DIAG-TITLE:', page.title(), file=sys.stderr)
            print('DIAG-BODY:', page.inner_text('body')[:300], file=sys.stderr)
            raise
        page.wait_for_timeout(2500)
        rows = page.eval_on_selector_all(
            'shreddit-post',
            """els => els.map(e => ({
                title: e.getAttribute('post-title'),
                url: e.getAttribute('permalink'),
                time: e.getAttribute('created-timestamp'),
                score: e.getAttribute('score'),
                comments: e.getAttribute('comment-count'),
            }))""")
        for r in rows:
            if r.get('title'):
                print(json.dumps(r, ensure_ascii=False))
    finally:
        ctx.close()
