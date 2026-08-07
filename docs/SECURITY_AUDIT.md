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
- JavaScript production dependencies and all Python dependencies other than the
  two time-bounded PyTorch acceptances below have no known vulnerability in the
  lockfiles at the time of this audit.
- The local Web development server now defaults to loopback-only networking and
  an explicit loopback CORS allowlist.

The repeatable current-tree check is:

```bash
python scripts/check_public_repo.py
```

CI additionally runs Gitleaks, CodeQL, pip-audit, npm audit, and Dependabot.

## Time-bounded PyTorch risk acceptance

The optional `asr-local` extra currently pins the latest installable matched
pair, PyTorch/Torchaudio 2.10.0. Two upstream PyTorch advisories cannot be
resolved by an available matched release as of the audit date:

| Advisory | Trigger | Current disposition |
|---|---|---|
| `PYSEC-2025-194` / `GHSA-rrmf-rvhw-rf47` | local `torch.jit.script` memory corruption | VoxFlow and the installed FunASR code do not call this API; patched Torch 2.13 has no matching published Torchaudio package |
| `PYSEC-2026-139` | local PT2 loading-handler deserialization | upstream has not published a fixed version |

These IDs are explicitly ignored by the CI pip-audit command so every other
dependency remains blocking. They are not described as fixed or absent.

Risk controls:

- PyTorch is not installed by the base, CLI-lite, or MCP-lite distributions;
  it is confined to the optional local ASR provider.
- VoxFlow accepts media input, not model paths; the configured FunASR model IDs
  are fixed in source.
- Automatic FunASR update checks are disabled, and the unused/misleading
  `trust_remote_code` argument was removed.
- Operators must treat the ModelScope model source and local model cache as
  trusted executable/model supply-chain inputs. Do not replace cached model
  files with untrusted downloads.

Review deadline: 2026-09-07, or immediately when a compatible Torch/Torchaudio
pair containing the upstream fixes is published. At that point remove both
CI ignores and the corresponding Dependabot dismissals.

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
