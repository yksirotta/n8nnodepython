import { Service } from 'typedi';
import type { FindOptionsWhere } from 'typeorm';
import { DataSource, Repository } from 'typeorm';
import { SharedWorkflow } from '../entities/SharedWorkflow';
import type { User } from '../entities/User';

@Service()
export class SharedWorkflowRepository extends Repository<SharedWorkflow> {
	constructor(dataSource: DataSource) {
		super(SharedWorkflow, dataSource.manager);
	}

	async getSharing(
		user: User,
		workflowId: string,
		relations: string[] = ['workflow'],
		{ allowGlobalOwner } = { allowGlobalOwner: true },
	): Promise<SharedWorkflow | null> {
		const where: FindOptionsWhere<SharedWorkflow> = { workflowId };

		// Omit user from where if the requesting user is the global
		// owner. This allows the global owner to view and delete
		// workflows they don't own.
		if (!allowGlobalOwner || user.globalRole.name !== 'owner') {
			where.userId = user.id;
		}

		return this.findOne({ where, relations });
	}
}
