#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import db  # noqa: E402
from app.homologation import build_matrix, evidence_template, promotion_proposal, validate_evidence  # noqa: E402


def _generator(tag: str) -> dict:
    tag_cf = tag.strip().casefold()
    matches = [g for g in db.list_generators() if str(g.get("tag") or "").casefold() == tag_cf]
    if len(matches) != 1:
        raise SystemExit(f"Gerador não encontrado/unívoco: {tag}")
    return matches[0]


def cmd_matrix(args):
    rows = build_matrix()
    if args.tag:
        rows = [r for r in rows if str(r.get("tag") or "").casefold() == args.tag.casefold()]
    if args.action:
        rows = [r for r in rows if r.get("action") == args.action]
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return
    print("TAG\tMODELO\tAÇÃO\tSTATUS\tFW")
    for row in rows:
        fw = ",".join(row["firmwareInventory"]) or "-"
        print(f"{row['tag']}\t{row['controllerModel']}\t{row['action']}\t{row['status']}\t{fw}")


def cmd_template(args):
    payload = evidence_template(_generator(args.tag), args.action)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(path)
    else:
        print(text, end="")


def cmd_pending(args):
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    generators = {str(g.get("tag") or ""): g for g in db.list_generators() if g.get("enabled")}
    written = []
    skipped = []
    for row in build_matrix():
        candidate = row.get("candidate")
        if not candidate or not candidate.get("documented"):
            skipped.append({"tag": row.get("tag"), "action": row.get("action"), "status": row.get("status")})
            continue
        generator = generators.get(str(row.get("tag") or ""))
        if not generator:
            continue
        payload = evidence_template(generator, str(row["action"]))
        path = output_dir / f"{row['tag']}-{row['action']}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        written.append(str(path))
    summary = {
        "outputDir": str(output_dir),
        "written": len(written),
        "skipped": len(skipped),
        "files": written,
        "skippedActions": skipped,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def _load(path):
    return json.loads(Path(path).read_text())


def cmd_validate(args):
    errors = validate_evidence(_load(args.file))
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        raise SystemExit(2)
    print("EVIDENCE: OK")


def cmd_proposal(args):
    print(json.dumps(promotion_proposal(_load(args.file)), ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Matriz e evidências de homologação. Não envia comandos industriais."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("matrix")
    p.add_argument("--tag")
    p.add_argument("--action")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_matrix)

    p = sub.add_parser("template")
    p.add_argument("--tag", required=True)
    p.add_argument("--action", required=True)
    p.add_argument("--output")
    p.set_defaults(func=cmd_template)

    p = sub.add_parser("pending")
    p.add_argument("--output-dir", required=True)
    p.set_defaults(func=cmd_pending)

    p = sub.add_parser("validate")
    p.add_argument("file")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("proposal")
    p.add_argument("file")
    p.set_defaults(func=cmd_proposal)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
