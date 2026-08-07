# Optional LLM and image providers

VoxFlow's deterministic editing engine, CLI, and MCP server do not require an
LLM API key. An external agent can use the MCP tools while VoxFlow remains
responsible for validation, revisions, rendering, and artifacts.

The legacy Web chat and cover-generation panels are optional adapters. Enable
them only when you intentionally want VoxFlow to call a hosted provider.

## Configuration

Copy `.env.example` to `.env` and set only the providers you use:

```dotenv
LLM_API_KEY=replace-with-your-provider-key
LLM_BASE_URL=https://your-gemini-proxy.example/v1
LLM_MODEL=gemini-2.5-flash

IMAGE_API_KEY=replace-with-your-image-provider-key
```

`LLM_BASE_URL` must point to a Gemini-compatible proxy that supports the
request shape used by `utils/llm.py`. Cover generation currently expects an
OpenAI-compatible chat-completions endpoint that can return image metadata.
These legacy Web adapters are not part of the stable CLI/MCP protocol.

## Security and privacy

- Never commit `.env` or paste credentials into an issue, transcript, edit
  plan, diagnostics bundle, or browser screenshot.
- Use a provider key scoped to the minimum required models and permissions.
- Keep the default Web listener on `127.0.0.1`. VoxFlow does not provide a
  multi-user authentication or authorization boundary.
- Prompts and selected transcript text sent to a hosted provider leave the
  local machine. CLI/MCP editing, FFmpeg rendering, and local FunASR do not
  require these hosted adapters.
- Review provider retention and acceptable-use terms before sending media or
  transcript content.

## Provider-neutral agent workflow

For the recommended workflow, configure Codex, Claude, or another agent to run
`voxflow mcp serve`. The agent reads bounded transcript pages, constructs an
Edit Plan, calls preview, and applies only after the diff is acceptable. This
path does not use the legacy Web chat provider and supports any model capable
of calling MCP tools.
