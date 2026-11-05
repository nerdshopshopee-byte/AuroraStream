#!/usr/bin/env python3
# Driver PTY para responder interativamente o `bubblewrap init`
import os
import pty
import re
import select
import subprocess
import sys
import time

PASSWORD = "Aurora@2026"

PATTERNS = [
    # (regex, resposta)
    (r"download.*(JDK|jdk)|JDK.*download", "y\n"),
    (r"download.*SDK|SDK.*download", "y\n"),
    (r"\? Domain", "a2a6c14e-256a-468c-98de-bdc168cf98b2.space-z.ai\n"),
    (r"URL path", "/\n"),
    (r"package[Ii]d|package name", "com.aurorastream.twa\n"),
    (r"application[Nn]ame", "\n"),
    (r"reuse.*[Kk]ey ?[Ss]tore|create.*new", "\n"),  # default: Create new
    (r"key[Ss]tore[Pp]ath", "\n"),
    (r"[Kk]ey[Ss]tore.*[Pp]assword|new password", PASSWORD + "\n"),
    (r"key[Aa]lias", "\n"),
    (r"key.*password|repeat", PASSWORD + "\n"),
    (r"\(Y/n\)|\(y/N\)", "y\n"),
    (r"shortcut", "\n"),
    (r"theme.?[Cc]olor", "\n"),
    (r"display.?mode|display", "\n"),
    (r"orientation", "\n"),
    (r"splash", "\n"),
    (r"icon", "\n"),
]


def main():
    cmd = sys.argv[1:]
    master, slave = pty.openpty()
    p = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave,
                         close_fds=True, env={**os.environ, "FORCE_COLOR": "0"})
    os.close(slave)
    buf = b""
    last_sent = 0.0
    sent = set()
    t0 = time.time()
    while True:
        if time.time() - t0 > 1200:
            print("\n[driver] TIMEOUT")
            break
        r, _, _ = select.select([master], [], [], 1.0)
        if r:
            try:
                data = os.read(master, 4096)
            except OSError:
                break
            if not data:
                break
            buf += data
            text = buf.decode("utf-8", "replace")
            sys.stdout.write(data.decode("utf-8", "replace"))
            sys.stdout.flush()
            # responde ao último prompt visível que ainda não foi respondido
            for i, (pat, ans) in enumerate(PATTERNS):
                if i in sent:
                    continue
                if re.search(pat, text[-600:]):
                    time.sleep(0.4)
                    os.write(master, ans.encode())
                    sent.add(i)
                    last_sent = time.time()
                    sys.stderr.write(f"\n[driver] respondido padrao#{i}\n")
                    break
        elif p.poll() is not None:
            break
    try:
        p.wait(timeout=20)
    except subprocess.TimeoutExpired:
        p.kill()
    code = p.returncode
    print(f"\n[driver] exit={code}")
    sys.exit(code if code is not None else 1)


if __name__ == "__main__":
    main()
