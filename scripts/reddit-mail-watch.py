#!/usr/bin/env python3
"""IMAP IDLE watcher for Reddit notification mails.

Runs as a systemd user service. On new mail from redditmail.com whose
subject looks like a reply/mention (not a digest), writes the event to
/tmp/nla/mail-events/<ts>.json and spawns a headless claude session to
draft the response. The headless session notifies the interactive
session; posting stays gated on human review.
"""
import email
import imaplib
import json
import os
import re
import subprocess
import time
from email.header import decode_header

USER = 'nbg2974@gmail.com'
PASSWORD = 'fqfdqkhreymlvkzf'
EVENTS = '/tmp/nla/mail-events'
SEEN = '/tmp/nla/mail-seen'
REPLY_SUBJECT = re.compile(r'回复了|replied to|mentioned you|comment reply',
                           re.I)
REPO = '/mnt/Code/Nonlinear-animation-is-all-you-need'

os.makedirs(EVENTS, exist_ok=True)
os.makedirs(SEEN, exist_ok=True)


def msg_subject(msg):
    return str(email.header.make_header(decode_header(msg['Subject'] or '')))


def msg_body(msg):
    html = ''
    for part in msg.walk():
        ct = part.get_content_type()
        if ct == 'text/plain' and not html:
            return part.get_payload(decode=True).decode('utf-8', 'ignore')
        if ct == 'text/html' and not html:
            html = part.get_payload(decode=True).decode('utf-8', 'ignore')
    text = re.sub(r'<style.*?</style>', '', html, flags=re.S)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&#847;|&zwnj;|&nbsp;', ' ', text)
    return re.sub(r'\s+', ' ', text)


def handle(m, uid):
    typ, data = m.fetch(uid, '(RFC822)')
    msg = email.message_from_bytes(data[0][1])
    subject = msg_subject(msg)
    sender = msg.get('From', '')
    ego = 'extensions.gnome.org' in sender or 'gnome.org' in sender
    if not ego and 'redditmail.com' not in sender:
        return
    if not ego and not REPLY_SUBJECT.search(subject):
        return  # digest or popularity mail, not a directed reply
    if ego:
        # EGO review/comment notifications need no drafting, only notify
        event = {'subject': subject, 'kind': 'ego',
                 'body': msg_body(msg)[:2000],
                 'time': time.strftime('%FT%T')}
        path = os.path.join(EVENTS, f'ego-{int(time.time())}.json')
        with open(path, 'w') as f:
            json.dump(event, f, ensure_ascii=False, indent=1)
        open(os.path.join(SEEN, str(uid)), 'w').close()
        subprocess.Popen(
            ['claude', '-p', '--dangerously-skip-permissions',
             f'EGO notification event at {path}. Read it; if it says a '
             f'version was approved or rejected, check the live EGO API '
             f'(curl via proxy 127.0.0.1:7890, extension uuid '
             f'nonlinear-animation@nbgroup) and summarize current hosted '
             f'state. Then SendMessage the main session (name: '
             f'nonlinear-animation-v2) with a two-line summary and exit.'],
            cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True)
        return
    body = msg_body(msg)[:3000]
    links = re.findall(r'https://reddit\.com[^\s"<]+', body)
    event = {'subject': subject, 'links': links[:4], 'body': body,
             'time': time.strftime('%FT%T')}
    path = os.path.join(EVENTS, f'{int(time.time())}.json')
    with open(path, 'w') as f:
        json.dump(event, f, ensure_ascii=False, indent=1)
    open(os.path.join(SEEN, str(uid)), 'w').close()
    subprocess.Popen(
        ['claude', '-p', '--dangerously-skip-permissions',
         f'New reddit reply event at {path}. Read it, then: ensure the '
         f'CDP chrome (port 9224) is reachable; if not, relaunch it with '
         f'the standard line from project memory (google-chrome-stable, '
         f'user-data-dir /tmp/nla/cdp-test, proxy 7890). Fetch the thread '
         f'via old.reddit and draft a reply per '
         f'.claude/skills/reddit-voice/SKILL.md. Write the draft to '
         f'{path}.draft.md. DO NOT post it; posting is review-gated. '
         f'When done, send a cross-session message to the main session '
         f'(name: nonlinear-animation-v2) via SendMessage summarizing the '
         f'reply and the draft path, then exit.'],
        cwd=REPO,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True)


def drain(m):
    typ, data = m.search(None, 'UNSEEN')
    for uid in data[0].split():
        if os.path.exists(os.path.join(SEEN, uid.decode())):
            continue
        try:
            handle(m, uid)
        except Exception as e:
            print('handle error:', e, flush=True)


while True:
    m = None
    try:
        m = imaplib.IMAP4_SSL('imap.gmail.com', 993)
        m.login(USER, PASSWORD)
        m.select('INBOX')
        drain(m)
        while True:
            typ, _ = m.noop()
            m.send(b'a IDLE\r\n')
            m.readline()  # continuation
            # Gmail pushes on new mail; block up to 29 min (IMAP limit)
            m.sock.settimeout(29 * 60)
            try:
                line = m.readline()
            except (TimeoutError, OSError):
                line = b''
            m.send(b'DONE\r\n')
            m.readline()
            if b'EXISTS' in line or b'RECENT' in line:
                m.select('INBOX')
                drain(m)
            time.sleep(1)
    except Exception as e:
        print('watcher error:', e, flush=True)
        time.sleep(60)
    finally:
        try:
            if m:
                m.logout()
        except Exception:
            pass
