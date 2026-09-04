Desktop Plus v3.6.5

Upstream: [GitHub Desktop 3.6.5 release notes](https://github.com/desktop/desktop/releases/tag/release-3.6.5)

## Changes and improvements:

- [#240] Sections in the repository list are now collapsible, just click the section header to collapse or expand it.

- [#241] *Automatic groups* in the repository list now also include a **"Pull all"** button.  
  It behaves the same as in *custom groups*: clicking it will pull all repositories in the group.

- Added an "Edit group" option to the groups context menu in the repository list.  
  To quickly rename a group or modify which repositories are included in it, right-click the group name and select "Edit group".

- [#242] Added a `--new-window` flag to the `desktop-plus-cli` command line interface. Thanks @pierre-dekode!  
  This flag can be used with any of the existing commands, and it will always create a new window instead of reusing an existing one. See [the CLI documentation](https://github.com/desktop-plus/desktop-plus/blob/main/docs/cli.md) for more information.

- [#245] In the *Stashed changes* view, you can now choose to "**Apply**" the changes (`git stash apply`) instead of the old "**Restore**" behavior which also removes the stash (`git stash pop`).  
  Click on the dropdown arrow next to the "Restore" button to select your preferred behavior.

- [#248] You can now resize the sidebar while the repository list is open.

- [#233] The app now supports git remotes that use SSH aliases instead of full hostnames, by resolving the alias using the local SSH configuration.  
  This is a best-effort implementation which may not work in all cases, I recommend using HTTPS if you have a complex setup.

## Fixes:

- [#207] **Linux:** Updated to a newer Electron version to fix a bug that caused the app to have 2 separate entries in the KDE system monitor.
