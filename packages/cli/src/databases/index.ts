import { Service } from 'typedi';
import { DataSource, type DataSourceOptions, type LoggerOptions } from 'typeorm';
import type { TlsOptions } from 'tls';
import { ApplicationError, ErrorReporterProxy as ErrorReporter } from 'n8n-workflow';

import config from '@/config';
import { inTest } from '@/constants';
import type { DatabaseType, Migration } from './types';
import {
	getMariaDBConnectionOptions,
	getMysqlConnectionOptions,
	getOptionOverrides,
	getPostgresConnectionOptions,
	getSqliteConnectionOptions,
} from './config';
import { entities } from './entities';
import { wrapMigration } from './utils/migrationHelpers';

type ConnectionState = 'initializing' | 'connected' | 'ready' | 'disconnected';

@Service()
export class DBConnection {
	private dbType: DatabaseType = config.getEnv('database.type');

	private connection: DataSource;

	private connectionState: ConnectionState = 'initializing';

	private pingTimer: NodeJS.Timer | undefined;

	constructor() {
		const connectionOptions = this.getConnectionOptions();
		let loggingOption: LoggerOptions = config.getEnv('database.logging.enabled');
		if (loggingOption) {
			const optionsString = config.getEnv('database.logging.options').replace(/\s+/g, '');
			if (optionsString === 'all') {
				loggingOption = optionsString;
			} else {
				loggingOption = optionsString.split(',') as LoggerOptions;
			}
		}

		const maxQueryExecutionTime = config.getEnv('database.logging.maxQueryExecutionTime');

		Object.assign(connectionOptions, {
			entities: Object.values(entities),
			synchronize: false,
			logging: loggingOption,
			maxQueryExecutionTime,
			migrationsRun: false,
		});

		this.connection = new DataSource(connectionOptions);
	}

	async connect() {
		await this.connection.initialize();
		if (!inTest) {
			this.pingTimer = setTimeout(async () => this.ping(), 2000);
		}
		this.connectionState = 'connected';
	}

	async migrate() {
		(this.connection.options.migrations as Migration[]).forEach(wrapMigration);
		await this.connection.runMigrations({ transaction: 'each' });
		this.connectionState = 'ready';
	}

	async disconnect() {
		if (this.pingTimer) {
			clearTimeout(this.pingTimer);
			this.pingTimer = undefined;
		}

		if (this.connection.isInitialized) await this.connection.destroy();
	}

	getConnectionOptions(): DataSourceOptions {
		switch (this.dbType) {
			case 'postgresdb':
				const sslCa = config.getEnv('database.postgresdb.ssl.ca');
				const sslCert = config.getEnv('database.postgresdb.ssl.cert');
				const sslKey = config.getEnv('database.postgresdb.ssl.key');
				const sslRejectUnauthorized = config.getEnv('database.postgresdb.ssl.rejectUnauthorized');

				let ssl: TlsOptions | boolean = config.getEnv('database.postgresdb.ssl.enabled');
				if (sslCa !== '' || sslCert !== '' || sslKey !== '' || !sslRejectUnauthorized) {
					ssl = {
						ca: sslCa || undefined,
						cert: sslCert || undefined,
						key: sslKey || undefined,
						rejectUnauthorized: sslRejectUnauthorized,
					};
				}

				return {
					...getPostgresConnectionOptions(),
					...getOptionOverrides('postgresdb'),
					...this.getCommonOptions(),
					ssl,
				};

			case 'mariadb':
			case 'mysqldb':
				return {
					...(this.dbType === 'mysqldb'
						? getMysqlConnectionOptions()
						: getMariaDBConnectionOptions()),
					...getOptionOverrides('mysqldb'),
					...this.getCommonOptions(),
					timezone: 'Z', // set UTC as default
				};

			case 'sqlite':
				return {
					...getSqliteConnectionOptions(),
					...this.getCommonOptions(),
				};

			default:
				throw new ApplicationError('Database type currently not supported', {
					extra: { dbType: this.dbType },
				});
		}
	}

	private getCommonOptions() {
		let loggingOption: LoggerOptions = config.getEnv('database.logging.enabled');
		if (loggingOption) {
			const optionsString = config.getEnv('database.logging.options').replace(/\s+/g, '');
			if (optionsString === 'all') {
				loggingOption = optionsString;
			} else {
				loggingOption = optionsString.split(',') as LoggerOptions;
			}
		}

		const maxQueryExecutionTime = config.getEnv('database.logging.maxQueryExecutionTime');

		return {
			entities: Object.values(entities),
			synchronize: false,
			logging: loggingOption,
			maxQueryExecutionTime,
			migrationsRun: false,
		};
	}

	private async ping() {
		try {
			await this.connection.query('SELECT 1');
			this.connectionState = 'connected';
			return;
		} catch (error) {
			ErrorReporter.error(error);
		} finally {
			this.pingTimer = setTimeout(async () => this.ping(), 2000);
		}
	}
}
