"""Behavior checks for public catalog discovery and safe static rendering."""
from copy import deepcopy
from pathlib import Path
import json
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sync_projects as sync


def repo(name, **extra):
    return {
        "name": name, "private": False, "language": "Python", "description": None,
        "homepage": None, "has_pages": False, "default_branch": "main",
        "html_url": f"https://github.com/example/{name}", "pushed_at": "2026-10-01T00:00:00Z",
        **extra,
    }


CONFIG = {"owner": "example", "exclude": ["profile"], "featured": [], "overrides": {}}


class CatalogTests(unittest.TestCase):
    def test_pagination_excludes_private_and_profile_but_keeps_forks(self):
        first = [repo(f"repo-{n}") for n in range(100)]
        second = [repo("private", private=True), repo("profile"), repo("a-fork", fork=True)]

        def request(url, **kwargs):
            data = first if parse_qs(urlsplit(url).query)["page"] == ["1"] else second
            return json.dumps(data).encode(), 200, url

        with patch.object(sync, "request", side_effect=request) as mocked:
            data = sync.collect(CONFIG)
        names = {p["name"] for p in data["projects"]}
        self.assertEqual(len(names), 101)
        self.assertNotIn("private", names)
        self.assertNotIn("profile", names)
        self.assertTrue(next(p for p in data["projects"] if p["name"] == "a-fork")["fork"])
        self.assertEqual(mocked.call_count, 2)

    def test_new_pages_repo_is_discovered_without_an_override(self):
        entries = [repo("New App", has_pages=True)]

        def request(url, **kwargs):
            if "api.github.com" in url:
                return json.dumps(entries).encode(), 200, url
            if "raw.githubusercontent.com" in url:
                raise HTTPError(url, 404, "Not found", None, None)
            return b"<html>New app</html>", 200, url

        with patch.object(sync, "request", side_effect=request):
            project = sync.collect(CONFIG)["projects"][0]
        self.assertEqual(project["demo_url"], "https://thanhtech.cloud/New%20App/")
        self.assertEqual(project["demo_status"], "ok")
        self.assertIn('class="live-link"', sync.render_project(project, 1))

    def test_project_custom_domain_is_respected(self):
        with patch.object(sync, "request", return_value=(b"demo.example.org\n", 200, "")):
            url = sync.pages_url(repo("demo", has_pages=True), "thanhtech.cloud", "example")
        self.assertEqual(url, "https://demo.example.org/")

    def test_failed_demo_keeps_source_but_has_no_web_button(self):
        entries = [repo("broken-demo", homepage="https://demo.example.org/")]

        def request(url, **kwargs):
            if "api.github.com" in url:
                return json.dumps(entries).encode(), 200, url
            raise HTTPError(url, 530, "Unavailable", None, None)

        with patch.object(sync, "request", side_effect=request):
            project = sync.collect(CONFIG)["projects"][0]
        self.assertEqual(project["demo_status"], "530")
        html = sync.render_project(project, 1)
        self.assertIn("github.com/example/broken-demo", html)
        self.assertNotIn('class="live-link"', html)

    def test_github_content_is_escaped_in_text_and_attributes(self):
        malicious = '<img src=x onerror="alert(1)">'
        project = {
            "name": malicious, "title": malicious, "description": malicious,
            "url": "https://github.com/example/safe", "language": "Python",
            "category": "ai", "fork": True, "archived": False, "stars": 0,
            "demo_url": "", "demo_status": "none",
        }
        html = sync.render_project(project, 1)
        self.assertNotIn("<img", html)
        self.assertIn("&lt;img", html)
        self.assertIn("FORK", html)

    def test_invalid_homepage_schemes_cannot_be_published(self):
        for value in ("javascript:alert(1)", "//example.org", "https://u:password@example.org", "https://[broken", "https://example.org/\npath", None):
            with self.subTest(value=value):
                self.assertEqual(sync.public_url(value), "")
        self.assertEqual(sync.public_url("https://example.org/app/"), "https://example.org/app/")

    def test_priority_does_not_hide_other_projects(self):
        config = deepcopy(CONFIG)
        config["featured"] = ["demo"]
        config["pinned"] = ["important"]
        entries = [repo("newest", pushed_at="2026-10-18T00:00:00Z"), repo("important"), repo("demo")]
        with patch.object(sync, "request", return_value=(json.dumps(entries).encode(), 200, "")):
            data = sync.collect(config)
        self.assertEqual([p["name"] for p in data["projects"]], ["demo", "important", "newest"])


if __name__ == "__main__":
    unittest.main()
