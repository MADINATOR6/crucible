"""Extract text from nursing-a2/modules/ into nursing-a2/modules_text/, one file per source.

Every page or slide is prefixed with a marker such as [[p.3]] or [[slide 12]] so that
content can be cited as "<file name> + <marker>". Pages with no extractable text are
listed in modules_text/INDEX.md so they can be read visually (scanned pages).

Usage (from the repo root or nursing-a2/):  python nursing-a2/tools/extract_modules.py
Needs only the standard library, plus pypdf for PDFs.
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "modules"
OUT = ROOT / "modules_text"

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/package/2006/relationships",
}
EMPTY_THRESHOLD = 25  # characters; below this a page is probably scanned or image-only


def pdf_pages(path):
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    for i, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # a damaged page should not stop the whole run
            text = f"(extraction error: {exc})"
        yield f"p.{i}", text


def _slide_number(name):
    return int(re.search(r"(\d+)\.xml$", name).group(1))


def _drawing_text(xml_bytes):
    root = ET.fromstring(xml_bytes)
    lines = []
    for para in root.iter(f"{{{NS['a']}}}p"):
        line = "".join(t.text or "" for t in para.iter(f"{{{NS['a']}}}t")).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def pptx_pages(path):
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        slides = sorted(
            (n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=_slide_number
        )
        # Slide order in the deck comes from presentation.xml; file numbers usually match it.
        order = _presentation_order(z, names) or slides
        for idx, slide in enumerate(order, 1):
            text = _drawing_text(z.read(slide))
            notes = _notes_for(z, names, slide)
            if notes:
                text += "\n[speaker notes]\n" + notes
            yield f"slide {idx}", text


def _presentation_order(z, names):
    if "ppt/presentation.xml" not in names or "ppt/_rels/presentation.xml.rels" not in names:
        return None
    rels = ET.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels.iter(f"{{{NS['r']}}}Relationship")}
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    pns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    rid = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    order = []
    for sld in pres.iter(f"{{{pns}}}sldId"):
        target = targets.get(sld.get(rid), "")
        full = "ppt/" + target.lstrip("/").replace("ppt/", "", 1)
        if full in names:
            order.append(full)
    return order


def _notes_for(z, names, slide):
    rel = slide.replace("slides/", "slides/_rels/") + ".rels"
    if rel not in names:
        return ""
    rels = ET.fromstring(z.read(rel))
    for r in rels.iter(f"{{{NS['r']}}}Relationship"):
        if r.get("Type", "").endswith("/notesSlide"):
            target = "ppt/" + r.get("Target").replace("../", "")
            if target in names:
                text = _drawing_text(z.read(target))
                # Drop the bare slide-number placeholder that notes pages carry.
                return "\n".join(l for l in text.splitlines() if not l.strip().isdigit())
    return ""


def docx_pages(path):
    """Word files have no fixed pages; page breaks Word last rendered are used as an estimate."""
    w = NS["w"]
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    page, buf = 1, []
    pages = []
    for para in root.iter(f"{{{w}}}p"):
        breaks = sum(1 for _ in para.iter(f"{{{w}}}lastRenderedPageBreak")) + sum(
            1 for b in para.iter(f"{{{w}}}br") if b.get(f"{{{w}}}type") == "page"
        )
        if breaks and buf:
            pages.append((page, "\n".join(buf)))
            buf = []
        page += breaks
        line = "".join(t.text or "" for t in para.iter(f"{{{w}}}t")).strip()
        if line:
            buf.append(line)
    if buf:
        pages.append((page, "\n".join(buf)))
    for n, text in pages:
        yield f"p.~{n}", text


def txt_pages(path):
    """Canvas page exports: one unit per '[[page: slug]]' block, cited as 'page <slug>'."""
    parts = re.split(r"\[\[page: ([^\]]+)\]\]", path.read_text(encoding="utf-8"))
    for i in range(1, len(parts), 2):
        yield f"page {parts[i]}", parts[i + 1]


HANDLERS = {".pdf": pdf_pages, ".pptx": pptx_pages, ".docx": docx_pages, ".txt": txt_pages}
VISUAL = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def main():
    global SRC, OUT
    if len(sys.argv) > 1:  # optional: extract_modules.py <source dir> <output dir>
        SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
    if not SRC.is_dir():
        sys.exit(f"No modules folder at {SRC}")
    OUT.mkdir(exist_ok=True)
    index = ["# modules_text index", "", "| File | Type | Units | Empty units (read visually) |", "|---|---|---|---|"]
    for path in sorted(p for p in SRC.rglob("*") if p.is_file()):
        rel = path.relative_to(SRC).as_posix()
        ext = path.suffix.lower()
        if ext in VISUAL:
            index.append(f"| {rel} | image | 1 | read visually |")
            continue
        handler = HANDLERS.get(ext)
        if not handler:
            index.append(f"| {rel} | {ext or '?'} | - | UNSUPPORTED: convert to PDF/PPTX/DOCX or read manually |")
            continue
        try:
            units = list(handler(path))
        except Exception as exc:
            index.append(f"| {rel} | {ext} | - | ERROR: {exc} |")
            continue
        empty = [m for m, t in units if len(t.strip()) < EMPTY_THRESHOLD]
        body = [f"# {rel}", ""]
        for marker, text in units:
            body += [f"[[{marker}]]", text.strip(), ""]
        target = OUT / (rel.replace("/", "__") + ".txt")
        target.write_text("\n".join(body), encoding="utf-8")
        shown = ", ".join(empty[:30]) + (" ..." if len(empty) > 30 else "")
        index.append(f"| {rel} | {ext[1:]} | {len(units)} | {shown or 'none'} |")
    (OUT / "INDEX.md").write_text("\n".join(index) + "\n", encoding="utf-8")
    print("\n".join(index))


if __name__ == "__main__":
    main()
