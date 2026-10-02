import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DatabaseConfig } from '../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const db = config.get<DatabaseConfig>('database')!;
        const nodeEnv = config.get<string>('nodeEnv');

        // A connection string (Supabase) takes priority over discrete vars
        // (local dev). Both branches feed the same options object below, so
        // nothing downstream (entities, migrations, repositories) needs to
        // know or care which one is active.
        const connectionTarget = db.url
          ? { url: db.url }
          : {
              host: db.host,
              port: db.port,
              username: db.username,
              password: db.password,
              database: db.database,
            };

        return {
          type: 'postgres',
          ...connectionTarget,
          ssl: db.ssl,
          autoLoadEntities: true,
          // Never run schema auto-sync in production — use migrations there.
          synchronize: nodeEnv !== 'production',
          extra: {
            max: db.poolMax,
          },
        } as TypeOrmModuleOptions;
      },
    }),
  ],
})
export class DatabaseModule {}
