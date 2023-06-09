// Equals to the nginx's `$request_id` length.
export const CSRF_TOKEN_LENGTH = 32

export const VAR_SITE_ROOT_URI = 'pages_site_root_uri'

export const enum Cookie {
  State = 'oidc_state',
  Username = 'oidc_username',
  SessionId = 'oidc_session_id',
}

export const enum Session {
  AccessToken = 'oidc_access_token',
  IdToken = 'oidc_id_token',
  RefreshToken = 'oidc_refresh_token',
}
