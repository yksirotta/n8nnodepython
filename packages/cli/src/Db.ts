/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { Container } from 'typedi';
import type { DataSourceOptions as ConnectionOptions, EntityManager, LoggerOptions } from 'typeorm';
import { DataSource as Connection } from 'typeorm';
import type { TlsOptions } from 'tls';
import { ErrorReporterProxy as ErrorReporter } from 'n8n-workflow';

import type { IDatabaseCollections } from '@/Interfaces';

import config from '@/config';

import {
	getMariaDBConnectionOptions,
	getMysqlConnectionOptions,
	getOptionOverrides,
	getPostgresConnectionOptions,
	getSqliteConnectionOptions,
} from '@db/config';
import { inTest } from '@/constants';
import { wrapMigration } from '@db/utils/migrationHelpers';
import type { DatabaseType, Migration } from '@db/types';
import { AuthIdentity } from '@db/entities/AuthIdentity';
import { AuthIdentityRepository } from '@db/repositories/authIdentity.repository';
import { AuthProviderSyncHistory } from '@db/entities/AuthProviderSyncHistory';
import { AuthProviderSyncHistoryRepository } from '@db/repositories/authProviderSyncHistory.repository';
import { CredentialsEntity } from '@db/entities/CredentialsEntity';
import { CredentialsRepository } from '@db/repositories/credentials.repository';
import { EventDestinations } from '@db/entities/EventDestinations';
import { EventDestinationsRepository } from '@db/repositories/eventDestinations.repository';
import { ExecutionData } from '@db/entities/ExecutionData';
import { ExecutionDataRepository } from '@db/repositories/executionData.repository';
import { ExecutionEntity } from '@db/entities/ExecutionEntity';
import { ExecutionMetadata } from '@db/entities/ExecutionMetadata';
import { ExecutionMetadataRepository } from '@db/repositories/executionMetadata.repository';
import { ExecutionRepository } from '@db/repositories/execution.repository';
import { InstalledNodes } from '@db/entities/InstalledNodes';
import { InstalledNodesRepository } from '@db/repositories/installedNodes.repository';
import { InstalledPackages } from '@db/entities/InstalledPackages';
import { InstalledPackagesRepository } from '@db/repositories/installedPackages.repository';
import { Role } from '@db/entities/Role';
import { RoleRepository } from '@db/repositories/role.repository';
import { Settings } from '@db/entities/Settings';
import { SettingsRepository } from '@db/repositories/settings.repository';
import { SharedCredentials } from '@db/entities/SharedCredentials';
import { SharedCredentialsRepository } from '@db/repositories/sharedCredentials.repository';
import { SharedWorkflow } from '@db/entities/SharedWorkflow';
import { SharedWorkflowRepository } from '@db/repositories/sharedWorkflow.repository';
import { TagEntity } from '@db/entities/TagEntity';
import { User } from '@db/entities/User';
import { UserRepository } from '@db/repositories/user.repository';
import { Variables } from '@db/entities/Variables';
import { VariablesRepository } from '@db/repositories/variables.repository';
import { WebhookEntity } from '@db/entities/WebhookEntity';
import { WorkflowEntity } from '@db/entities/WorkflowEntity';
import { WorkflowHistory } from '@db/entities/WorkflowHistory';
import { WorkflowRepository } from '@db/repositories/workflow.repository';
import { WorkflowStatistics } from '@db/entities/WorkflowStatistics';
import { WorkflowStatisticsRepository } from '@db/repositories/workflowStatistics.repository';
import { WorkflowTagMapping } from '@db/entities/WorkflowTagMapping';
import { WorkflowTagMappingRepository } from '@db/repositories/workflowTagMapping.repository';

const entities = [
	AuthIdentity,
	AuthProviderSyncHistory,
	CredentialsEntity,
	EventDestinations,
	ExecutionEntity,
	InstalledNodes,
	InstalledPackages,
	Role,
	Settings,
	SharedCredentials,
	SharedWorkflow,
	TagEntity,
	User,
	Variables,
	WebhookEntity,
	WorkflowEntity,
	WorkflowTagMapping,
	WorkflowStatistics,
	ExecutionMetadata,
	ExecutionData,
	WorkflowHistory,
];

export const collections = {} as IDatabaseCollections;

