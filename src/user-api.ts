import type { Context } from '.'
import { reject } from './error'
import { parseJsonBody } from './utils'


export interface UserInfo {
  username: string,
  fullName: string,
  roles: string[],
}

export async function fetchUser (ctx: Context, username: string, accessToken: string): Promise<UserInfo> {
  const { conf, subrequest } = ctx

  const { status, responseText } = await subrequest('GET', `${conf.internalLocationsPrefix}/user`, {
    username,
    access_token: accessToken,
  })
  switch (status) {
    case 404: {
      return reject(403, 'Unknown User', `USERapi doesn't know user with username '${username}'.`)
    }
    // @ts-ignore falls through
    case 200: {
      const data = parseJsonBody(responseText)
      if ('roles' in data) {
        return data as UserInfo
      }
    }
    default: {
      return reject(502, 'USERapi Error',
        `Unable to fetch user roles from USERapi service, got response status: ${status}.`)
    }
  }
}
