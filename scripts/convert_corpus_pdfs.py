#!/usr/bin/env python3
"""Convert gold corpus PDFs to text files using pdfplumber.

One-time preprocessing script. Extracts text from all PDFs in
data/gold-corpus/{TICKER}/ and writes .txt files alongside them.
The existing _load_corpus_parts() in gold_agent.py already handles
text files, so no runtime code changes are needed.

Usage:
    python scripts/convert_corpus_pdfs.py
    python scripts/convert_corpus_pdfs.py --delete-pdfs  # remove PDFs after conversion
"""

import argparse
import os
import sys

import pdfplumber


CORPUS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "gold-corpus")


def convert_pdf(pdf_path: str) -> str:
    """Extract text from a PDF, returning the output path."""
    txt_path = os.path.splitext(pdf_path)[0] + ".txt"
    pages = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            tables = page.extract_tables()

            parts = [f"=== Page {i} ===", text]

            for table in tables:
                if table:
                    header = table[0]
                    rows = table[1:]
                    table_text = "\t".join(str(c or "") for c in header) + "\n"
                    for row in rows:
                        table_text += "\t".join(str(c or "") for c in row) + "\n"
                    parts.append(f"[Table]\n{table_text}")

            pages.append("\n".join(parts))

    content = "\n\n".join(pages)

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(content)

    return txt_path


def main():
    parser = argparse.ArgumentParser(description="Convert gold corpus PDFs to text")
    parser.add_argument("--delete-pdfs", action="store_true", help="Delete PDFs after conversion")
    args = parser.parse_args()

    corpus_dir = os.path.abspath(CORPUS_DIR)
    if not os.path.isdir(corpus_dir):
        print(f"Corpus directory not found: {corpus_dir}")
        sys.exit(1)

    print(f"Corpus directory: {corpus_dir}\n")

    total_pdf_bytes = 0
    total_txt_bytes = 0
    converted = 0

    for ticker in sorted(os.listdir(corpus_dir)):
        ticker_dir = os.path.join(corpus_dir, ticker)
        if not os.path.isdir(ticker_dir):
            continue

        pdfs = [f for f in os.listdir(ticker_dir) if f.lower().endswith(".pdf")]
        if not pdfs:
            continue

        print(f"--- {ticker} ---")
        for pdf_name in sorted(pdfs):
            pdf_path = os.path.join(ticker_dir, pdf_name)
            pdf_size = os.path.getsize(pdf_path)
            total_pdf_bytes += pdf_size

            try:
                txt_path = convert_pdf(pdf_path)
                txt_size = os.path.getsize(txt_path)
                total_txt_bytes += txt_size
                converted += 1

                ratio = pdf_size / txt_size if txt_size > 0 else float("inf")
                print(f"  {pdf_name}")
                print(f"    PDF: {pdf_size:,} bytes")
                print(f"    TXT: {txt_size:,} bytes ({ratio:.0f}x reduction)")

                if args.delete_pdfs:
                    os.remove(pdf_path)
                    print(f"    Deleted PDF")

            except Exception as e:
                print(f"  {pdf_name}: FAILED - {e}")

        print()

    print(f"Summary: {converted} PDFs converted")
    print(f"  Total PDF: {total_pdf_bytes:,} bytes ({total_pdf_bytes / 1024 / 1024:.1f} MB)")
    print(f"  Total TXT: {total_txt_bytes:,} bytes ({total_txt_bytes / 1024 / 1024:.1f} MB)")
    if total_txt_bytes > 0:
        print(f"  Reduction: {total_pdf_bytes / total_txt_bytes:.0f}x")


if __name__ == "__main__":
    main()
