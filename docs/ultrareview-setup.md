# Claude Code Ultrareview Setup

Use this when Claude Code `/ultrareview` needs to review the whole codebase, not just a feature diff.

`/ultrareview` compares the current branch against a base branch. To make the full project appear in the diff, create:

- `ultrareview-empty-base` — intentionally empty orphan branch.
- `ultrareview-full-codebase` — full project snapshot copied from `main`.

The resulting PR is a review artifact only. Do not merge it.

## Before Starting

Commit or stash all real work on `main`.

```bash
cd ~/Documents/KushHR
git switch main
git status
```

If there are changes that should be kept:

```bash
git add .
git commit -m "Save current project state"
git push
```

## Create The Empty Base Branch

```bash
git switch --orphan ultrareview-empty-base
git rm -r --cached .
git clean -fd
git commit --allow-empty -m "Empty base for full codebase review"
git push -u origin ultrareview-empty-base
```

Expected result: VS Code Explorer may look empty while this branch is checked out. That is normal.

## Create The Full Codebase Snapshot Branch

```bash
git switch -c ultrareview-full-codebase
git checkout main -- .
git add .
git commit -m "Add full codebase for review"
git push -u origin ultrareview-full-codebase
```

Expected result: all project files reappear because this branch contains the full project snapshot.

## Open The GitHub PR

On GitHub, create a pull request with:

```text
base: ultrareview-empty-base
compare: ultrareview-full-codebase
```

Suggested title:

```text
Full codebase review snapshot
```

Suggested description:

```text
Temporary PR for full codebase review only. Do not merge.
```

Confirm the PR shows the whole project as changed files.

## Run Ultrareview

In Claude Code CLI:

```bash
cd ~/Documents/KushHR
git switch ultrareview-full-codebase
/ultrareview ultrareview-empty-base
```

If Claude Code cannot find the base branch:

```bash
git fetch origin ultrareview-empty-base
git fetch origin ultrareview-full-codebase
git switch ultrareview-full-codebase
/ultrareview origin/ultrareview-empty-base
```

## After Ultrareview Finishes

Save findings on `main`, for example:

```bash
git switch main
git add docs/ultrareview-findings.md
git commit -m "Record Claude Code ultrareview findings"
git push
```

Close the GitHub PR. Do not merge it.

When the findings are safely recorded and the PR is closed, delete the temporary branches:

```bash
git branch -D ultrareview-empty-base
git branch -D ultrareview-full-codebase
git push origin --delete ultrareview-empty-base
git push origin --delete ultrareview-full-codebase
```

For the next full-codebase review, recreate fresh branches from the latest `main`.
