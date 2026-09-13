#!/usr/bin/env python3
"""Pin the corpus: the hub's benchmark data zip, retrieved here, and one run's Inspect log,
downloaded by the owner in a browser.

Two files (docs/p0-record.md section 4, owner's ruling A):
- benchmark_data.zip from the Epoch AI Benchmarking Hub. Retrieved with curl under its default
  user agent; headers dumped; hashed as retrieved; byte count checked against Content-Length.
  Its gpqa_diamond.csv carries the run's published score.
- The run's .eval log. Scripted retrieval is refused (corpus/probe/p0-probe.json), so the owner
  downloads it in a browser from the viewer route and saves it to data/. There is no header dump
  and no Content-Length. Two checks stand in, in this order:
    1. size gate: the byte count, read from the file system, must not exceed 50,000,000 before
       anything opens the file;
    2. identity: the log's own header must match the CSV row on run id, task and model.
  Only identity fields are read from the header. Scores and metrics are not read before P2.

A file that fails a check does not enter the manifest. The check results are written to
corpus/p1-identity.json either way.

    python3 corpus/fetch.py --log data/<run>.eval --downloaded-at 2026-09-13T17:00:00Z
    python3 corpus/fetch.py --verify    # re-hash data/ against the manifest
    python3 corpus/fetch.py --restore   # re-download the zip and compare; the log is manual
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import plistlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MANIFEST = ROOT / "corpus" / "manifest.json"
IDENTITY = ROOT / "corpus" / "p1-identity.json"

RUN_ID = "S5QYXSvQBRSbUbXSnAGbMm"
TABLE = "gpqa_diamond.csv"
ZIP_URL = "https://epoch.ai/data/benchmark_data.zip"
ZIP_PAGE = "https://epoch.ai/benchmarks/use-this-data"
LOG_URL = f"https://epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com/inspect_ai_logs/{RUN_ID}.eval"
LOG_URL_RETRIEVED = f"https://logs.epoch.ai/inspect_ai_logs/{RUN_ID}.eval"
LOG_TRANSPORT = "browser, after the host's human-verification step"
SIZE_GATE = 50_000_000
GPQA_DIAMOND_SAMPLES = 198
REQUIRED = ("url", "version", "licence", "citation", "retrieved_at", "sha256", "bytes")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256_file(path):
    h, n = hashlib.sha256(), 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


def final_headers(path):
    """Status line and headers of the last response curl saw, after any proxy CONNECT or redirect."""
    blocks = path.read_text(errors="replace").replace("\r\n", "\n").strip().split("\n\n")
    blocks = [b for b in blocks if not b.startswith("HTTP/1.1 200 Connection Established")]
    lines = blocks[-1].split("\n")
    fields = [line.split(":", 1) for line in lines[1:] if ":" in line]
    return lines[0].strip(), {k.strip().lower(): v.strip() for k, v in fields}


def retrieve_zip(dest):
    header_dump = dest.with_name(dest.name + ".headers")
    started = now()
    out = subprocess.run(
        ["curl", "-sS", "-L", "--fail", "--max-time", "600", "-D", str(header_dump), "-o", str(dest),
         "-w", "%{url_effective}\n%{http_code}\n%{size_download}", ZIP_URL],
        capture_output=True, text=True, check=True,
    ).stdout.split("\n")
    finished = now()
    _, headers = final_headers(header_dump)
    sha, n = sha256_file(dest)
    declared = headers.get("content-length")
    if n != int(out[2]) or declared is None or int(declared) != n:
        sys.exit(f"{dest.name}: {n} bytes on disk, curl reported {out[2]}, Content-Length {declared}; not entered")
    return {
        "url": ZIP_URL,
        "url_effective": out[0],
        "http_status": int(out[1]),
        "http_content_type": headers.get("content-type"),
        "http_content_length": int(declared),
        "http_last_modified": headers.get("last-modified"),
        "http_etag": headers.get("etag"),
        "http_date": headers.get("date"),
        "header_dump": str(header_dump.relative_to(ROOT)),
        "retrieved_at": started,
        "retrieval_finished": finished,
        "sha256": sha,
        "bytes": n,
    }


def hub_facts(zip_path):
    """Licence, citation and the run's row, read from the pinned zip."""
    with zipfile.ZipFile(zip_path) as z:
        readme = z.read("README.md").decode("utf-8")
        table = z.read(TABLE).decode("utf-8-sig")
    licence_line = next((l.strip() for l in readme.splitlines() if "creativecommons.org/licenses/by/4.0" in l), None)
    cite = re.search(r"### Citation\s*```\s*(.*?)\s*```", readme, re.S)
    reader = csv.reader(io.StringIO(table, newline=""))
    header = next(reader)
    row, first, last, before = None, None, None, reader.line_num
    for fields in reader:
        if len(fields) == len(header) and dict(zip(header, fields)).get("id") == RUN_ID:
            row, first, last = dict(zip(header, fields)), before + 1, reader.line_num
            break
        before = reader.line_num
    if row is None:
        sys.exit(f"{TABLE}: no row with id {RUN_ID}; nothing entered")
    return {
        "licence": "CC-BY-4.0" if licence_line else "not stated",
        "licence_statement": licence_line,
        "citation": cite.group(1) if cite else None,
        "row": row,
        "row_lines": [first, last],
        "rows_in_table": sum(1 for _ in csv.reader(io.StringIO(table, newline=""))) - 1,
    }


