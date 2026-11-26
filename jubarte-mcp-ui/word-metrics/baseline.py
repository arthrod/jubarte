# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""#98 baseline: Word's page count beside the card's, per sweep document.

    python3 jubarte-mcp-ui/word-metrics/baseline.py SWEEP_ROOT WORD_PDFS REPORT.json [...] > baseline.tsv

The card counts come from the viewer sweep's report.json, one column per
report; the summary goes to stderr.
"""

import hashlib
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

root, word, reports = Path(sys.argv[1]), Path(sys.argv[2]), [Path(p) for p in sys.argv[3:]]
cards = []
for report in reports:
    rows = json.loads(report.read_text())
    cards.append(
        {r["name"]: (int(m.group(1)) if (m := re.match(r"(\d+) pages?", r.get("meta") or "")) else None) for r in rows}
    )


def word_pages(name):
    pdf = word / (Path(name).stem + "_byword.pdf")
    if not pdf.exists():
        return None
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    return int(m.group(1)) if m else None


print("\t".join(["name", "sha256", "word", *[r.parent.name for r in reports]]))
errs = [[] for _ in reports]
for doc in sorted(root.glob("*.docx")):
    w = word_pages(doc.name)
    row = [doc.name, hashlib.sha256(doc.read_bytes()).hexdigest(), "" if w is None else str(w)]
    for i, c in enumerate(cards):
        n = c.get(doc.name)
        row.append("" if n is None else str(n))
        if w is not None and n is not None:
            errs[i].append(abs(n - w))
    print("\t".join(row))
for report, e in zip(reports, errs):
    print(
        f"# {report.parent.name}: n={len(e)} exact={sum(x == 0 for x in e)} within1={sum(x <= 1 for x in e)} "
        f"median_abs={statistics.median(e) if e else 'n/a'} mean_abs={statistics.mean(e) if e else 0:.2f}",
        file=sys.stderr,
    )
