import { Service } from 'typedi';
import { DataSource, In, Repository, type FindOptionsWhere, type EntityManager } from 'typeorm';
import type { IUserSettings } from 'n8n-workflow';
import { User } from '../entities/User';

@Service()
export class UserRepository extends Repository<User> {
	constructor(dataSource: DataSource) {
		super(User, dataSource.manager);
	}

	async get(where: FindOptionsWhere<User>): Promise<User | null> {
		return this.findOne({
			relations: ['globalRole'],
			where,
		});
	}

	async getByIds(transaction: EntityManager, ids: string[]) {
		return transaction.find(User, { where: { id: In(ids) } });
	}

	async updateUserSettings(id: string, userSettings: Partial<IUserSettings>) {
		const { settings: currentSettings } = await this.findOneOrFail({ where: { id } });
		return this.update(id, { settings: { ...currentSettings, ...userSettings } });
	}
}
