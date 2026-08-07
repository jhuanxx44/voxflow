# Public repository security audit

Audit date: 2026-08-07

## Current repository state

- GitHub Secret Scanning and push protection are enabled.
- Dependabot vulnerability alerts and automated security fixes are enabled.
- Private vulnerability reporting is enabled.
- Current GitHub secret-scanning alerts: 0.
- Current GitHub Dependabot alerts: 0.
- The tracked working tree contains no `.env`, private key file, runtime
  `result/` or `data/` file, known high-confidence credential pattern, or
  organization-private service hostname.
- Python base runtime dependencies and JavaScript production dependencies have
  no known vulnerability in the lockfiles at the time of this audit.
- The local Web development server now defaults to loopback-only networking and
  an explicit loopback CORS allowlist.

The repeatable current-tree check is:

```bash
python scripts/check_public_repo.py
```

CI additionally runs Gitleaks, CodeQL, pip-audit, npm audit, and Dependabot.

## History findings

`git log --all -- .env` returns no commits: `.env` was not committed in the
reachable repository history inspected during this audit.

The following files were removed from the current tree but remain reachable in
two older commits each:

- a generated recognition result under `result/`;
- the former organization-specific LLM provider guide;
- `.DS_Store` may also remain in older snapshots.

No credential value is reproduced in this report. The generated result should
be treated as private unless its origin and publication rights are positively
confirmed.

## Coordinated history rewrite runbook

A history rewrite changes commit IDs for every affected descendant and can
break open pull requests, forks, clones, signed commits, and release references.
It is intentionally not performed by an unattended feature commit.

If the repository owner decides the removed result must be purged from all
reachable Git history:

1. Pause merges and notify every collaborator to discard or rebase old clones.
2. Back up repository settings, branch protection, tags, releases, and a mirror
   clone in a restricted location.
3. Use a current `git-filter-repo` release to remove the exact reviewed paths
   from all branches and tags. Do not use a broad wildcard.
4. Verify the rewritten mirror with Gitleaks and `git log --all -- <path>`.
5. Force-push the coordinated rewritten refs, then contact GitHub Support if
   cached views or pull-request refs still expose sensitive data.
6. Recreate or validate branch protection and ask collaborators to re-clone.

If any real credential is ever found, rotate or revoke it before rewriting
history. History deletion is not a substitute for credential rotation.
