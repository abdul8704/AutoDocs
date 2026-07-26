// Shared shape every OAuth provider must return after a successful login,
// so `auth.service.ts` can stay provider-agnostic.
export interface OAuthProfile {
    providerId: string;
    name: string;
    email: string;
}
