import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent


class RetirementGuards(unittest.TestCase):
    def test_only_multtara_is_denied_without_reading_credentials(self):
        for command, allowed in [("deploy multtara v1.2.3", False),
                                 ("deploy\tmulttara\tv1.2.3", False),
                                 ("deploy blog " + "a" * 40, True),
                                 ("deploy bonifacio " + "b" * 40, True)]:
            result = subprocess.run(
                ["bash", "-c", 'source "$1"; printf allowed', "guard", str(ROOT / "portfolio-guard.sh")],
                env={"SSH_ORIGINAL_COMMAND": command}, capture_output=True, text=True,
                timeout=3,
            )
            self.assertEqual(result.returncode == 0, allowed)
            self.assertEqual(result.stdout, "allowed" if allowed else "")

    def test_pongdang_gate_never_requests_external_commands(self):
        result = subprocess.run(["/bin/bash", str(ROOT / "refuse-deploy.sh")],
                                env={"PATH": "/nonexistent"}, capture_output=True,
                                text=True, timeout=3)
        self.assertEqual(result.returncode, 1)
        self.assertIn("retired", result.stderr)


if __name__ == "__main__":
    unittest.main()