def browser_metadata(path):
    """What macOS recorded about the download, if the file still carries it. Informational only."""
    def xattr(name):
        r = subprocess.run(["xattr", "-p", "-x", name, str(path)], capture_output=True, text=True)
        return bytes.fromhex("".join(r.stdout.split())) if r.returncode == 0 else None
    where = xattr("com.apple.metadata:kMDItemWhereFroms")
    quarantine = xattr("com.apple.quarantine")
    stamp = None
    if quarantine:
        parts = quarantine.decode(errors="replace").split(";")
        if len(parts) > 1 and re.fullmatch(r"[0-9a-fA-F]+", parts[1]):
            stamp = dt.datetime.fromtimestamp(int(parts[1], 16), dt.timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "where_froms": plistlib.loads(where) if where else None,
        "quarantine_timestamp": stamp,
    }


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def log_identity(log_path, row):
    """Identity fields only, from the log's header.json (or its start journal if the header is absent)."""
    with zipfile.ZipFile(log_path) as z:
        names = z.namelist()
        member = "header.json" if "header.json" in names else "_journal/start.json"
        head = json.loads(z.read(member))
    ev = head.get("eval", {})
    ds = ev.get("dataset", {}) or {}
    cfg = ev.get("config", {}) or {}
    found = {
        "member": member,
        "archive_members": len(names),
        "sample_members": sum(1 for n in names if n.startswith("samples/")),
        "log_format_version": head.get("version"),
        "status": head.get("status"),
        "eval.eval_id": ev.get("eval_id"),
        "eval.run_id": ev.get("run_id"),
        "eval.task_id": ev.get("task_id"),
        "eval.task": ev.get("task"),
        "eval.created": ev.get("created"),
        "eval.model": ev.get("model"),
        "eval.dataset.name": ds.get("name"),
        "eval.dataset.samples": ds.get("samples"),
        "eval.config.epochs": cfg.get("epochs"),
    }
    id_fields = [k for k in ("eval.eval_id", "eval.run_id", "eval.task_id") if found[k] == row["id"]]
    checks = {
        "run_id": {
            "rule": "the CSV `id` equals at least one of eval.eval_id, eval.run_id, eval.task_id",
            "csv": row["id"], "matching_fields": id_fields, "pass": bool(id_fields),
        },
        "task": {
            "rule": f"eval.task contains 'gpqa' (case-folded) and eval.dataset.samples == {GPQA_DIAMOND_SAMPLES}",
            "csv_table": TABLE, "log_task": found["eval.task"], "log_dataset_samples": found["eval.dataset.samples"],
            "pass": "gpqa" in (found["eval.task"] or "").lower() and found["eval.dataset.samples"] == GPQA_DIAMOND_SAMPLES,
        },
        "model": {
            "rule": "the CSV `Model version`, lower-cased with non-alphanumerics removed, is a substring of eval.model normalised the same way",
            "csv": row["Model version"], "log": found["eval.model"],
            "pass": bool(norm(row["Model version"])) and norm(row["Model version"]) in norm(found["eval.model"]),
        },
    }
    return found, checks


