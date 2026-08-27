# Command Line Interface

Desktop Plus includes a CLI that lets you open repositories and clone them directly from the terminal.

## Usage

```
desktop-plus-cli                           Open the current directory
desktop-plus-cli open [path]               Open the provided path
desktop-plus-cli clone [-b branch] <url>   Clone a repository by URL or name/owner (e.g. torvalds/linux)
```

### Options

- Add `-n`/`--new-window` to any of the commands above to always open the result in a new window instead of reusing an existing one.  
  ```bash
  desktop-plus-cli open --new-window [path]
  ```

## Creating a shorter alias

If you find `desktop-plus-cli` too long to type, you can create a shorter alias in your shell (e.g. `github-plus`, or even just `github` to match the upstream CLI name).

Examples below create an alias called `dp-cli` for the CLI. You can replace `dp-cli` with your preferred alias.

### Windows (PowerShell)

Add this line to your PowerShell profile (open it with `notepad $PROFILE`):

```powershell
Set-Alias dp-cli desktop-plus-cli
```

### macOS / Linux (Bash or Zsh)

Add this line to your `~/.bashrc` or `~/.zshrc`:

```bash
alias dp-cli='desktop-plus-cli'
```

### macOS / Linux (Fish)

Run once:

```fish
alias --save dp-cli desktop-plus-cli
```
