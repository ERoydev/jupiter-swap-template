function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as string;
}

export const SOLANA_RPC_URL = requireEnv("VITE_SOLANA_RPC_URL");
export const JUPITER_API_URL = requireEnv("VITE_JUPITER_API_URL");
export const JUPITER_API_KEY = (import.meta.env.VITE_JUPITER_API_KEY as string | undefined) ?? "";