def pin(log_arg, downloaded_at):
    if MANIFEST.exists():
        sys.exit(f"{MANIFEST.relative_to(ROOT)} exists; the corpus is pinned. Use --verify.")
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?Z", downloaded_at):
        sys.exit("--downloaded-at must be UTC, e.g. 2026-09-13T17:00:00Z")
    log_path = pathlib.Path(log_arg).resolve()
    if log_path.parent != DATA:
        sys.exit(f"the log must be in {DATA.relative_to(ROOT)}/")

    record = {"run_id": RUN_ID, "checked_at": now(), "log_file": log_path.name}
    size = log_path.stat().st_size
    record["size_gate"] = {"rule": f"bytes <= {SIZE_GATE}, from the file system, before the file is opened",
                           "bytes": size, "pass": size <= SIZE_GATE}
    if not record["size_gate"]["pass"]:
        IDENTITY.write_text(json.dumps(record, indent=2) + "\n")
        sys.exit(f"{log_path.name}: {size} bytes exceeds the gate; not opened, not entered")
    log_sha, log_bytes = sha256_file(log_path)
    record["size_gate"]["bytes_hashed"] = log_bytes
    record["sha256"] = log_sha

    curl = subprocess.run(["curl", "--version"], capture_output=True, text=True).stdout.split("\n")[0]
    zip_entry = retrieve_zip(DATA / "benchmark_data.zip")
    hub = hub_facts(DATA / "benchmark_data.zip")
    read_at = now()
    row = hub["row"]
    found, checks = log_identity(log_path, row)
    record["log_header"] = found
    record["checks"] = checks
    record["csv_row_lines"] = hub["row_lines"]
    record["pass"] = record["size_gate"]["pass"] and all(c["pass"] for c in checks.values())
    IDENTITY.write_text(json.dumps(record, indent=2) + "\n")
    for name, c in checks.items():
        print(f"identity {name}: {'pass' if c['pass'] else 'FAIL'}  {c}")
    if not record["pass"]:
        sys.exit(f"{log_path.name}: identity check failed; not entered (see {IDENTITY.relative_to(ROOT)})")

    source_row = f"{TABLE} lines {hub['row_lines'][0]}-{hub['row_lines'][1]} inside benchmark_data.zip (sha256 {zip_entry['sha256']})"
    zip_entry = {
        "artifact": "hub-benchmark-data",
        "file": "benchmark_data.zip",
        **zip_entry,
        "transport": f"{curl}; default user agent",
        "page": ZIP_PAGE,
        "version": f"as served {zip_entry['http_date']}; ETag {zip_entry['http_etag']}",
        "licence": hub["licence"],
        "licence_statement": hub["licence_statement"],
        "citation": hub["citation"],
        "rows_in_table": hub["rows_in_table"],
    }
    log_entry = {
        "artifact": "inspect-eval-log",
        "file": log_path.name,
        "url": LOG_URL,
        "url_retrieved": LOG_URL_RETRIEVED,
        "transport": LOG_TRANSPORT,
        "retrieved_at": downloaded_at,
        "retrieved_at_basis": "stated by the owner, who downloaded the file",
        "http_headers": None,
        "http_headers_absent": "browser retrieval: there is no header dump and no Content-Length",
        "scripted_route": {"url": LOG_URL, "result": "HTTP 403, S3 error AccessDenied", "evidence": "corpus/probe/p0-probe.json"},
        "second_retrieval": "not possible: the S3 route answers AccessDenied, so no byte comparison was made",
        "browser_download_metadata": browser_metadata(log_path),
        "sha256": log_sha,
        "bytes": log_bytes,
        "size_gate": record["size_gate"],
        "identity_check": {"result": "pass", "evidence": str(IDENTITY.relative_to(ROOT))},
        "version": f"run {row['id']}, started {row['Started at']} (gpqa_diamond.csv `id`, `Started at`)",
        "licence": "not stated",
        "licence_context": f"{ZIP_PAGE}: Epoch AI's data is under CC BY 4.0, and benchmark questions and answers are the property of their respective creators; neither statement names the logs",
        "citation": hub["citation"],
        "published_score": {
            "value": row["mean_score"],
            "column": "mean_score",
            "stderr": row["stderr"],
            "best_score_across_scorers": row["Best score (across scorers)"],
            "source": source_row,
            "url": ZIP_URL,
            "read_at": read_at,
        },
        "model_identifier": {"value": found["eval.model"], "source": f"{found['member']} eval.model", "basis": "asserted-from-source"},
        "model_version": {"value": row["Model version"], "source": f"{source_row}, column `Model version`", "basis": "asserted-from-source"},
    }
    for entry in (zip_entry, log_entry):
        missing = [k for k in REQUIRED if entry.get(k) in (None, "")]
        if missing:
            sys.exit(f"{entry['file']}: missing {missing}; not entered")
    MANIFEST.write_text(json.dumps({
        "manifest": "typedstandards-eval-run-example corpus",
        "run": {"hub": "Epoch AI Benchmarking Hub", "benchmark": "GPQA Diamond", "table": TABLE, "run_id": RUN_ID},
        "required_fields": list(REQUIRED),
        "files": [zip_entry, log_entry],
    }, indent=2, ensure_ascii=False) + "\n")
    for e in (zip_entry, log_entry):
        print(f"{e['file']}: {e['bytes']} B  sha256 {e['sha256']}")
    print(f"published score {row['mean_score']} from {source_row}")
    print(f"wrote {MANIFEST.relative_to(ROOT)} and {IDENTITY.relative_to(ROOT)}")


