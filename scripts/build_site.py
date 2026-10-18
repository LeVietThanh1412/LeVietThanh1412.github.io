"""Copy only public site files into the GitHub Pages artifact."""
from pathlib import Path
import hashlib
import shutil

root = Path(__file__).resolve().parents[1]
output = root / "_site"
output.mkdir(exist_ok=True)
for name in ("index.html", "CNAME", "CV.pdf"):
    shutil.copy2(root / name, output / name)
for name in ("assets", "anh", "icon"):
    shutil.copytree(root / name, output / name, dirs_exist_ok=True)
# A returning visitor must load CSS/JS matching the newly deployed HTML.
html = (output / "index.html").read_text(encoding="utf-8")
for asset in ("assets/css/style.css", "assets/js/script.js"):
    version = hashlib.sha256((output / asset).read_bytes()).hexdigest()[:12]
    html = html.replace(f'"{asset}"', f'"{asset}?v={version}"')
(output / "index.html").write_text(html, encoding="utf-8", newline="\n")
(output / ".nojekyll").touch()
print(f"Static website ready: {output}")
