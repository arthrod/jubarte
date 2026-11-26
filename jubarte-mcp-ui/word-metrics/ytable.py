# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Every text line of a PDF with its page and box, in points from the page
top, read with poppler's `pdftotext -bbox-layout` (#98).

    python3 jubarte-mcp-ui/word-metrics/ytable.py FILE.pdf > FILE.json
"""

import json
import subprocess
import sys
import xml.etree.ElementTree as ET

NS = "{http://www.w3.org/1999/xhtml}"


def lines(pdf):
    xml = subprocess.run(["pdftotext", "-bbox-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    root = ET.fromstring(xml)
    out = []
    for number, page in enumerate(root.iter(NS + "page"), 1):
        for line in page.iter(NS + "line"):
            words = list(line.iter(NS + "word"))
            if not words:
                continue
            box = {k: round(float(line.get(k)), 2) for k in ("xMin", "yMin", "xMax", "yMax")}
            out.append({"page": number, **box, "text": " ".join(w.text or "" for w in words)})
    return out


if __name__ == "__main__":
    json.dump(lines(sys.argv[1]), sys.stdout, indent=1, ensure_ascii=False)
    print()
