Desktop Plus v3.6.4-alpha2

## **Changes and improvements:**

- The "Last clone" location (that is, the autopopulated parent directory when cloning a repository) is now remembered per-account instead of globally. This is useful if you have a work account and a personal account, and you would like to keep your work repositories in a different location than your personal repositories.

- [#222] The app now uses HTTPS instead of SSH for git operations (clone, push, pull...), in all third-party integrations. This means these accounts now work out of the box without you needing to set up SSH keys:
  - **GitHub** accounts: They already used HTTPS, no changes were made.
  - **GitLab** accounts: You will need to log out and log back in to your GitLab account. After logging back in, you will be able to clone, push, and pull your public and private repositories without needing to set up SSH keys.
  - **Bitbucket** accounts: All sessions were automatically invalidated, you may have noticed a forced re-login some hours ago. After logging back in, you will be able to clone, push, and pull your public and private repositories without needing to set up SSH keys.
  - **Codeberg** accounts: They already used HTTPS, but it should now work more reliably.

  > [!NOTE]
  > Please note that already cloned repositories will continue to use SSH for git operations. There is no advantage to switching them to HTTPS, but if you want to do so you can either:
  > - Delete the repository and re-clone it from within the app, or
  > - Change the remote URL to use the HTTPS URL

## Fixes:

- The Compare tab (Ahead/Behind list) is now correctly refreshed when switching branches, pulling remote changes, etc.

- When "Wrap lines" is disabled in the diff options, resizing the window or sidebar now correctly updates the horizontal scrollbar.

- Fixed a race condition that could show incorrect error information or cause the app to remove the incorrect branch if the user switched branches while the "Pull all" process was in progress.
