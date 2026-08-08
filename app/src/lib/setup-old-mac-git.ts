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

      // 5. Find system git-lfs and add its directory to PATH
      const systemGitLfs = findSystemBinary('git-lfs')
      if (systemGitLfs) {
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
