"""Copy only public site files into the GitHub Pages artifact."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
output = root / "_site"
output.mkdir(exist_ok=True)
for name in ("index.html", "CNAME", "CV.pdf"):
    shutil.copy2(root / name, output / name)
for name in ("assets", "anh", "icon"):
    shutil.copytree(root / name, output / name, dirs_exist_ok=True)
(output / ".nojekyll").touch()
print(f"Static website ready: {output}")
