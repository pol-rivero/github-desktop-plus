import { getSHA } from './git-info'
import { getUpdatesURL, getChannel } from '../script/dist-info'
import { version, productName } from './package.json'

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'
const devClientIdBitbucket = 'Cu6ZDZgjKEAMEj45cg'
const devClientSecretBitbucket = 'DYGdmTAJKdk2YsX4Lch5M2ghtCMeCZry'
const devClientIdGitLab =
  'a6b3b9c8fb8a782d3a0284ac80378912e44272c4a41465b5b9f5a14a79d5526a'
const devClientSecretGitLab =
  'gloas-f3ace006b2563128e25b407fb4eef3583ca2220fc3392ca5311f3cc62076df9c'
const devClientIdCodeberg = 'eec16d05-93bd-43ec-8e29-a7e5dc677c78'
const devClientSecretCodeberg =
  'gto_ehmm7ppeie2ptokgtj4stzo3k5wijcueilpmlgacvglhcpry56bq'
const devClientIdGitea = '654533c4-cf62-494e-b391-b90edb22773f'
const devClientSecretGitea =
  'gto_52c3a7cm7pzj64uhzvyi2th2y2xylxpvrsyqorkuyoin5uhzlgnq'

const channel = getChannel()

const s = JSON.stringify

const optionalStringReplacement = (value: string | undefined) =>
  value === undefined || value.length === 0 ? 'undefined' : s(value)

export function getReplacements() {
  const isDevBuild = channel === 'development'

  return {
    __OAUTH_CLIENT_ID__: s(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
    __OAUTH_SECRET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret
    ),
    __OAUTH_CLIENT_ID_BITBUCKET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_ID_BITBUCKET || devClientIdBitbucket
    ),
    __OAUTH_SECRET_BITBUCKET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET_BITBUCKET ||
        devClientSecretBitbucket
    ),
    __OAUTH_CLIENT_ID_GITLAB__: s(
      process.env.DESKTOP_OAUTH_CLIENT_ID_GITLAB || devClientIdGitLab
    ),
    __OAUTH_SECRET_GITLAB__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET_GITLAB || devClientSecretGitLab
    ),
    __OAUTH_CLIENT_ID_CODEBERG__: s(
      process.env.DESKTOP_OAUTH_CLIENT_ID_CODEBERG || devClientIdCodeberg
    ),
    __OAUTH_SECRET_CODEBERG__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET_CODEBERG ||
        devClientSecretCodeberg
    ),
    __OAUTH_CLIENT_ID_GITEA__: s(
      process.env.DESKTOP_OAUTH_CLIENT_ID_GITEA || devClientIdGitea
    ),
    __OAUTH_SECRET_GITEA__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET_GITEA || devClientSecretGitea
    ),
    __DARWIN__: process.platform === 'darwin',
    __WIN32__: process.platform === 'win32',
    __LINUX__: process.platform === 'linux',
    __FLATPAK__:
      process.platform === 'linux' && process.env.FLATPAK_ID !== undefined,
    __APP_NAME__: s(productName),
    __APP_VERSION__: s(process.env.APP_VERSION ?? version),
    __DEV__: isDevBuild,
    __DEV_SECRETS__: isDevBuild || !process.env.DESKTOP_OAUTH_CLIENT_SECRET,
    __RELEASE_CHANNEL__: s(channel),
    __UPDATES_URL__: s(process.env.DESKTOP_E2E_UPDATES_URL ?? getUpdatesURL()),
    __ERROR_REPORTING_ENDPOINT__: optionalStringReplacement(
      process.env.DESKTOP_ERROR_REPORTING_ENDPOINT
    ),
    __NON_FATAL_ERROR_REPORTING_ENDPOINT__: optionalStringReplacement(
      process.env.DESKTOP_NON_FATAL_ERROR_REPORTING_ENDPOINT
    ),
    __SHA__: s(getSHA()),
    'process.platform': s(process.platform),
    'process.env.NODE_ENV': s(process.env.NODE_ENV || 'development'),
    'process.env.TEST_ENV': s(process.env.TEST_ENV),
  }
}
