"""Offline checks for archive export boundaries; no database or provider calls."""

import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from export_archive import Exporter, NoRedirect, canonical_path, validate_base


class ArchiveExportTests(unittest.TestCase):
    def test_owner_write_and_external_paths_are_never_exportable(self):
        for path in (
            "travel/preferences",
            "travel/plans",
            "notifications/subscriptions",
            "ai/chat",
            "livecams/preview",
            "refresh",
            "../summary",
            "https://provider.example/data",
            "//provider.example/data",
            "/regions",
            "regions?x=1&x=2",
            "attachments?spot_ids=1,0",
        ):
            with self.subTest(path=path), self.assertRaises(ValueError):
                canonical_path(path)

    def test_canonical_key_matches_browser_url_search_params(self):
        self.assertEqual(
            canonical_path("attachments?spot_ids=12,2,12&locale=zh-CN"),
            "attachments?locale=zh-CN&spot_ids=2%2C12",
        )

    def test_loopback_origin_only_and_redirects_disabled(self):
        self.assertEqual(
            validate_base("http://127.0.0.1:5188/api/data"),
            "http://127.0.0.1:5188/api/data/",
        )
        for value in (
            "https://provider.example/api/data",
            "http://user:secret@127.0.0.1/api/data",
            "http://127.0.0.1/api/data?token=secret",
            "http://127.0.0.1/api/private",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_base(value)
        self.assertIsNone(
            NoRedirect().redirect_request(
                None, None, 302, "", {}, "http://provider.example"
            )
        )

    def test_original_evidence_is_stored_without_rewriting_or_refetching(self):
        body = b'{"observed_at":"2026-10-30T00:00:00Z","value":null,"status":"stale"}'
        with (
            tempfile.TemporaryDirectory() as folder,
            patch(
                "export_archive.read_http", return_value=(body, "application/json")
            ) as fetch,
        ):
            exporter = Exporter(
                Path(folder), "http://127.0.0.1:5188/api/data", "a" * 40
            )
            result = exporter.get("regions", required=True)
            self.assertEqual(result["observed_at"], "2026-10-30T00:00:00Z")
            path = Path(folder) / exporter.manifest["requests"]["regions"]
            self.assertEqual(path.read_bytes(), body)
            exporter.get("regions")
            self.assertEqual(fetch.call_count, 1)
            resumed = Exporter(Path(folder), "http://127.0.0.1:5188/api/data", "a" * 40)
            resumed.get("regions")
            self.assertEqual(fetch.call_count, 1)

    def test_required_failure_cannot_publish_success_and_error_body_is_not_saved(self):
        error = urllib.error.HTTPError(
            "http://127.0.0.1/api/data/regions", 503, "secret raw exception", {}, None
        )
        with (
            tempfile.TemporaryDirectory() as folder,
            patch("export_archive.read_http", side_effect=error),
        ):
            exporter = Exporter(
                Path(folder), "http://127.0.0.1:5188/api/data", "a" * 40
            )
            with self.assertRaises(RuntimeError):
                exporter.get("regions", required=True)
            self.assertEqual(exporter.manifest["requests"], {})
            self.assertEqual(exporter.manifest["errors"]["regions"]["status"], 503)
            self.assertNotIn("secret", json.dumps(exporter.manifest))
            self.assertFalse((Path(folder) / "manifest.json").exists())

    def test_size_limit_and_active_content_do_not_enter_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = Exporter(
                Path(folder), "http://127.0.0.1:5188/api/data", "a" * 40, max_bytes=2
            )
            with (
                patch(
                    "export_archive.read_http",
                    return_value=(b'{"large":true}', "application/json"),
                ),
                self.assertRaises(RuntimeError),
            ):
                exporter.get("regions", required=True)
            with patch(
                "export_archive.read_http",
                return_value=(b"<script>alert(1)</script>", "text/html"),
            ):
                exporter.photo(1)
            self.assertEqual(exporter.manifest["attachments"], {})
            self.assertEqual(list((Path(folder) / "images").iterdir()), [])

    def test_completed_archive_is_immutable(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "manifest.json").write_text("{}")
            with self.assertRaises(ValueError):
                Exporter(Path(folder), "http://127.0.0.1:5188/api/data", "a" * 40)


if __name__ == "__main__":
    unittest.main()
