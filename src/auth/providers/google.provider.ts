import { HttpError } from "../../utils/httpError.utils";
import { OAuthProfile } from "./provider.types";

// Scaffolding only - mirrors github.provider.ts's shape so wiring up real Google OAuth
// later is just filling these three functions in (env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// and GOOGLE_CALLBACK_URL are already validated in ../../config/env.ts and ready to use).

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getGoogleAuthUrl = (state: string): string => {
    throw new HttpError(501, "Google OAuth is not implemented yet");
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const exchangeGoogleCode = async (code: string): Promise<string> => {
    throw new HttpError(501, "Google OAuth is not implemented yet");
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const fetchGoogleProfile = async (token: string): Promise<OAuthProfile> => {
    throw new HttpError(501, "Google OAuth is not implemented yet");
};
