import axios from "axios";
import { env } from "../../config/env";
import { OAuthProfile } from "./provider.types";

// Builds the URL we redirect the browser to so the user can authorize our GitHub OAuth app.
// `state` is an opaque, single-use value the caller generates and later validates on
// `/auth/github/callback` to protect against CSRF.
export const getGithubAuthUrl = (state: string): string => {
    const clientId = env.GITHUB_CLIENT_ID;
    const redirectUrl = `${env.SERVER_URL}/auth/github/callback`;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUrl,
        scope: "user:email",
        state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

// Exchanges the one-time `code` GitHub redirected us with for a real access token.
export const exchangeGithubCode = async (code: string): Promise<string> => {
    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;

    const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
            code,
            client_id: clientId,
            client_secret: clientSecret,
        },
        {
            headers: {
                Accept: "application/json"
            }
        }
    );

    // GitHub replies with HTTP 200 even on a bad/expired code, the failure only
    // shows up as an `error` field in the body - so we have to check it explicitly.
    if (response.data.error || !response.data.access_token) {
        throw new Error(
            response.data.error_description || "Failed to exchange GitHub authorization code"
        );
    }

    return response.data.access_token;
};

const fetchGithubPrimaryEmail = async (token: string): Promise<string> => {
    const response = await axios.get(
        "https://api.github.com/user/emails", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json"
            }
        }
    );

    const emails: { email: string; primary: boolean; verified: boolean }[] = response.data;

    // Prefer the verified primary email, but fall back gracefully instead of crashing
    // if GitHub doesn't return one (e.g. no primary flagged, or none verified).
    const primaryEmail =
        emails.find((email) => email.primary && email.verified) ??
        emails.find((email) => email.primary) ??
        emails[0];

    if (!primaryEmail?.email) {
        throw new Error("GitHub account has no accessible email address");
    }

    return primaryEmail.email;
};

// Fetches the authenticated GitHub user's profile, filling in the email via the
// dedicated emails endpoint when the primary profile doesn't expose one directly.
export const fetchGithubProfile = async (token: string): Promise<OAuthProfile> => {
    const response = await axios.get(
        "https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json"
            }
        }
    );

    const providerId = response.data.id.toString();
    const name: string = response.data.name ?? response.data.login;
    let email: string | null = response.data.email;

    if (!email) {
        email = await fetchGithubPrimaryEmail(token);
    }

    return { providerId, name, email };
};
