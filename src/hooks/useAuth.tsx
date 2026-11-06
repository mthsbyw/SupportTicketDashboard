import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { UiPath, UiPathError } from "@uipath/uipath-typescript/core";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  sdk: UiPath;
  login: () => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sdk] = useState(() => new UiPath());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const initializeAuth = async () => {
      try {
        if (sdk.isInOAuthCallback()) {
          await sdk.completeOAuth();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        }
        const authenticated = sdk.isAuthenticated();
        setIsAuthenticated(authenticated);
      } catch (err) {
        console.error("Authentication failed:", err);
        setError(
          err instanceof UiPathError ? err.message : "Authentication failed",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void initializeAuth();
    return () => sdk.destroy();
  }, [sdk]);

  const login = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await sdk.initialize();
      const authenticated = sdk.isAuthenticated();
      setIsAuthenticated(authenticated);
    } catch (err) {
      setError(err instanceof UiPathError ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    sdk.logout();
    setIsAuthenticated(false);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        sdk,
        login,
        logout,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
