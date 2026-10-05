import { validateEnvironment } from './configuration';

const secrets = {
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-longer-than-thirty-two-chars',
  REFRESH_TOKEN_PEPPER:
    'test-refresh-pepper-that-is-longer-than-thirty-two-chars',
};

describe('validateEnvironment', () => {
  it('builds a local PostgreSQL URL from DB settings when DATABASE_URL is absent', () => {
    const result = validateEnvironment({
      ...secrets,
      DB_USER: 'test user',
      DB_PASSWORD: 'p@ssword',
      DB_NAME: 'convox_test',
    });

    expect(result.DATABASE_URL).toBe(
      'postgresql://test%20user:p%40ssword@localhost:5432/convox_test?schema=public&connection_limit=10',
    );
  });

  it('prefers an explicit managed database URL', () => {
    const url =
      'postgresql://app:secret@db.example.test:5432/convox?sslmode=require&connection_limit=25';
    const result = validateEnvironment({ ...secrets, DATABASE_URL: url });

    expect(result.DATABASE_URL).toBe(url);
  });

  it('reports invalid setting names without echoing secret values', () => {
    const secret = 'short-secret-value';

    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: secret,
        REFRESH_TOKEN_PEPPER: secret,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: secret,
        REFRESH_TOKEN_PEPPER: secret,
      }),
    ).not.toThrow(secret);
  });
});
