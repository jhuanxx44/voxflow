---
name: commit-push
description: "Create a local git commit with an auto-generated commit message and push to the remote repository. Combines commit and push into a single workflow. Use when user says /commit-push or asks to commit and push changes."
user_invocable: true
---

# Commit & Push Skill

Create a local git commit with an appropriate commit message, then push to remote.

## Steps

1. Run the following commands in parallel to understand the current state:
   - `git status` to see all changed and untracked files (never use -uall flag)
   - `git diff` to see unstaged changes
   - `git diff --cached` to see staged changes
   - `git log --oneline -5` to see recent commit message style
   - `git branch -vv` to check current branch and its remote tracking

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

4. Push to remote:
   - If the branch has no upstream, use `git push -u origin <branch-name>`
   - If the branch already tracks a remote, use `git push`
   - NEVER force push (`--force` or `-f`) unless explicitly asked
   - NEVER force push to main/master - warn the user if they request it
   - Show the push result to the user

5. If a pre-commit hook fails, fix the issue and create a NEW commit (never amend)

## Important

- NEVER use `git add -A` or `git add .` - always add specific files
- NEVER amend existing commits unless explicitly asked
- NEVER skip hooks (--no-verify)
- NEVER force push to main/master
- If there are no changes to commit, inform the user and do nothing
