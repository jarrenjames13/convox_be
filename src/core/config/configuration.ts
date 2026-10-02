export interface DatabaseConfig {
  /** Full connection string, if provided (this is what Supabase gives you). */
  url?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  /** false for plain local Postgres; an options object when SSL is required. */
  ssl: false | { rejectUnauthorized: boolean };
  poolMax: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: DatabaseConfig;
}

/**
 * Decides how to connect to Postgres, supporting two setups without
 * needing separate code paths:
 *
 *  - Local dev: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (discrete vars),
 *    no SSL, since a local Postgres install isn't listening for it.
 *  - Supabase (or any managed Postgres): a single DATABASE_URL, which is
 *    what Supabase's dashboard gives you directly. SSL is required there.
 *
 * Resolution order:
 *  1. If DATABASE_URL is set, use it as the connection target.
 *  2. Otherwise, fall back to the discrete DB_* vars (local dev default).
 *
 * SSL is auto-detected from the target host (anything that isn't
 * localhost/127.0.0.1 is assumed to need SSL, which covers Supabase, RDS,
 * etc.) but can always be overridden explicitly with DB_SSL=true|false.
 */
export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const databaseUrl = process.env.DATABASE_URL;

  const targetHost = databaseUrl
    ? safeHostnameFrom(databaseUrl)
    : (process.env.DB_HOST ?? 'localhost');

  const isLocalHost = ['localhost', '127.0.0.1'].includes(targetHost);

  const sslEnv = process.env.DB_SSL; // 'true' | 'false' | undefined
  const sslEnabled = sslEnv !== undefined ? sslEnv === 'true' : !isLocalHost;

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';

  return {
    nodeEnv,
    port: parseInt(process.env.PORT ?? '4000', 10),
    database: {
      url: databaseUrl,
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'fb_multi_page_app',
      ssl: sslEnabled ? { rejectUnauthorized } : false,
      poolMax: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    },
  };
};

function safeHostnameFrom(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    // Malformed URL — treat as non-local so SSL defaults on rather than off.
    return 'unknown';
  }
}
