Desktop Plus v3.6.4-alpha3

This is a small release before merging in a large refactor to support self-hosted Git providers.

## **Changes and improvements:**

- [#227] Moved the copilot configuration to the application's data directory, instead of creating it in the user's home directory.

- Greatly reduced the application's install size by removing a large Copilot bundled binary that was never called. This shouldn't affect any functionality, but if you notice any issues, please report them.

## Fixes:

- [#224] Fixed a bug that caused the `upstream` remote in a newly cloned fork to not be fetched properly until the repository was refreshed.

- Fixed a warning message "no version information available" that was showing up in some HTTPS operations.