def verify():
    ok = True
    for e in json.loads(MANIFEST.read_text())["files"]:
        sha, n = sha256_file(DATA / e["file"])
        good = sha == e["sha256"] and n == e["bytes"]
        ok &= good
        print(f"{e['file']}: {'OK' if good else 'MISMATCH'}")
    sys.exit(0 if ok else 1)


def restore():
    """For a fresh clone. The zip is re-downloaded and compared; the hub updates it, so a mismatch
    means the hub has changed it since pinning. The log cannot be scripted."""
    ok = True
    for e in json.loads(MANIFEST.read_text())["files"]:
        if e["artifact"] == "hub-benchmark-data":
            got = retrieve_zip(DATA / (e["file"] + ".restore"))
            good = got["sha256"] == e["sha256"] and got["bytes"] == e["bytes"]
            if good:
                (DATA / (e["file"] + ".restore")).replace(DATA / e["file"])
            print(f"{e['file']}: {'OK' if good else 'MISMATCH: the hub has changed the file since pinning'}")
        else:
            present = (DATA / e["file"]).exists()
            good = present and sha256_file(DATA / e["file"]) == (e["sha256"], e["bytes"])
            print(f"{e['file']}: {'OK' if good else 'manual: download ' + e['url_retrieved'] + ' in a browser, save it as data/' + e['file'] + ', then run --verify'}")
        ok &= good
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true", help="re-hash data/ against the manifest")
    mode.add_argument("--restore", action="store_true", help="re-download the zip and compare; the log is manual")
    ap.add_argument("--log", help="the browser-downloaded log in data/")
    ap.add_argument("--downloaded-at", help="the owner's download time, UTC")
    args = ap.parse_args()
    if args.verify:
        verify()
    elif args.restore:
        restore()
    elif args.log and args.downloaded_at:
        pin(args.log, args.downloaded_at)
    else:
        ap.error("pinning needs --log and --downloaded-at")
