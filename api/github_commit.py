"""
github_commit.py -- Commit files to the GitHub repository via the GitHub Contents API.

Used by add_stock() to persist new ticker scaffolds after Railway generates them,
so data survives redeployment and is served by GitHub Pages.

Requires GITHUB_TOKEN env var set in Railway dashboard. If absent, all calls
are no-ops with a warning log -- the stock is still usable in the current session.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from pathlib import Path
from typing import Dict

import httpx

logger = logging.getLogger(__name__)

_REPO = "marcjduncan-sys/continuum-intelligence-v3"
_BRANCH = "main"
_API_BASE = f"https://api.github.com/repos/{_REPO}/contents"
_HEADERS_BASE = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


async def commit_files_to_github(
    files: Dict[str, Path],
    commit_message: str,
    token: str,
) -> bool:
    """
    Commit a batch of files to the GitHub repo.

    Args:
        files: mapping of GitHub path (e.g. "data/research/ASB.json")
               to the local Path on Railway's FS containing the content.
        commit_message: Git commit message.
        token: GitHub personal access token with repo write scope.

    Returns True if every file was committed successfully, False otherwise.
    Failures are always logged. The caller decides whether to treat failure
    as fatal (add_stock scaffold phase) or non-fatal (background refresh).
    """
    if not token:
        logger.warning("[GitHubCommit] GITHUB_TOKEN not set -- skipping commit to GitHub")
        return False

    headers = {**_HEADERS_BASE, "Authorization": f"Bearer {token}"}
    all_ok = True

    async with httpx.AsyncClient(timeout=30.0) as client:
        for github_path, local_path in files.items():
            ok = await _commit_single(client, headers, github_path, local_path, commit_message)
            if not ok:
                all_ok = False

    return all_ok


async def _commit_single(
    client: httpx.AsyncClient,
    headers: dict,
    github_path: str,
    local_path: Path,
    commit_message: str,
) -> bool:
    """Commit a single file. Returns True on success, False on any failure."""
    url = f"{_API_BASE}/{github_path}"
    try:
        content_b64 = base64.b64encode(local_path.read_bytes()).decode()
    except OSError as e:
        logger.error("[GitHubCommit] Cannot read %s: %s", local_path, e)
        return False

    # Fetch current SHA (required for updates; absent for new files)
    sha: str | None = None
    try:
        r = await client.get(url, headers=headers, params={"ref": _BRANCH})
        if r.status_code == 200:
            sha = r.json().get("sha")
        elif r.status_code not in (404, 200):
            logger.warning("[GitHubCommit] SHA fetch returned %s for %s", r.status_code, github_path)
    except httpx.HTTPError as e:
        logger.warning("[GitHubCommit] SHA fetch error for %s: %s", github_path, e)

    body: dict = {
        "message": commit_message,
        "content": content_b64,
        "branch": _BRANCH,
    }
    if sha:
        body["sha"] = sha

    try:
        r = await client.put(url, headers=headers, json=body)
        if r.status_code in (200, 201):
            logger.info("[GitHubCommit] Committed %s", github_path)
            return True
        else:
            logger.error(
                "[GitHubCommit] Failed to commit %s: HTTP %s -- %s",
                github_path,
                r.status_code,
                r.text[:300],
            )
            return False
    except httpx.HTTPError as e:
        logger.error("[GitHubCommit] Request error committing %s: %s", github_path, e)
        return False
