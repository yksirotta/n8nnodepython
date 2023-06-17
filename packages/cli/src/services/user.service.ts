import { v4 as uuid } from 'uuid';
import { Service } from 'typedi';

import type { IUserSettings } from 'n8n-workflow';
import type { User } from '@db/entities/User';
import { RoleRepository, SharedWorkflowRepository, UserRepository } from '@/databases/repositories';
import { URLService } from './url.service';

@Service()
export class UserService {
	constructor(
		private readonly urlService: URLService,
		private readonly roleRepository: RoleRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly userRepository: UserRepository,
	) {}

	async generatePasswordResetUrl(user: User): Promise<string> {
		user.resetPasswordToken = uuid();
		const { id, resetPasswordToken } = user;
		const resetPasswordTokenExpiration = Math.floor(Date.now() / 1000) + 7200;
		await this.userRepository.update(id, { resetPasswordToken, resetPasswordTokenExpiration });

		const url = new URL(`${this.urlService.instanceBaseUrl}/change-password`);
		url.searchParams.append('userId', id);
		url.searchParams.append('token', resetPasswordToken);
		return url.toString();
	}

	async getInstanceOwner(): Promise<User> {
		const ownerRoleId = await this.roleRepository.findRoleIdOrFail('global', 'owner');
		return this.userRepository.findOneOrFail({
			relations: ['globalRole'],
			where: {
				globalRoleId: ownerRoleId,
			},
		});
	}

	async getWorkflowOwner(workflowId: string): Promise<User> {
		const sharedWorkflow = await this.sharedWorkflowRepository.findOneOrFail({
			relations: ['user'],
			where: {
				workflowId,
				role: {
					scope: 'workflow',
					name: 'owner',
				},
			},
		});
		return sharedWorkflow.user;
	}

	async updateUserSettings(id: string, userSettings: Partial<IUserSettings>) {
		const { settings: currentSettings } = await this.userRepository.findOneOrFail({
			where: { id },
		});
		return this.userRepository.update(id, { settings: { ...currentSettings, ...userSettings } });
	}
}
