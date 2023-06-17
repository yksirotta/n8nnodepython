import type { CookieOptions, Response } from 'express';
import { anyObject, captor, mock } from 'jest-mock-extended';
import jwt from 'jsonwebtoken';
import type { ILogger } from 'n8n-workflow';
import { LoggerProxy } from 'n8n-workflow';

import config from '@/config';
import type { User } from '@db/entities/User';
import type {
	CredentialsRepository,
	SettingsRepository,
	UserRepository,
	WorkflowRepository,
} from '@db/repositories';
import { BadRequestError } from '@/ResponseHelper';
import type { OwnerRequest } from '@/requests';
import { OwnerController } from '@/controllers';
import { AUTH_COOKIE_NAME } from '@/constants';
import type { InternalHooks } from '@/InternalHooks';
import { badPasswords } from '../shared/testData';

describe('OwnerController', () => {
	const internalHooks = mock<InternalHooks>();
	const userRepository = mock<UserRepository>();
	const settingsRepository = mock<SettingsRepository>();
	const credentialsRepository = mock<CredentialsRepository>();
	const workflowsRepository = mock<WorkflowRepository>();
	const controller = new OwnerController(
		internalHooks,
		userRepository,
		settingsRepository,
		credentialsRepository,
		workflowsRepository,
	);

	LoggerProxy.init(mock<ILogger>());

	describe('preSetup', () => {
		it('should throw a BadRequestError if the instance owner is already setup', async () => {
			config.set('userManagement.isInstanceOwnerSetUp', true);
			await expect(controller.preSetup()).rejects.toThrowError(
				new BadRequestError('Instance owner already setup'),
			);
		});

		it('should a return credential and workflow count', async () => {
			config.set('userManagement.isInstanceOwnerSetUp', false);
			credentialsRepository.countBy.mockResolvedValue(7);
			workflowsRepository.countBy.mockResolvedValue(31);
			const { credentials, workflows } = await controller.preSetup();
			expect(credentials).toBe(7);
			expect(workflows).toBe(31);
		});
	});

	describe('setupOwner', () => {
		it('should throw a BadRequestError if the instance owner is already setup', async () => {
			config.set('userManagement.isInstanceOwnerSetUp', true);
			await expect(controller.setupOwner(mock(), mock())).rejects.toThrowError(
				new BadRequestError('Instance owner already setup'),
			);
		});

		it('should throw a BadRequestError if the email is invalid', async () => {
			config.set('userManagement.isInstanceOwnerSetUp', false);
			const req = mock<OwnerRequest.Post>({ body: { email: 'invalid email' } });
			await expect(controller.setupOwner(req, mock())).rejects.toThrowError(
				new BadRequestError('Invalid email address'),
			);
		});

		describe('should throw if the password is invalid', () => {
			Object.entries(badPasswords).forEach(([password, errorMessage]) => {
				it(password, async () => {
					config.set('userManagement.isInstanceOwnerSetUp', false);
					const req = mock<OwnerRequest.Post>({ body: { email: 'valid@email.com', password } });
					await expect(controller.setupOwner(req, mock())).rejects.toThrowError(
						new BadRequestError(errorMessage),
					);
				});
			});
		});

		it('should throw a BadRequestError if firstName & lastName are missing ', async () => {
			config.set('userManagement.isInstanceOwnerSetUp', false);
			const req = mock<OwnerRequest.Post>({
				body: { email: 'valid@email.com', password: 'NewPassword123', firstName: '', lastName: '' },
			});
			await expect(controller.setupOwner(req, mock())).rejects.toThrowError(
				new BadRequestError('First and last names are mandatory'),
			);
		});

		it('should setup the instance owner successfully', async () => {
			const user = mock<User>({
				id: 'userId',
				globalRole: { scope: 'global', name: 'owner' },
				authIdentities: [],
			});
			const req = mock<OwnerRequest.Post>({
				body: {
					email: 'valid@email.com',
					password: 'NewPassword123',
					firstName: 'Jane',
					lastName: 'Doe',
				},
				user,
			});
			const res = mock<Response>();
			config.set('userManagement.isInstanceOwnerSetUp', false);
			userRepository.save.calledWith(anyObject()).mockResolvedValue(user);
			jest.spyOn(jwt, 'sign').mockImplementation(() => 'signed-token');

			await controller.setupOwner(req, res);

			expect(userRepository.save).toHaveBeenCalledWith(user);

			const cookieOptions = captor<CookieOptions>();
			expect(res.cookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, 'signed-token', cookieOptions);
			expect(cookieOptions.value.httpOnly).toBe(true);
			expect(cookieOptions.value.sameSite).toBe('lax');
		});
	});

	describe('skipSetup', () => {
		it('should skip setting up the instance owner', async () => {
			await controller.skipSetup();
			expect(settingsRepository.update).toHaveBeenCalledWith(
				{ key: 'userManagement.skipInstanceOwnerSetup' },
				{ value: JSON.stringify(true) },
			);
			expect(config.get('userManagement.skipInstanceOwnerSetup')).toBe(true);
		});
	});
});
