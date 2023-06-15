import type { MigrationContext, ReversibleMigration } from '@db/types';
import { Table } from 'typeorm';

export class WebhookModel implements ReversibleMigration {
	async up({ queryRunner, tablePrefix, dbType }: MigrationContext) {
		const isMysql = dbType === 'mariadb' || dbType === 'mysqldb';

		await queryRunner.createTable(
			new Table({
				name: `${tablePrefix}webhook_entity`,
				columns: [
					{
						name: 'workflowId',
						type: isMysql ? 'int' : 'integer',
						isNullable: true,
					},
					{ name: 'webhookPath', type: 'varchar(255)', isNullable: false, isPrimary: true },
					{ name: 'method', type: 'varchar(255)', isNullable: false, isPrimary: true },
					{ name: 'node', type: 'varchar(255)', isNullable: false },
				],
				...(isMysql ? { engine: 'InnoDB' } : {}),
			}),
		);
	}

	async down({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.dropTable(`${tablePrefix}webhook_entity`);
	}
}
