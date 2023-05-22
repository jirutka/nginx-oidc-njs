// Equals to the nginx's `$request_id` length.
export const CSRF_TOKEN_LENGTH = 32

export const VAR_SITE_ROOT_URI = 'pages_site_root_uri'

export const enum Cookie {
  AccessToken = 'oauth_access_token',
  RefreshToken = 'oauth_refresh_token',
  State = 'oauth_state',
  Username = 'oauth_username',
}