let connection: Connection;

export const getConnection = () => connection!;

type ConnectionState = {
	connected: boolean;
	migrated: boolean;
};

export const connectionState: ConnectionState = {
	connected: false,
	migrated: false,
};

// Ping DB connection every 2 seconds
let pingTimer: NodeJS.Timer | undefined;
if (!inTest) {
	const pingDBFn = async () => {
		if (connection?.isInitialized) {
			try {
				await connection.query('SELECT 1');
				connectionState.connected = true;
				return;
			} catch (error) {
				ErrorReporter.error(error);
			} finally {
				pingTimer = setTimeout(pingDBFn, 2000);
			}
		}
		connectionState.connected = false;
	};
	pingTimer = setTimeout(pingDBFn, 2000);
}

export async function transaction<T>(fn: (entityManager: EntityManager) => Promise<T>): Promise<T> {
	return connection.transaction(fn);
}

export async function getConnectionOptions(dbType: DatabaseType): Promise<ConnectionOptions> {
	switch (dbType) {
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
				...(await getPostgresConnectionOptions()),
				...getOptionOverrides('postgresdb'),
				ssl,
			};

		case 'mariadb':
		case 'mysqldb':
			return {
				...(await (dbType === 'mysqldb'
					? getMysqlConnectionOptions()
					: getMariaDBConnectionOptions())),
				...getOptionOverrides('mysqldb'),
				timezone: 'Z', // set UTC as default
			};

		case 'sqlite':
			return getSqliteConnectionOptions();

		default:
			throw new Error(`The database "${dbType}" is currently not supported!`);
	}
}

export async function init(testConnectionOptions?: ConnectionOptions): Promise<void> {
	if (connectionState.connected) return;

	const dbType = config.getEnv('database.type');
	const connectionOptions = testConnectionOptions ?? (await getConnectionOptions(dbType));

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
		entities,
		synchronize: false,
		logging: loggingOption,
		maxQueryExecutionTime,
		migrationsRun: false,
	});

	connection = new Connection(connectionOptions);
	Container.set(Connection, connection);
	await connection.initialize();

	if (dbType === 'postgresdb') {
		const schema = config.getEnv('database.postgresdb.schema');
		const searchPath = ['public'];
		if (schema !== 'public') {
			await connection.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
			searchPath.unshift(schema);
		}
		await connection.query(`SET search_path TO ${searchPath.join(',')};`);
	}

	connectionState.connected = true;

	/**
	 * @important Do not add to these collections. Inject the repository as a dependency instead.
	 */
	collections.AuthIdentity = Container.get(AuthIdentityRepository);
	collections.AuthProviderSyncHistory = Container.get(AuthProviderSyncHistoryRepository);
	collections.EventDestinations = Container.get(EventDestinationsRepository);
	collections.Execution = Container.get(ExecutionRepository);
	collections.ExecutionData = Container.get(ExecutionDataRepository);
	collections.ExecutionMetadata = Container.get(ExecutionMetadataRepository);
	collections.InstalledNodes = Container.get(InstalledNodesRepository);
	collections.InstalledPackages = Container.get(InstalledPackagesRepository);
	collections.SharedCredentials = Container.get(SharedCredentialsRepository);
	collections.SharedWorkflow = Container.get(SharedWorkflowRepository);
	collections.Variables = Container.get(VariablesRepository);
	collections.WorkflowStatistics = Container.get(WorkflowStatisticsRepository);
	collections.WorkflowTagMapping = Container.get(WorkflowTagMappingRepository);

	/**
	 * @important Do not remove these collections until cloud hooks are backwards compatible.
	 */
	collections.Role = Container.get(RoleRepository);
	collections.User = Container.get(UserRepository);
	collections.Settings = Container.get(SettingsRepository);
	collections.Credentials = Container.get(CredentialsRepository);
	collections.Workflow = Container.get(WorkflowRepository);
}

export async function migrate() {
	(connection.options.migrations as Migration[]).forEach(wrapMigration);
	await connection.runMigrations({ transaction: 'each' });
	connectionState.migrated = true;
}

export const close = async () => {
	if (pingTimer) {
		clearTimeout(pingTimer);
		pingTimer = undefined;
	}

	if (connection.isInitialized) await connection.destroy();
};
