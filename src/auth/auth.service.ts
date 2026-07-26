import axios from "axios";
import { env } from "../config/env"
import prisma from "../prisma/prisma";

export const exchangeCodeForToken = async (code: string): Promise<string> => {
        const clientId = env.GITHUB_CLIENT_ID;
        const clientSecret = env.GITHUB_CLIENT_SECRET;

        const token = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                code,
                client_id: clientId,
                client_secret: clientSecret,
            },
            {
                headers: {
                    Accept: 'application/json'
                }
            }
        );

        const accessToken = token.data.access_token;
        return accessToken;
}

export const getGithubAuthUrl = (): string => {
    const clientId = env.GITHUB_CLIENT_ID;
    const redirectUrl = `${env.SERVER_URL}/auth/github/callback`

    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUrl}&scope=user:email`;
    return url;
}

export const getUserData = async (token: string) => {
    const response = await axios.get(
        "https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json"
            }
        }
    );

    const userData = {
        ...response.data,
        id: response.data.id.toString()
    }

    if(!userData.email || userData.email === ""){
        userData.email = await getUserEmail(token);
    }

    let user = await findUserById(userData.id.toString());

    if(!user){
        user = await createNewUser(userData.name, userData.id, userData.email);
    }

    return user;
}

const getUserEmail = async (token: string): Promise<string> => {
    const response = await axios.get(
        "https://api.github.com/user/emails", {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json"
            }
        }
    );
    const primaryEmail = response.data.find(
        (email: any) => email.primary
    )

    return primaryEmail.email;
}

const findUserById = async (id: string) => {
    console.log(id, typeof id);
    const user = await prisma.user.findUnique({
        where: {
            githubId: id
        }
    });

    if(!user)
        return null;

    return user;
}

const createNewUser = async (name: string, githubId: string, email: string) => {
    const write = await prisma.user.create({
        data: {
            name: name,
            githubId: githubId,
            email: email
        }
    });

    return write;
}