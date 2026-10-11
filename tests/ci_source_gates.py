"""Execute actual workflow guards against clean, forbidden and missing source."""
import pathlib
import subprocess
import tempfile
import textwrap

root = pathlib.Path(__file__).resolve().parents[1]
for workflow, needle, bad in (
    ("ci.yml", "Teltonika RUT241", "const example = 'Teltonika RUT241';"),
    ("quality-security.yml", "fonts.googleapis", "const url = 'https://fonts.googleapis.com/css';"),
):
    lines = (root / ".github/workflows" / workflow).read_text().splitlines()
    at = next(i for i, line in enumerate(lines) if "if grep -R" in line and needle in line)
    end = next(i for i in range(at, len(lines)) if lines[i].strip() == "fi")
    script = "set -euo pipefail\n" + textwrap.dedent("\n".join(lines[at - 1:end + 1]))
    with tempfile.TemporaryDirectory() as directory:
        source = pathlib.Path(directory) / "frontend/src"
        source.mkdir(parents=True)
        fixture = source / "fixture.ts"
        fixture.write_text("const value = 1;")
        def run():
            return subprocess.run(["bash", "-c", script], cwd=directory, capture_output=True).returncode
        assert run() == 0, workflow
        fixture.write_text(bad)
        assert run() != 0, workflow
        fixture.unlink()
        source.rmdir()
        assert run() != 0, "missing source must not silently pass"
print("CI source guard regressions: OK")
