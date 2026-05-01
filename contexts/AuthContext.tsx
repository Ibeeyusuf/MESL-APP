import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, MobileRole } from '@/types';
import { api, type LoginPayload } from '@/services/api';
import { loadTokensFromStorage, clearAuthTokens, setAuthExpiredCallback, getAccessToken } from '@/services/http';
import { mapApiRoleToUiRole } from '@/utils/helpers';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = 'carereach_user';

function toUiUser(apiUser: any): User {
  return {
    id: apiUser.id,
    name: apiUser.fullName,
    email: apiUser.email,
    role: mapApiRoleToUiRole(apiUser.role),
    centre: {
      id: apiUser.centre?.id ?? apiUser.centreId,
      code: apiUser.centre?.code ?? 'N/A',
      name: apiUser.centre?.name ?? 'Unknown Centre',
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleAuthExpired = useCallback(() => {
    setUser(null);
    AsyncStorage.removeItem(USER_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setAuthExpiredCallback(handleAuthExpired);
    return () => setAuthExpiredCallback(null);
  }, [handleAuthExpired]);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        await loadTokensFromStorage();
        const token = getAccessToken();
        try {
          const stored = await AsyncStorage.getItem(USER_KEY);
          if (token && stored) {
            setUser(JSON.parse(stored) as User);
          }
        } catch (storageError) {
          console.error('Failed to restore user from storage:', storageError);
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        try {
          await clearAuthTokens();
          await AsyncStorage.removeItem(USER_KEY);
        } catch (clearError) {
          console.error('Failed to clear tokens on error:', clearError);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (payload: LoginPayload) => {
    // Validate required fields
    if (!payload.email || !payload.email.trim()) {
      throw new Error('Email is required');
    }
    if (!payload.password) {
      throw new Error('Password is required');
    }
    if (!payload.signInAs) {
      throw new Error('Role selection is required');
    }
    if (!payload.centreId) {
      throw new Error('Catchment area is required');
    }

    const response = await api.auth.login(payload);
    const uiUser = toUiUser(response.user);
    setUser(uiUser);
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(uiUser));
    } catch (error) {
      console.error('Failed to save user to storage:', error);
    }
  };

  const logout = async () => {
    setUser(null);
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout request failed:', error);
      await clearAuthTokens();
    } finally {
      await AsyncStorage.removeItem(USER_KEY);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
