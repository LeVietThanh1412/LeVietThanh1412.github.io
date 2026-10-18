"""Build a public GitHub project catalog and static HTML; Python stdlib only.

Run from any directory: python scripts/sync_projects.py
Use --offline to render the checked-in snapshot without contacting GitHub.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from html import escape
import json
from pathlib import Path
import re
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts/projects.config.json"
SNAPSHOT = ROOT / "assets/data/projects.json"


def request(url, *, api=False):
    headers = {"User-Agent": "ThanhTech-Portfolio", "Accept": "application/vnd.github+json" if api else "text/html,*/*"}
    # Credentials never go to demo sites or raw content hosts.
    if api and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=headers), timeout=20) as response:
                return response.read(), response.status, response.url
        except HTTPError as error:
            if error.code < 500 or attempt == 2:
                raise
        except (URLError, TimeoutError, OSError):
            if attempt == 2:
                raise
        time.sleep(attempt + 1)


def public_url(value):
    """Only publish complete HTTP(S) links, never executable URL schemes."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if re.search(r"[\s\\]", value):
        return ""
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return ""
    except ValueError:
        return ""
    return value


def pages_url(repo, domain, owner):
    if not repo.get("has_pages"):
        return ""
    # Project Pages inherit the user site's domain unless they have their own CNAME.
    raw = f"https://raw.githubusercontent.com/{owner}/{quote(repo['name'])}/{quote(repo['default_branch'], safe='')}/CNAME"
    try:
        cname = request(raw)[0].decode("utf-8").strip()
        if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", cname):
            return f"https://{cname}/"
    except (HTTPError, URLError, TimeoutError, OSError):
        pass
    return f"https://{domain}/{quote(repo['name'])}/"


def collect(config):
    owner = config["owner"]
    repos = []
    page = 1
    while True:
        url = f"https://api.github.com/users/{owner}/repos?type=owner&per_page=100&sort=pushed&page={page}"
        batch = json.loads(request(url, api=True)[0])
        repos.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    if not repos:
        raise RuntimeError("GitHub returned no repositories; keeping the existing snapshot.")
    domain = (ROOT / "CNAME").read_text(encoding="utf-8").strip() or f"{owner.lower()}.github.io"
    included = [repo for repo in repos if not repo.get("private") and repo["name"] not in config["exclude"]]

    def project(repo):
        name = repo["name"]
        custom = config["overrides"].get(name, {})
        language = repo.get("language") or ""
        category = custom.get("category", "ai" if language == "Jupyter Notebook" else "web" if language in ("HTML", "CSS", "JavaScript", "TypeScript") else "systems")
        demo = public_url(custom.get("demo_url", "")) or pages_url(repo, domain, owner) or public_url(repo.get("homepage"))
        demo_status = "none"
        if demo:
            try:
                _, status, _ = request(demo)
                demo_status = "ok" if status == 200 else str(status)
            except HTTPError as error:
                demo_status = str(error.code)
            except (URLError, TimeoutError, OSError):
                demo_status = "unreachable"
        return {
            "name": name,
            "title": custom.get("title", name.replace("_", " ").replace("-", " ")),
            "description": custom.get("description") or repo.get("description") or f"Mã nguồn và tài liệu của dự án {name}.",
            "url": repo["html_url"],
            "language": language,
            "category": category,
            "stars": repo.get("stargazers_count", 0),
            "fork": repo.get("fork", False),
            "archived": repo.get("archived", False),
            "pushed_at": repo.get("pushed_at"),
            "has_pages": repo.get("has_pages", False),
            "demo_url": demo,
            "demo_status": demo_status,
            "art": custom.get("art", "default"),
        }

    with ThreadPoolExecutor(max_workers=6) as pool:
        projects = list(pool.map(project, included))
    priority = list(dict.fromkeys(config["featured"] + config.get("pinned", [])))
    order = {name: index for index, name in enumerate(priority)}
    projects.sort(key=lambda p: p.get("pushed_at") or "", reverse=True)
    projects.sort(key=lambda p: order.get(p["name"], len(order)))
    return {"owner": owner, "synced_at": datetime.now(timezone.utc).isoformat(), "projects": projects}


