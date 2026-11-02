"""Command line front end.

Examples::

    python -m localai.extract paper.txt --md out.md --json out.json \
        --source previous_year_paper
    type paper.txt | python -m localai.extract - --source book_pdf

With no ``--md`` / ``--json`` the Markdown goes to stdout, which is the
normal "paste it into the question bank" workflow.
"""

from __future__ import annotations

import argparse
import sys

from .extractor import process_ocr_text
from .profiles import SOURCE_TYPES


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m localai.extract",
        description="Turn raw Mathpix/OCR text into clean structured questions.",
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="-",
        help="input text file, or - for stdin (default: stdin)",
    )
    parser.add_argument(
        "--source",
        "-s",
        choices=list(SOURCE_TYPES),
        default=None,
        help="source type hint; auto-detected when omitted",
    )
    parser.add_argument("--md", "-m", default=None, help="write Markdown to this file")
    parser.add_argument("--json", "-j", default=None, help="write JSON to this file")
    parser.add_argument(
        "--indent", type=int, default=2, help="JSON indent (default: 2)"
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true", help="do not echo Markdown to stdout"
    )
    parser.add_argument(
        "--encoding", default="utf-8", help="input/output encoding (default: utf-8)"
    )
    return parser


def read_input(path: str, encoding: str) -> str:
    if path == "-" or not path:
        return sys.stdin.read()
    with open(path, "r", encoding=encoding, errors="replace") as handle:
        return handle.read()


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        raw = read_input(args.input, args.encoding)
    except OSError as error:
        sys.stderr.write("could not read input: %s\n" % error)
        return 2

    result = process_ocr_text(raw, args.source)
    markdown = result.to_markdown()
    payload = result.to_json(indent=args.indent)

    if args.md:
        with open(args.md, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(markdown + "\n")
    if args.json:
        with open(args.json, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload + "\n")

    if not args.quiet and not args.md:
        sys.stdout.write(markdown + "\n")
    if args.md or args.json:
        stats = result.stats()
        sys.stderr.write(
            "source_type=%s questions=%d passages=%d incomplete=%d\n"
            % (
                result.source_type,
                stats["question_count"],
                stats["passage_count"],
                stats["incomplete_count"],
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
