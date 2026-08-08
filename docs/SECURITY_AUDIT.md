# Public repository security audit

Audit date: 2026-08-08

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

## History rewrite record

On 2026-08-08 the public branch history was rebuilt from reviewed snapshots.
The rewrite:

- condensed the exploratory prototype history into thematic commits;
- removed generated recognition results, organization-specific provider
  documentation, local Agent work logs, `.DS_Store`, and committed `.env`
  paths from every published snapshot;
- replaced personal and organization email addresses in author and committer
  metadata with the repository owner's GitHub noreply identity;
- removed obsolete feature and dependency-update branches that retained the
  pre-rewrite object graph; and
- preserved a restricted local mirror backup for recovery and verification.

No live provider credential was identified in the reviewed history. Historical
provider-shaped values were low-entropy examples and did not match the current
ignored local credential fingerprint.

Rewritten commits can invalidate existing clones and pull requests. Contributors
with a pre-rewrite clone should re-clone or reset explicitly to the new default
branch. GitHub may retain inaccessible cached objects for a period after refs are
removed; contact GitHub Support if an old object remains retrievable by its exact
SHA after repository garbage collection.
