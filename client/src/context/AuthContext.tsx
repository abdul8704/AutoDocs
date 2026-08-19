import React, { createContext, useContext, useEffect, useState } from 'react';
import { logoutUser, requestRefreshToken, setAccessToken } from '../services/api';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGithub: () => void;
  logout: () => Promise<void>;
  refreshAuthToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  loginWithGithub: () => {},
  logout: async () => {},
  refreshAuthToken: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshAuthToken = async (): Promise<string | null> => {
    const token = await requestRefreshToken();
    setToken(token);
    return token;
  };

  useEffect(() => {
    // Initial check on mount
    refreshAuthToken().finally(() => {
      setIsLoading(false);
    });
  }, []);

  const loginWithGithub = () => {
    window.location.href = '/auth/github';
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setAccessToken(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: Boolean(accessToken),
        isLoading,
        loginWithGithub,
        logout,
        refreshAuthToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
