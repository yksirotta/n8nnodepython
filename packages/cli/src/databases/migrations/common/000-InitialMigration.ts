import type { TableColumnOptions } from 'typeorm';
import { Table } from 'typeorm';
import type { MigrationContext, ReversibleMigration } from '@db/types';

export class InitialMigration implements ReversibleMigration {
	async up({ queryRunner, tablePrefix, dbType }: MigrationContext) {
		const isMysql = dbType === 'mariadb' || dbType === 'mysqldb';
		const isPostgres = dbType === 'postgresdb';
		const isSqlite = dbType === 'sqlite';

		const booleanType = isMysql ? 'tinyint' : 'boolean';
		const timestampType = isPostgres ? 'timestamp' : 'datetime';
		const jsonType = isSqlite ? 'text' : 'json'; // TODO: migrate sqlite to real json columns

		const idColumnOptions: TableColumnOptions = {
			name: 'id',
			isPrimary: true,
			isNullable: false,
			type: isPostgres ? 'serial' : isMysql ? 'int' : 'integer',
			...(!isPostgres ? { isGenerated: true, generationStrategy: 'increment' } : {}),
		};

		await queryRunner.createTable(
			new Table({
				name: `${tablePrefix}credentials_entity`,
				columns: [
					idColumnOptions,
					{ name: 'name', type: 'varchar(128)', isNullable: false },
					{ name: 'data', type: 'text', isNullable: false },
					{ name: 'type', type: 'varchar(32)', isNullable: false },
					{ name: 'nodesAccess', type: jsonType, isNullable: false },
					{ name: 'createdAt', type: timestampType, isNullable: false },
					{ name: 'updatedAt', type: timestampType, isNullable: false },
				],
				indices: [{ columnNames: ['type'], name: `IDX_${tablePrefix}07fde106c0b471d8cc80a64fc8` }],
				...(isMysql ? { engine: 'InnoDB' } : {}),
			}),
			true,
		);

		await queryRunner.createTable(
			new Table({
				name: `${tablePrefix}workflow_entity`,
				columns: [
					idColumnOptions,
					{ name: 'name', type: 'varchar(128)', isNullable: false },
					{ name: 'active', type: booleanType, isNullable: false },
					{ name: 'nodes', type: jsonType, isNullable: false },
					{ name: 'connections', type: jsonType, isNullable: false },
					{ name: 'createdAt', type: timestampType, isNullable: false },
					{ name: 'updatedAt', type: timestampType, isNullable: false },
					{ name: 'settings', type: jsonType },
					{ name: 'staticData', type: jsonType },
				],
				...(isMysql ? { engine: 'InnoDB' } : {}),
			}),
			true,
		);

		const varcharType = isMysql ? 'varchar(255)' : 'varchar';
		await queryRunner.createTable(
			new Table({
				name: `${tablePrefix}execution_entity`,
				columns: [
					idColumnOptions,
					{ name: 'data', type: 'text', isNullable: false },
					{ name: 'finished', type: booleanType, isNullable: false },
					{ name: 'mode', type: varcharType, isNullable: false },
					{ name: 'retryOf', type: varcharType },
					{ name: 'retrySuccessId', type: varcharType },
					{ name: 'startedAt', type: timestampType, isNullable: false },
					{ name: 'stoppedAt', type: timestampType, isNullable: false },
					{ name: 'workflowData', type: jsonType, isNullable: false },
					{ name: 'workflowId', type: varcharType, isNullable: false },
				],
				indices: [
					{ columnNames: ['workflowId'], name: `IDX_${tablePrefix}c4d999a5e90784e8caccf5589d` },
				],
				...(isMysql ? { engine: 'InnoDB' } : {}),
			}),
			true,
		);
	}

	async down({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.dropTable(`${tablePrefix}execution_entity`);
		await queryRunner.dropTable(`${tablePrefix}workflow_entity`);
		await queryRunner.dropTable(`${tablePrefix}credentials_entity`);
	}
}
