import os
from pathlib import Path


def _load(env):
    if not Path(env).exists():
        return
    for line in Path(env).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


_load("/app/frontend/.env")
_load("/app/backend/.env")
