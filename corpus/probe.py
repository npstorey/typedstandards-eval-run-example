#!/usr/bin/env python3
"""P0: probe the two published routes to one run's Inspect log, without downloading it.

The Epoch AI Benchmarking Hub's GPQA Diamond table (gpqa_diamond.csv inside
https://epoch.ai/data/benchmark_data.zip) gives each run a `Logs` URL on an S3 bucket and a
`Log viewer` URL that reads the same path from logs.epoch.ai. For the chosen run, each route
gets one HEAD and one GET for the first byte only (`Range: bytes=0-0`). A 206 answer carries
the total size in Content-Range; any other answer is recorded as it came.

Header dumps and the first 1 KB of each response body land in corpus/probe/, with a summary
in corpus/probe/p0-probe.json. Transfers use curl under its default user agent, as
corpus/fetch.py will.

    python3 corpus/probe.py
"""
import datetime as dt
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "corpus" / "probe"

RUN_ID = "S5QYXSvQBRSbUbXSnAGbMm"
ROUTES = {
    "s3": f"https://epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com/inspect_ai_logs/{RUN_ID}.eval",
    "logs-epoch-ai": f"https://logs.epoch.ai/inspect_ai_logs/{RUN_ID}.eval",
}
BODY_KEEP = 1024


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def final_headers(path):
    """Status line and headers of the last response curl saw, after any proxy CONNECT or redirect."""
    blocks = path.read_text(errors="replace").replace("\r\n", "\n").strip().split("\n\n")
    blocks = [b for b in blocks if not b.startswith("HTTP/1.1 200 Connection Established")]
    lines = blocks[-1].split("\n") if blocks else [""]
    fields = [line.split(":", 1) for line in lines[1:] if ":" in line]
    return lines[0].strip(), {k.strip().lower(): v.strip() for k, v in fields}


def request(route, url, method):
    stem = f"{route}.{method}"
    dump, body = OUT / f"{stem}.headers", OUT / f"{stem}.body"
    args = ["curl", "-sS", "-L", "--max-time", "60", "-D", str(dump), "-o", str(body),
            "-w", "%{url_effective}\n%{http_code}\n%{size_download}\n%{content_type}"]
    args += ["-I"] if method == "head" else ["-r", "0-0"]
    started = now()
    run = subprocess.run(args + [url], capture_output=True, text=True)
    out = run.stdout.split("\n")
    status_line, headers = final_headers(dump) if dump.exists() else ("", {})
    raw = body.read_bytes() if body.exists() else b""
    body.write_bytes(raw[:BODY_KEEP])
    s3_code = re.search(rb"<Code>([^<]*)</Code>", raw)
    title = re.search(rb"<title>([^<]*)</title>", raw)
    return {
        "route": route,
        "method": "HEAD" if method == "head" else "GET Range: bytes=0-0",
        "url": url,
        "requested_at": started,
        "curl_exit": run.returncode,
        "curl_stderr": run.stderr.strip() or None,
        "url_effective": out[0] if out and out[0] else None,
        "http_status": int(out[1]) if len(out) > 1 and out[1].isdigit() else None,
        "status_line": status_line,
        "content_type": headers.get("content-type"),
        "content_length": headers.get("content-length"),
        "content_range": headers.get("content-range"),
        "x_amzn_waf_action": headers.get("x-amzn-waf-action"),
        "server": headers.get("server"),
        "body_bytes_received": len(raw),
        "body_s3_error_code": s3_code.group(1).decode() if s3_code else None,
        "body_html_title": title.group(1).decode().strip() if title else None,
        "files": [str(dump.relative_to(ROOT)), str(body.relative_to(ROOT))],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    curl = subprocess.run(["curl", "--version"], capture_output=True, text=True).stdout.split("\n")[0]
    results = [request(r, u, m) for r, u in ROUTES.items() for m in ("head", "range")]
    public = any(x["http_status"] in (200, 206) for x in results)
    (OUT / "p0-probe.json").write_text(json.dumps({
        "run_id": RUN_ID,
        "transport": f"{curl}; default user agent",
        "results": results,
        "any_route_served_bytes_of_the_log": public,
    }, indent=2) + "\n")
    for x in results:
        print(f"{x['requested_at']}  {x['route']:14} {x['method']:22} {x['http_status']}  "
              f"{x['content_type']}  s3={x['body_s3_error_code']}  waf={x['x_amzn_waf_action']}  "
              f"title={x['body_html_title']}  range={x['content_range']}")
    print(f"any route served bytes of the log: {public}")
    print(f"wrote {(OUT / 'p0-probe.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
