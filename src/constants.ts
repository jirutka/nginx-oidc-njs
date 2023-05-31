// Equals to the nginx's `$request_id` length.
export const CSRF_TOKEN_LENGTH = 32

export const VAR_SITE_ROOT_URI = 'pages_site_root_uri'

export const enum Cookie {
  AccessToken = 'oauth_access_token',
  State = 'oauth_state',
  Username = 'oauth_username',
  SessionId = 'oidc_session_id',
}

export const enum Session {
  IdToken = 'oidc_id_token',
  RefreshToken = 'oidc_refresh_token',
}
