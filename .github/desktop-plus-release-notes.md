Desktop Plus v3.6.4

Upstream: [GitHub Desktop 3.6.4 release notes](https://github.com/desktop/desktop/releases/tag/release-3.6.4)

## Fixes:

- Fixed parsing of SSH remotes for repositories that belong to GitLab subgroups. For example: `git@gitlab.com:my-org/subgroup/my-repo.git`.  
  Please note that SSH remote parsing remains a best-effort implementation and may not work on [some edge cases](https://github.com/desktop-plus/desktop-plus/issues/233). I recommend cloning repositories inside the app, which will use HTTPS instead of SSH.

- Fixed an inconsistent User-Agent sent by the app when making API requests.

- Replaced some fork-specific patches with proper upstream fixes. You should not notice any difference in behavior, but if you find any regressions please [open an issue](https://github.com/desktop-plus/desktop-plus/issues/new/choose). Functionality that could be affected by these changes includes:
  - Running Git Hooks that read from `stdin`.
  - Returning to the main worktree after the currently selected worktree has been deleted outside of the app.
  - Linux: Git operations using HTTPS now use `libcurl` instead of `libcurl-gnutls`.
