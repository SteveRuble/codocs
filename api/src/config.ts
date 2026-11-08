// All environment access lives here. The rest of the app imports `config`
// and never touches process.env directly, so config is typed and validated once.

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(required("PORT", "4000")),
  webOrigin: required("WEB_ORIGIN", "http://localhost:3000"),
  isProduction: process.env.NODE_ENV === "production",
} as const;
