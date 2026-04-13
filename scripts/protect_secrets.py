#!/usr/bin/env python3
"""Utilities to prevent leaking sensitive information into git.

This script does three things:

1. Keeps a managed block inside .gitignore with common sensitive globs.
2. Adds entries for newly discovered sensitive files (e.g. *.env) so they
   stay untracked.
3. Scans tracked files for high-risk patterns before a push and aborts when
   something suspicious is found.

The script is intentionally dependency-free so it can run inside git hooks.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path
from typing import Iterable, Sequence

REPO_ROOT = Path(__file__).resolve().parent.parent
GITIGNORE_PATH = REPO_ROOT / ".gitignore"

SENSITIVE_GLOBS: Sequence[str] = (
    ".env",
    ".env.*",
    "!.env.example",
    "!.env.*.example",
    "deploy.env",
    "scripts/deploy.env",
    "*.pem",
    "*.key",
    "*.p8",
    "*.p12",
    "*.pfx",
    "*.cer",
    "*.crt",
    "*.csr",
    "*.der",
    "*.gpg",
    "*.pgp",
    "*.ppk",
    "*.ovpn",
    "*.kdb",
    "*.jks",
    "*.token",
    "*.secrets",
    "*.secret",
    "*.credentials",
    "assets/",
    "backups/",
    "secrets/",
    "private/",
    "cms/.next/",
    "cms/.turbo/",
    "cms/.vercel/",
    "cms/.payload/",
    "cms/.cache/",
    "cms/out/",
    "cms/media/",
    "cms/public/media/",
    "cms/storage/",
    "*.tsbuildinfo",
)

AUTO_GLOB_HEADER = "# >>> Managed sensitive globs (auto-generated)"
AUTO_GLOB_FOOTER = "# <<< Managed sensitive globs (auto-generated)"

AUTO_PATH_HEADER = "# >>> Auto-added sensitive paths (generated)"
AUTO_PATH_FOOTER = "# <<< Auto-added sensitive paths (generated)"

SENSITIVE_NAME_PATTERNS: Sequence[str] = (
    "*.env",
    "*.env.*",
    "*.pem",
    "*.key",
    "*.p8",
    "*.p12",
    "*.pfx",
    "*.cer",
    "*.crt",
    "*.csr",
    "*.der",
    "*.gpg",
    "*.pgp",
    "*.ppk",
    "*.ovpn",
    "*.kdb",
    "*.jks",
    "*.token",
    "*.secret",
    "*.secrets",
    "*.credentials",
    "*.tfvars",
    "*.keystore",
    "*.dump",
    "*.pgdump",
    "*.pgcustom",
    "*id_ed25519*",
    "*id_rsa*",
)


ALLOWLIST_FRAGMENT = {
    "example",
    "sample",
    "changeme",
    "placeholder",
    "dummy",
    "test",
    "process.env",
    "parsed.password",
    "sessiontoken",
    "session_token",
    "os.environ",
    "formdata.get",
    "form.",
    "loginform.secret",
    "--color-surface-",
}

SCAN_ALLOWLIST = {
    Path("config/envSchema.ts"),
    Path("cms/config/envSchema.ts"),
    Path("cms/app/api/auth/login/route.ts"),
    Path("cms/app/api/auth/register/[token]/route.ts"),
    Path("cms/app/api/auth/session/route.ts"),
    Path("cms/app/api/profiles/me/password/route.ts"),
    Path("cms/src/scripts/addCrewMember.ts"),
    Path("cms/src/scripts/addRoger.ts"),
    Path("cms/src/scripts/crewProfiles.ts"),
    Path("cms/src/scripts/normalizeLogs.ts"),
    Path("cms/src/scripts/seedCrewMembers.ts"),
    Path("cms/src/scripts/seedUsers.ts"),
    Path("cms/test/api/auth/passwordResetFlow.test.ts"),
    Path("shared/dist/env.js"),
    Path("shared/env.js"),
    Path("shared/env.ts"),
    Path("frontend/nuxt.config.ts"),
    Path("frontend/server/utils/client-events.ts"),
    Path("frontend/test/e2e/auth.spec.ts"),
    Path("frontend/test/e2e/support/api.ts"),
    Path("frontend/test/e2e/support/fixtures.ts"),
}


@dataclass
class SecretHit:
    path: Path
    description: str
    value_preview: str | None = None


SECRET_PATTERNS: Sequence[tuple[re.Pattern[str], str, int | None]] = (
    (re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"), "Private key block", None),
    (re.compile(r"ghp_[A-Za-z0-9]{36}"), "GitHub personal access token", None),
    (re.compile(r"github_pat_[A-Za-z0-9_]{82,}"), "GitHub fine-grained PAT", None),
    (re.compile(r"sk_(?:live|test)_[0-9a-zA-Z]{32}"), "Stripe secret key", None),
    (re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}"), "Slack token", None),
    (re.compile(r"AIza[0-9A-Za-z_-]{35}"), "Google API key", None),
    (
        re.compile(r"(?i)aws_access_key_id\s*[:=]\s*([A-Z0-9]{20})"),
        "AWS access key ID",
        1,
    ),
    (
        re.compile(r"(?i)aws_secret_access_key\s*[:=]\s*([A-Za-z0-9/+=]{40})"),
        "AWS secret access key",
        1,
    ),
    (
        re.compile(r"(?i)\b(password|passwd|pwd)\b[^\n\r:=]{0,5}[:=]\s*([\"'`]?)([^\s\"'`]{12,})(\2)"),
        "Password assignment",
        3,
    ),
    (
        re.compile(
            r"(?i)\b(api[_-]?key|secret|token)\b[^\n\r:=]{0,5}[:=]\s*([\"'`]?)([^\s\"'`]{16,})(\2)"
        ),
        "Secret-like assignment",
        3,
    ),
)

CODE_EXTENSIONS_REQUIRE_QUOTES = {
    ".cjs",
    ".cs",
    ".dart",
    ".go",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scala",
    ".swift",
    ".ts",
    ".tsx",
}


def should_skip_unquoted_assignment(path: Path, description: str, match: re.Match[str]) -> bool:
    if description not in {"Password assignment", "Secret-like assignment"}:
        return False
    if path.suffix.lower() not in CODE_EXTENSIONS_REQUIRE_QUOTES:
        return False
    return match.group(2) == ""


def capture_git_output(cmd: Sequence[str]) -> list[str]:
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def ensure_gitignore_block(patterns: Sequence[str]) -> bool:
    if not GITIGNORE_PATH.exists():
        raise FileNotFoundError(".gitignore not found in repository root")

    content = GITIGNORE_PATH.read_text(encoding="utf-8").splitlines()

    try:
        start = content.index(AUTO_GLOB_HEADER)
        end = content.index(AUTO_GLOB_FOOTER)
        if end < start:
            raise ValueError
    except ValueError:
        if content and content[-1].strip():
            content.append("")
        content.extend(
            [
                AUTO_GLOB_HEADER,
                "# Managed by scripts/protect_secrets.py",
                AUTO_GLOB_FOOTER,
            ]
        )
        start = len(content) - 3
        end = len(content) - 1

    managed_block = ["# Managed by scripts/protect_secrets.py"]
    managed_block.extend(patterns)

    if content[start + 1 : end] == managed_block:
        return False

    updated = content[: start + 1] + managed_block + content[end:]
    GITIGNORE_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    return True


def ensure_sensitive_paths(paths: Iterable[Path]) -> bool:
    content = GITIGNORE_PATH.read_text(encoding="utf-8").splitlines()
    try:
        start = content.index(AUTO_PATH_HEADER)
        end = content.index(AUTO_PATH_FOOTER)
        if end < start:
            raise ValueError
    except ValueError:
        if content and content[-1].strip():
            content.append("")
        content.extend(
            [
                AUTO_PATH_HEADER,
                "# Paths detected as sensitive. Edit with care.",
                AUTO_PATH_FOOTER,
            ]
        )
        start = len(content) - 3
        end = len(content) - 1

    existing = set(
        line.strip()
        for line in content[start + 1 : end]
        if line.strip() and not line.lstrip().startswith("#")
    )

    new_entries = []
    for path in paths:
        relative = path.relative_to(REPO_ROOT).as_posix()
        if relative not in existing:
            new_entries.append(relative)
            existing.add(relative)

    if not new_entries:
        return False

    updated_block = ["# Paths detected as sensitive. Edit with care."]
    updated_block.extend(sorted(existing))
    updated = content[: start + 1] + updated_block + content[end:]
    GITIGNORE_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    return True


def iter_untracked_paths() -> Iterable[Path]:
    status_lines = capture_git_output(["git", "status", "--porcelain"])
    for line in status_lines:
        if line.startswith("?? "):
            raw = line[3:]
            yield (REPO_ROOT / raw).resolve()


def classify_sensitive_untracked(paths: Iterable[Path]) -> set[Path]:
    sensitive = set()
    for path in paths:
        if not path.exists():
            continue
        name = path.name
        if name.endswith((".example", ".sample", ".template")):
            continue
        if any(fnmatch(name, pattern) for pattern in SENSITIVE_NAME_PATTERNS):
            sensitive.add(path)
            continue
        if path.is_dir():
            if any(keyword in name.lower() for keyword in ("secret", "private", "secure")):
                sensitive.add(path)
    return sensitive


def is_binary(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            chunk = handle.read(2048)
    except (OSError, UnicodeError):
        return True
    return b"\0" in chunk


def iter_tracked_files() -> Iterable[Path]:
    for line in capture_git_output(["git", "ls-files"]):
        yield (REPO_ROOT / line).resolve()


def scan_file_for_secrets(path: Path) -> list[SecretHit]:
    if is_binary(path):
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []

    hits: list[SecretHit] = []
    for pattern, description, value_group in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            if should_skip_unquoted_assignment(path, description, match):
                continue
            value_preview = None
            if value_group is not None:
                value_preview = match.group(value_group)
                if is_allowlisted_value(value_preview):
                    continue
                value_preview = anonymise(value_preview)
            hits.append(SecretHit(path=path, description=description, value_preview=value_preview))
            break
    return hits


def is_allowlisted_value(value: str) -> bool:
    lowercase = value.lower()
    return any(fragment in lowercase for fragment in ALLOWLIST_FRAGMENT)


def anonymise(value: str) -> str:
    if len(value) <= 8:
        return value
    return value[:4] + "…" + value[-4:]


def scan_repository() -> list[SecretHit]:
    hits: list[SecretHit] = []
    for path in iter_tracked_files():
        rel = path.relative_to(REPO_ROOT)
        if rel in SCAN_ALLOWLIST:
            continue
        hits.extend(scan_file_for_secrets(path))
    return hits


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage gitignore and scan for secrets.")
    parser.add_argument(
        "--skip-gitignore",
        action="store_true",
        help="Do not modify .gitignore blocks.",
    )
    parser.add_argument(
        "--skip-scan",
        action="store_true",
        help="Skip secret scanning.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    gitignore_changed = False
    if not args.skip_gitignore:
        gitignore_changed = ensure_gitignore_block(SENSITIVE_GLOBS)

        sensitive_untracked = classify_sensitive_untracked(iter_untracked_paths())
        if sensitive_untracked:
            updated = ensure_sensitive_paths(sensitive_untracked)
            gitignore_changed = gitignore_changed or updated

    if gitignore_changed:
        print("[protect-secrets] Updated .gitignore with sensitive entries.")

    if args.skip_scan:
        return 0

    hits = scan_repository()
    if hits:
        print("[protect-secrets] Potential secrets detected:")
        for hit in hits:
            rel = hit.path.relative_to(REPO_ROOT)
            if hit.value_preview:
                print(f"  - {rel}: {hit.description} (value starts with {hit.value_preview})")
            else:
                print(f"  - {rel}: {hit.description}")
        print("\nRemove or rotate these secrets before pushing.")
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
