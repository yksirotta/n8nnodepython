import path from 'path';
import { Container } from 'typedi';
import type { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { InstanceSettings } from 'n8n-core';

import type { DatabaseType } from '@db/types';
import config from '@/config';

const getDBConnectionOptions = (dbType: DatabaseType) => {
	const entityPrefix = config.getEnv('database.tablePrefix');
	const configDBType = dbType === 'mariadb' ? 'mysqldb' : dbType;
	const connectionDetails =
		configDBType === 'sqlite'
			? {
					database: path.resolve(
						Container.get(InstanceSettings).n8nFolder,
						config.getEnv('database.sqlite.database'),
					),
					enableWAL: config.getEnv('database.sqlite.enableWAL'),
			  }
			: {
					database: config.getEnv(`database.${configDBType}.database`),
					username: config.getEnv(`database.${configDBType}.user`),
					password: config.getEnv(`database.${configDBType}.password`),
					host: config.getEnv(`database.${configDBType}.host`),
					port: config.getEnv(`database.${configDBType}.port`),
			  };
	return {
		entityPrefix,
		migrationsTableName: `${entityPrefix}migrations`,
		...connectionDetails,
	};
};

export const getOptionOverrides = (dbType: 'postgresdb' | 'mysqldb') => ({
	database: config.getEnv(`database.${dbType}.database`),
	host: config.getEnv(`database.${dbType}.host`),
	port: config.getEnv(`database.${dbType}.port`),
	username: config.getEnv(`database.${dbType}.user`),
	password: config.getEnv(`database.${dbType}.password`),
});

export const getSqliteConnectionOptions = async (): Promise<SqliteConnectionOptions> => ({
	type: 'sqlite',
	...getDBConnectionOptions('sqlite'),
	migrations: (await import('./migrations/sqlite')).sqliteMigrations,
});

export const getPostgresConnectionOptions = async (): Promise<PostgresConnectionOptions> => ({
	type: 'postgres',
	...getDBConnectionOptions('postgresdb'),
	schema: config.getEnv('database.postgresdb.schema'),
	migrations: (await import('./migrations/postgresdb')).postgresMigrations,
});

export const getMysqlConnectionOptions = async (): Promise<MysqlConnectionOptions> => ({
	type: 'mysql',
	...getDBConnectionOptions('mysqldb'),
	migrations: (await import('./migrations/mysqldb')).mysqlMigrations,
});

export const getMariaDBConnectionOptions = async (): Promise<MysqlConnectionOptions> => ({
	type: 'mariadb',
	...getDBConnectionOptions('mysqldb'),
	migrations: (await import('./migrations/mysqldb')).mysqlMigrations,
});
