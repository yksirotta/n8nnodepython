import { Service } from 'typedi';
import { DataSource, Repository } from 'typeorm';
import { User, type UserWithMFA } from '../entities/User';

@Service()
export class UserRepository extends Repository<User> {
	private mfaRepository: Repository<UserWithMFA>;

	constructor(dataSource: DataSource) {
		super(User, dataSource.manager);
	}

	async countUsersWithMFA(): Promise<number> {
		return this.mfaRepository.count({ where: { mfaEnabled: true } });
	}

	async enableMFA(userId: string) {
		await this.mfaRepository.update({ id: userId }, { mfaEnabled: true });
	}

	async getSecretAndRecoveryCodes(userId: string) {
		const { mfaSecret, mfaRecoveryCodes } = await this.mfaRepository.findOneOrFail({
			where: { id: userId },
			select: ['id', 'mfaSecret', 'mfaRecoveryCodes'],
		});
		return { mfaSecret, mfaRecoveryCodes };
	}

	async updateRecoveryCodes(userId: string, mfaRecoveryCodes: string[]) {
		await this.mfaRepository.update({ id: userId }, { mfaRecoveryCodes });
	}

	async updateSecretAndRecoveryCodes(
		userId: string,
		mfaSecret: string,
		mfaRecoveryCodes: string[],
	) {
		await this.mfaRepository.update({ id: userId }, { mfaSecret, mfaRecoveryCodes });
	}

	async disableMfa(userId: string) {
		await this.mfaRepository.update(
			{ id: userId },
			{
				mfaEnabled: false,
				mfaRecoveryCodes: [],
			},
		);
	}
}
