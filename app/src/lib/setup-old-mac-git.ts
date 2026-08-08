/* eslint-disable no-sync */

import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as cp from 'child_process'

// Only run on macOS older than 10.15 (Darwin major version < 19)
if (
  process.platform === 'darwin' &&
  parseInt(os.release().split('.')[0], 10) < 19
) {
  try {
    const homeDir = os.homedir()
    const shimGitDir = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Desktop Plus',
      'shim-git'
    )

    // 1. Create directories
    if (!fs.existsSync(shimGitDir)) {
      fs.mkdirSync(shimGitDir, { recursive: true })
    }
    const binDir = path.join(shimGitDir, 'bin')
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true })
    }
    const libexecDir = path.join(shimGitDir, 'libexec', 'git-core')
    if (!fs.existsSync(libexecDir)) {
      fs.mkdirSync(libexecDir, { recursive: true })
    }

    // 2. Helper to find system binary
    const findSystemBinary = (name: string): string | null => {
      const standardPaths = [
        '/usr/bin',
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/libexec/git-core',
      ]
      const paths = [...standardPaths, ...(process.env.PATH || '').split(':')]
      for (const p of paths) {
        const fullPath = path.join(p, name)
        if (fs.existsSync(fullPath)) {
          return fullPath
        }
      }
      return null
    }

    const systemGit = findSystemBinary('git')
    if (systemGit) {
      // 3. Create bin/git symlink
      const gitSymlinkPath = path.join(binDir, 'git')
      if (fs.existsSync(gitSymlinkPath)) {
        try {
          fs.unlinkSync(gitSymlinkPath)
        } catch {}
      }
      fs.symlinkSync(systemGit, gitSymlinkPath)

      // 4. Resolve GIT_EXEC_PATH from system git
      try {
        const systemExecPath = cp
          .execSync(`"${systemGit}" --exec-path`, { encoding: 'utf-8' })
          .trim()
        if (systemExecPath && fs.existsSync(systemExecPath)) {
          process.env['GIT_EXEC_PATH'] = systemExecPath
        }
      } catch (e) {
        console.error('Failed to resolve system git --exec-path:', e)
      }

      // 5. Find system git-lfs or download a compatible version dynamically if missing
      let systemGitLfs = findSystemBinary('git-lfs')
      if (!systemGitLfs) {
        const localLfsPath = path.join(binDir, 'git-lfs')
        if (fs.existsSync(localLfsPath)) {
          systemGitLfs = localLfsPath
        } else {
          try {
            console.log(
              'Downloading compatible git-lfs for macOS High Sierra...'
            )
            const zipPath = '/tmp/git-lfs.zip'
            const extractDir = '/tmp/git-lfs-extract'

            // Delete old temporary files if they exist
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath)
            }
            if (fs.existsSync(extractDir)) {
              fs.rmSync(extractDir, { recursive: true, force: true })
            }

            // Download using curl
            const downloadUrl =
              'https://github.com/git-lfs/git-lfs/releases/download/v3.2.0/git-lfs-darwin-amd64-v3.2.0.zip'
            cp.execSync(`/usr/bin/curl -L -s -o "${zipPath}" "${downloadUrl}"`)

            // Unzip
            fs.mkdirSync(extractDir, { recursive: true })
            cp.execSync(`/usr/bin/unzip -q -o "${zipPath}" -d "${extractDir}"`)

            // Find git-lfs recursively inside extractDir
            const findFile = (dir: string, name: string): string | null => {
              const files = fs.readdirSync(dir)
              for (const f of files) {
                const fp = path.join(dir, f)
                if (fs.statSync(fp).isDirectory()) {
                  const found = findFile(fp, name)
                  if (found) {
                    return found
                  }
                } else if (f === name) {
                  return fp
                }
              }
              return null
            }

            const downloadedLfs = findFile(extractDir, 'git-lfs')
            if (downloadedLfs) {
              fs.copyFileSync(downloadedLfs, localLfsPath)
              fs.chmodSync(localLfsPath, 0o755)
              systemGitLfs = localLfsPath
            }

            // Cleanup
            try {
              fs.unlinkSync(zipPath)
              fs.rmSync(extractDir, { recursive: true, force: true })
            } catch {}
          } catch (err) {
            console.error('Failed to download compatible git-lfs:', err)
          }
        }
      }

      if (systemGitLfs) {
        // Create symlink in libexec/git-core for git-lfs
        const lfsSymlinkPath = path.join(libexecDir, 'git-lfs')
        if (fs.existsSync(lfsSymlinkPath)) {
          try {
            fs.unlinkSync(lfsSymlinkPath)
          } catch {}
        }
        fs.symlinkSync(systemGitLfs, lfsSymlinkPath)

        // Create symlink in bin/git-lfs if needed
        const binLfsPath = path.join(binDir, 'git-lfs')
        if (systemGitLfs !== binLfsPath) {
          if (fs.existsSync(binLfsPath)) {
            try {
              fs.unlinkSync(binLfsPath)
            } catch {}
          }
          fs.symlinkSync(systemGitLfs, binLfsPath)
        }

        // Add git-lfs dir to PATH
        const lfsDir = path.dirname(systemGitLfs)
        if (lfsDir) {
          process.env['PATH'] = `${lfsDir}:${process.env['PATH'] || ''}`
        }
      }

      // 6. Tell dugite where to find our shim git directory
      process.env['LOCAL_GIT_DIRECTORY'] = shimGitDir
    }
  } catch (e) {
    console.error('Failed to set up old macOS git shim:', e)
  }
}
