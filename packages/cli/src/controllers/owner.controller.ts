import validator from 'validator';
import { Response } from 'express';
import { Service } from 'typedi';
import { LoggerProxy as logger } from 'n8n-workflow';

import config from '@/config';
import { Authorized, Get, Post, RestController } from '@/decorators';
import { validateEntity } from '@/GenericHelpers';
import { BadRequestError } from '@/ResponseHelper';
import {
	hashPassword,
	sanitizeUser,
	validatePassword,
} from '@/UserManagement/UserManagementHelper';
import { issueCookie } from '@/auth/jwt';
import { OwnerRequest } from '@/requests';
import {
	CredentialsRepository,
	SettingsRepository,
	UserRepository,
	WorkflowRepository,
} from '@db/repositories';
import { InternalHooks } from '@/InternalHooks';

@Service()
@Authorized(['global', 'owner'])
@RestController('/owner')
export class OwnerController {
	constructor(
		private readonly internalHooks: InternalHooks,
		private readonly userRepository: UserRepository,
		private readonly settingsRepository: SettingsRepository,
		private readonly credentialsRepository: CredentialsRepository,
		private readonly workflowsRepository: WorkflowRepository,
	) {}

	@Get('/pre-setup')
	async preSetup(): Promise<{ credentials: number; workflows: number }> {
		if (config.getEnv('userManagement.isInstanceOwnerSetUp')) {
			throw new BadRequestError('Instance owner already setup');
		}

		const [credentials, workflows] = await Promise.all([
			this.credentialsRepository.countBy({}),
			this.workflowsRepository.countBy({}),
		]);
		return { credentials, workflows };
	}

	/**
	 * Promote a shell into the owner of the n8n instance,
	 * and enable `isInstanceOwnerSetUp` setting.
	 */
	@Post('/setup')
	async setupOwner(req: OwnerRequest.Post, res: Response) {
		const { email, firstName, lastName, password } = req.body;
		const { id: userId, globalRole } = req.user;

		if (config.getEnv('userManagement.isInstanceOwnerSetUp')) {
			logger.debug(
				'Request to claim instance ownership failed because instance owner already exists',
				{
					userId,
				},
			);
			throw new BadRequestError('Instance owner already setup');
		}

		if (!email || !validator.isEmail(email)) {
			logger.debug('Request to claim instance ownership failed because of invalid email', {
				userId,
				invalidEmail: email,
			});
			throw new BadRequestError('Invalid email address');
		}

		const validPassword = validatePassword(password);

		if (!firstName || !lastName) {
			logger.debug(
				'Request to claim instance ownership failed because of missing first name or last name in payload',
				{ userId, payload: req.body },
			);
			throw new BadRequestError('First and last names are mandatory');
		}

		// TODO: This check should be in a middleware outside this class
		if (globalRole.scope === 'global' && globalRole.name !== 'owner') {
			logger.debug(
				'Request to claim instance ownership failed because user shell does not exist or has wrong role!',
				{
					userId,
				},
			);
			throw new BadRequestError('Invalid request');
		}

		let owner = req.user;

		Object.assign(owner, {
			email,
			firstName,
			lastName,
			password: await hashPassword(validPassword),
		});

		await validateEntity(owner);

		owner = await this.userRepository.save(owner);

		logger.info('Owner was set up successfully', { userId });

		await this.settingsRepository.update(
			{ key: 'userManagement.isInstanceOwnerSetUp' },
			{ value: JSON.stringify(true) },
		);

		config.set('userManagement.isInstanceOwnerSetUp', true);

		logger.debug('Setting isInstanceOwnerSetUp updated successfully', { userId });

		await issueCookie(res, owner);

		void this.internalHooks.onInstanceOwnerSetup({ user_id: userId });

		return sanitizeUser(owner);
	}

	/**
	 * Persist that the instance owner setup has been skipped
	 */
	@Post('/skip-setup')
	async skipSetup() {
		await this.settingsRepository.update(
			{ key: 'userManagement.skipInstanceOwnerSetup' },
			{ value: JSON.stringify(true) },
		);

		config.set('userManagement.skipInstanceOwnerSetup', true);

		return { success: true };
	}
}
