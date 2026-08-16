from pathlib import Path

p = Path(r"C:/Users/siddu/AppData/Local/Temp/jarvis-page.js")
t = p.read_text(encoding="utf-8", errors="ignore")
print("size", len(t))
needles = [
    "Line_ is not",
    'createElement("line_"',
    "createElement('line_'",
    "line_",
    "DreiLine",
    "BRAIN GRAPH FAULT",
    "components/BrainGraph",
    "distanceFactor",
    "LineSegments2",
    "Line2()",
]
for needle in needles:
    print(f"{needle!r}: {t.count(needle)}")
print("custom Line fn:", "function Line({ a, b, color, opacity })" in t)
print("Html import used:", "distanceFactor" in t and "components/BrainGraph" in t)
