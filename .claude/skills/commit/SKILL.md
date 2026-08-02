---
name: commit
description: "Create a local git commit with an auto-generated, well-structured commit message. Analyzes staged and unstaged changes, generates a concise commit message, stages relevant files, and commits locally. Use when user says /commit or asks to commit changes."
user_invocable: true
---

# Commit Skill

Create a local git commit with an appropriate commit message.

## Steps

1. Run the following commands in parallel to understand the current state:
   - `git status` to see all changed and untracked files (never use -uall flag)
   - `git diff` to see unstaged changes
   - `git diff --cached` to see staged changes
   - `git log --oneline -5` to see recent commit message style

2. Analyze all changes and draft a commit message:
   - Summarize the nature of the changes (feat, fix, refactor, docs, chore, etc.)
   - Use conventional commit format: `type: description`
   - Keep the first line under 72 characters
   - If changes are complex, add a blank line followed by bullet points explaining details
   - Write the message in the same language as recent commits (check git log)
   - Do NOT commit files that likely contain secrets (.env, credentials, API keys)

3. Stage relevant files and create the commit:
   - Stage changed files using specific file names (avoid `git add -A` or `git add .`)
   - If user provided arguments (e.g., `-m "custom message"`), use that message instead of auto-generating
   - Create the commit using a HEREDOC for the message:
     ```bash
     git commit -m "$(cat <<'EOF'
     type: commit message here

     Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
     EOF
     )"
     ```
   - Run `git status` after to verify success

4. If a pre-commit hook fails, fix the issue and create a NEW commit (never amend)

## Important

- NEVER push to remote - this skill only commits locally
- NEVER use `git add -A` or `git add .` - always add specific files
- NEVER amend existing commits unless explicitly asked
- NEVER skip hooks (--no-verify)
- If there are no changes to commit, inform the user and do nothing
