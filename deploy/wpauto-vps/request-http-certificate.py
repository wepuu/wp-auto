#!/www/server/panel/pyenv/bin/python
"""Request one HTTP-01 certificate through BaoTa's existing ACME account."""

import json
import os
import sys

PANEL_ROOT = "/www/server/panel"
sys.path.insert(0, PANEL_ROOT)
sys.path.insert(0, os.path.join(PANEL_ROOT, "class"))

from acme_v2 import acme_v2  # noqa: E402


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: request-http-certificate.py DOMAIN WEBROOT")
    domain, webroot = sys.argv[1:]
    if domain != "test.wpauto.cc":
        raise SystemExit("only test.wpauto.cc is allowed")
    webroot = os.path.realpath(webroot)
    if webroot != "/opt/wpauto-wordpress-e2e/acme-webroot" or not os.path.isdir(webroot):
        raise SystemExit("unexpected ACME webroot")

    client = acme_v2()
    # This vhost is intentionally managed outside BaoTa's site database. The
    # installed panel build otherwise imports an unavailable Docker-site module
    # while trying to replace the explicit webroot supplied below.
    client.get_site_run_path = lambda _domains: None
    result = client.apply_cert([domain], auth_type="http", auth_to=webroot)
    summary = {
        "status": result.get("status") is True,
        "save_path": result.get("save_path"),
        "cert_timeout": result.get("cert_timeout"),
    }
    print(json.dumps(summary, separators=(",", ":")))
    return 0 if summary["status"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
