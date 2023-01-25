/* eslint-disable @typescript-eslint/naming-convention */
import * as Db from '@/Db';
import { LDAP_FEATURE_NAME } from '@/Ldap/constants';
import { In } from 'typeorm';
import { BaseCommand } from '../BaseCommand';

export class Reset extends BaseCommand {
	static description = '\nResets the database to the default ldap state';

	async run(): Promise<void> {
		const { AuthIdentity, AuthProviderSyncHistory, Settings } = Db.collections;
		const { User } = Db.repositories;
		const ldapIdentities = await AuthIdentity.find({
			where: { providerType: 'ldap' },
			select: ['userId'],
		});
		await AuthProviderSyncHistory.delete({ providerType: 'ldap' });
		await AuthIdentity.delete({ providerType: 'ldap' });
		await User.delete({ id: In(ldapIdentities.map((i) => i.userId)) });
		await Settings.delete({ key: LDAP_FEATURE_NAME });

		this.logger.info('Successfully reset the database to default ldap state.');
	}

	async catch(error: Error): Promise<void> {
		this.logger.error('Error resetting database. See log messages for details.');
		this.logger.error(error.message);
	}
}
