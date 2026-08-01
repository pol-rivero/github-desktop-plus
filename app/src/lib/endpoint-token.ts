import type { AccountAPIType } from '../models/account'

export type EndpointToken = {
  endpoint: string
  token: string
  apiType: AccountAPIType
}
