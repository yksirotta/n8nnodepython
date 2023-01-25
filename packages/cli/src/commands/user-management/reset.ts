import { Not } from 'typeorm';
import * as Db from '@/Db';
import type { CredentialsEntity } from '@db/entities/CredentialsEntity';
import { User } from '@db/entities/User';
import { BaseCommand } from '../BaseCommand';

const defaultUserProps = {
	firstName: null,
	lastName: null,
	email: null,
	password: null,
	resetPasswordToken: null,
};

export class Reset extends BaseCommand {
	static description = 'Resets the database to the default user state';

	static examples = ['$ n8n user-management:reset'];

	async run(): Promise<void> {
		const owner = await this.getInstanceOwner();

		const ownerWorkflowRole = await Db.repositories.Role.findWorkflowOwnerRole();
		const ownerCredentialRole = await Db.repositories.Role.findCredentialOwnerRole();

		await Db.collections.SharedWorkflow.update(
			{ userId: Not(owner.id), roleId: ownerWorkflowRole?.id },
			{ userId: owner.id },
		);

		await Db.collections.SharedCredentials.update(
			{ userId: Not(owner.id), roleId: ownerCredentialRole?.id },
			{ userId: owner.id },
		);

		await Db.repositories.User.delete({ id: Not(owner.id) });
		await Db.repositories.User.save(Object.assign(owner, defaultUserProps));

		const danglingCredentials: CredentialsEntity[] =
			(await Db.collections.Credentials.createQueryBuilder('credentials')
				.leftJoinAndSelect('credentials.shared', 'shared')
				.where('shared.credentialsId is null')
				.getMany()) as CredentialsEntity[];
		const newSharedCredentials = danglingCredentials.map((credentials) =>
			Db.collections.SharedCredentials.create({
				credentials,
				userId: owner.id,
				roleId: ownerCredentialRole?.id,
			}),
		);
		await Db.collections.SharedCredentials.save(newSharedCredentials);

		await Db.collections.Settings.update(
			{ key: 'userManagement.isInstanceOwnerSetUp' },
			{ value: 'false' },
		);
		await Db.collections.Settings.update(
			{ key: 'userManagement.skipInstanceOwnerSetup' },
			{ value: 'false' },
		);

		this.logger.info('Successfully reset the database to default user state.');
	}

	private async getInstanceOwner(): Promise<User> {
		const globalRole = await Db.repositories.Role.findGlobalOwnerRoleOrFail();

		const owner = await Db.repositories.User.findByRole('global', 'owner');

		if (owner) return owner;

		const user = new User();

		Object.assign(user, { ...defaultUserProps, globalRoleId: globalRole.id });

		await Db.repositories.User.save(user);

		return Db.repositories.User.findByRoleOrFail('global', 'owner');
	}

	async catch(error: Error): Promise<void> {
		this.logger.error('Error resetting database. See log messages for details.');
		this.logger.error(error.message);
		this.exit(1);
	}
}
