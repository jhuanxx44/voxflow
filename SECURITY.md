# Security policy

## Supported versions

Security fixes are provided for the latest `1.x` release and the current
default branch. Older commits and local forks are not maintained separately.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include user media,
transcripts, credentials, local paths, or diagnostics bundles in a public
discussion.

Use GitHub's **Security → Report a vulnerability** flow for this repository:

<https://github.com/jhuanxx44/voxflow/security/advisories/new>

Include the affected version, impact, minimal reproduction, and suggested
mitigation. Use synthetic media and redact all credentials. Maintainers will
acknowledge a valid report as soon as practical, coordinate a fix and release,
then publish an advisory after users have an opportunity to upgrade.

## Deployment boundary

VoxFlow is local-first software. The Web application does not provide a
multi-user authentication, authorization, tenancy, rate-limiting, or hostile
upload sandbox boundary.

- The development server listens on `127.0.0.1` by default.
- Do not expose it directly to the public Internet.
- Setting `VOXFLOW_WEB_HOST=0.0.0.0` is an explicit operator opt-in. Put an
  authenticated reverse proxy and appropriate upload/FFmpeg isolation in front
  of it before allowing untrusted clients.
- Restrict browser origins with `VOXFLOW_CORS_ORIGINS`.
- Restrict import locations with `VOXFLOW_ALLOWED_INPUT_ROOTS`.
- Run FFmpeg and model workers with the least filesystem and network access
  required by your deployment.

## Credentials and private data

- Keep credentials in environment variables or an ignored `.env`; never commit
  them to source control.
- Rotate a credential immediately if it appears in a commit, CI log, issue,
  screenshot, transcript, diagnostics bundle, or artifact.
- Diagnostics intentionally exclude prompts, transcripts, media, job requests,
  raw logs, secrets, and absolute paths. Review any bundle before sharing it.
- Hosted LLM, image, or TTS adapters can transmit selected content off-device.
  Review provider retention and acceptable-use terms before enabling them.

## Automated checks

The repository runs a tracked-file hygiene check, dependency audits, secret
scanning, CodeQL analysis, and Dependabot updates. These checks reduce risk but
do not replace review of trust boundaries, provider behavior, model licenses,
or the FFmpeg build used by a deployment.
