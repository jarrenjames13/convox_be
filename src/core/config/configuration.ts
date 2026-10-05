import { z } from 'zod';

const optionalSecret = z.string().optional();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .url()
      .refine(
        (value) =>
          ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        'Must be a PostgreSQL URL',
      )
      .optional(),
  ),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('convox_db'),
  DB_SSL: z.enum(['true', 'false']).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  META_APP_ID: optionalSecret,
  META_APP_SECRET: optionalSecret,
  META_WEBHOOK_VERIFY_TOKEN: optionalSecret,
  META_GRAPH_API_VERSION: z.string().default('v26.0'),
  META_PAGE_ID: optionalSecret,
  META_PAGE_ACCESS_TOKEN: optionalSecret,
  CONVERSATION_REOPEN_WINDOW_HOURS: z.coerce.number().int().min(1).default(24),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_AGENT_PASSWORD: z.string().min(12).optional(),
});

export type Environment = z.infer<typeof environmentSchema> & {
  DATABASE_URL: string;
};

/** Validate settings without ever including secret values in validation errors. */
export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const failures = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${failures}`);
  }

  const values = result.data;
  const url = new URL(
    values.DATABASE_URL ??
      makeDatabaseUrl({
        host: values.DB_HOST,
        port: values.DB_PORT,
        username: values.DB_USER,
        password: values.DB_PASSWORD,
        database: values.DB_NAME,
        ssl: values.DB_SSL
          ? values.DB_SSL === 'true'
          : !['localhost', '127.0.0.1'].includes(values.DB_HOST),
      }),
  );
  const hostname = url.hostname;
  const sslEnabled = values.DB_SSL
    ? values.DB_SSL === 'true'
    : !['localhost', '127.0.0.1'].includes(hostname);
  if (sslEnabled && !url.searchParams.has('sslmode'))
    url.searchParams.set('sslmode', 'require');
  if (values.DB_SSL && !sslEnabled) url.searchParams.set('sslmode', 'disable');
  if (!url.searchParams.has('connection_limit'))
    url.searchParams.set('connection_limit', String(values.DB_POOL_MAX));
  if (sslEnabled && values.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    url.searchParams.set('sslaccept', 'accept_invalid_certs');
  }
  const databaseUrl = url.toString();

  return { ...values, DATABASE_URL: databaseUrl };
}

function makeDatabaseUrl(input: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}): string {
  const url = new URL(
    `postgresql://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${input.host}:${input.port}/${encodeURIComponent(input.database)}`,
  );
  url.searchParams.set('schema', 'public');
  if (input.ssl) url.searchParams.set('sslmode', 'require');
  return url.toString();
}