def artwork(kind):
    """Small original vector covers, decorative rather than app screenshots."""
    drawings = {
        "3d": '''<g fill="none" stroke="currentColor" stroke-width=".8"><ellipse cx="180" cy="145" rx="132" ry="32" opacity=".2"/><path d="m180 34 82 47v94l-82 47-82-47V81Zm0 0v94m82-47-82 47-82-47m82 47v94"/><path d="m180 57 62 36v70l-62 36-62-36V93Zm0 0v71m62-35-62 35-62-35m62 35v71" opacity=".35"/><path d="M35 128h290M180 12v226" stroke-dasharray="3 6" opacity=".25"/><circle cx="180" cy="128" r="5" fill="currentColor" stroke="none"/><circle cx="262" cy="81" r="3" fill="currentColor"/><circle cx="98" cy="175" r="3" fill="currentColor"/></g>''',
        "fashion": '''<g fill="none" stroke="currentColor" stroke-width="1"><circle cx="180" cy="120" r="87" opacity=".18"/><circle cx="180" cy="120" r="64" opacity=".14"/><path d="m155 46-35 25-22 57 30 10 13-30-10 104h98l-10-104 13 30 30-10-22-57-35-25-25 18Z" fill="currentColor" fill-opacity=".07"/><path d="m155 46 25 18 25-18M180 64v148m-43-45 43-29 43 29M145 83l-6 64m76-64 6 64" opacity=".7"/><path d="m162 86 18 15 18-15-18 39Zm0 91 18 14 18-14" opacity=".5"/><circle cx="180" cy="77" r="2"/><path d="M53 198h39m-19-19v38m197-165h30m-15-15v30" opacity=".35"/></g>''',
        "heart": '''<g fill="none" stroke="currentColor"><path d="M180 199C157 178 89 137 89 91c0-47 62-57 91-13 29-44 91-34 91 13 0 46-68 87-91 108Z" stroke-width="1.2"/><path d="M180 181c-19-18-72-50-72-87 0-35 47-42 72-8 25-34 72-27 72 8 0 37-53 69-72 87Z" stroke-width=".7" opacity=".4"/><path d="M180 215c-28-24-108-74-108-126 0-59 77-70 108-23 31-47 108-36 108 23 0 52-80 102-108 126Z" stroke-width=".7" stroke-dasharray="1 6" opacity=".5"/><circle cx="56" cy="110" r="2"/><circle cx="301" cy="157" r="2"/><circle cx="257" cy="28" r="2"/><circle cx="132" cy="217" r="1.5"/><path d="m64 181 4 4m0-4-4 4m231-99 5 5m0-5-5 5" opacity=".6"/></g>''',
        "default": '''<g fill="none" stroke="currentColor" stroke-width="1"><rect x="72" y="47" width="216" height="145" rx="5"/><path d="M72 74h216m-147 31-23 23 23 23m78-46 23 23-23 23m-25-52-22 58"/><circle cx="87" cy="61" r="2"/><circle cx="98" cy="61" r="2"/><circle cx="109" cy="61" r="2"/></g>''',
    }
    return '<svg class="demo-art" viewBox="0 0 360 240" aria-hidden="true">' + drawings.get(kind, drawings["default"]) + '</svg>'


