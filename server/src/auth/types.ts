import { Profile } from '../supabase/types';

// The session payload we return to the client after a successful exchange or
// refresh. Shape matches what `supabase.auth.setSession()` expects on the
// client — access_token + refresh_token — plus the profile snapshot.
//
// `refresh_token` is opaque during the JWT-bridge era: the real refresh proof
// is a fresh Firebase ID token on /auth/refresh (Option A in the plan). The
// opaque value exists only so supabase-js has something to store; Supabase
// will reject it on its native /token refresh attempt, which fires
// TOKEN_REFRESH_FAILED on the client, which is where our handler intercepts
// and calls /auth/refresh.
export interface BridgeSession {
  access_token: string;
  refresh_token: string;
  profile: Profile;
}