def render_project(project, index):
    p = project
    title, description, url = escape(p["title"]), escape(p["description"]), escape(p["url"], quote=True)
    search = escape(" ".join([p["name"], p["title"], p["description"], p["language"], p["category"]]), quote=True)
    live = bool(p["demo_url"]) and p["demo_status"] == "ok"
    live_link = f'<a class="live-link" href="{escape(p["demo_url"], quote=True)}" target="_blank" rel="noopener" aria-label="Mở web {title}">Web ↗</a>' if live else ""
    tags = '<span class="fork-label">FORK</span>' if p["fork"] else ""
    if p["archived"]:
        tags += '<span class="fork-label">ARCHIVED</span>'
    stars = f'<span aria-label="{p["stars"]} sao">☆ {p["stars"]}</span>' if p["stars"] else ""
    language_class = re.sub(r"[^a-z-]", "", p["language"].lower().replace(" ", "-"))
    language = escape(p["language"] or "—")
    return f'''<article class="project-row" data-category="{escape(p['category'])}" data-live="{str(live).lower()}" data-search="{search}">
  <span class="project-number" aria-hidden="true">{index:02d}</span>
  <div class="project-info"><h3 class="project-title"><a href="{url}" target="_blank" rel="noopener">{title}<span class="title-arrow" aria-hidden="true">↗</span></a></h3><p class="project-description">{description}</p><div class="project-meta"><span>{escape(p['name'])}</span>{tags}{stars}</div></div>
  <span class="language"><span class="language-dot lang-{language_class}"></span>{language}</span>
  <div class="project-links">{live_link}<a class="source-link" href="{url}" target="_blank" rel="noopener" aria-label="Mã nguồn {title}">↗</a></div>
</article>'''


def render_demo(project, index):
    p = project
    title = escape(p["title"])
    url = escape(p["demo_url"], quote=True)
    path = escape(p["demo_url"].removeprefix("https://").removeprefix("http://").rstrip("/"))
    return f'''<article class="demo-card">
  <a class="demo-preview preview-{escape(p['art'])}" href="{url}" target="_blank" rel="noopener" aria-label="Trải nghiệm {title}"><span class="demo-index">EXPERIMENT / {index:02d}</span>{artwork(p['art'])}<span class="demo-open" aria-hidden="true">↗</span></a>
  <div class="demo-caption"><div class="demo-title-line"><h3><a href="{url}" target="_blank" rel="noopener">{title}</a></h3><a class="demo-source" href="{escape(p['url'], quote=True)}" target="_blank" rel="noopener" aria-label="Mã nguồn {title}">CODE ↗</a></div><p>{escape(p['description'])}</p><a class="demo-path" href="{url}" target="_blank" rel="noopener">{path} ↗</a></div>
</article>'''


def replace_region(html, name, content):
    pattern = rf"(<!-- {name}:START -->).*?(<!-- {name}:END -->)"
    if len(re.findall(pattern, html, flags=re.S)) != 1:
        raise RuntimeError(f"Expected one {name} region in index.html")
    return re.sub(pattern, lambda match: match[1] + "\n" + content + "\n        " + match[2], html, flags=re.S)


def render(data):
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    projects = data["projects"]
    # Prefer curated demos, then automatically include newly discovered working web apps.
    demos = [p for p in projects if p["demo_url"] and p["demo_status"] == "ok" and not p["archived"]]
    html = replace_region(html, "DEMOS", "\n".join(render_demo(p, i) for i, p in enumerate(demos, 1)))
    html = replace_region(html, "PROJECTS", "\n".join(render_project(p, i) for i, p in enumerate(projects, 1)))
    local_time = datetime.fromisoformat(data["synced_at"]).astimezone(timezone(timedelta(hours=7)))
    html = replace_region(html, "SYNC", local_time.strftime("%d.%m.%Y"))
    (ROOT / "index.html").write_text(html, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="render the existing snapshot without GitHub access")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if args.offline:
        data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    else:
        # A failed sync must fail the build, preserving the previous deployment.
        data = collect(config)
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    render(data)
    demos = sum(p["demo_status"] == "ok" for p in data["projects"])
    print(f"Rendered {len(data['projects'])} public projects and {demos} working web demos.")


if __name__ == "__main__":
    main()
