import type { Repository } from 'typeorm';
import { mock } from 'jest-mock-extended';
import type { ILogger } from 'n8n-workflow';
import type { IExternalHooksClass, IInternalHooksClass } from '@/Interfaces';
import type { User } from '@db/entities/User';
import type { AuthenticatedRequest, MeRequest } from '@/requests';
import { MeController } from '@/controllers';
import { BadRequestError } from '@/ResponseHelper';

describe('MeController', () => {
	let controller: MeController;
	let userRepository: Repository<User>;
	let user: User;

	beforeAll(() => {
		const logger = mock<ILogger>();
		const externalHooks = mock<IExternalHooksClass>();
		const internalHooks = mock<IInternalHooksClass>();
		userRepository = mock<Repository<User>>();
		user = mock();

		controller = new MeController({
			logger,
			externalHooks,
			internalHooks,
			repositories: { User: userRepository },
		});
	});

	describe('updateCurrentUser', () => {
		it('should throw BadRequestError if email is missing in the payload', async () => {
			const req = mock<MeRequest.Settings>({});
			expect(controller.updateCurrentUser(req, mock())).rejects.toThrowError(
				new BadRequestError('Email is mandatory'),
			);
		});

		it('should throw BadRequestError if email is invalid', async () => {
			const req = mock<MeRequest.Settings>({ body: { email: 'invalid-email' } });
			expect(controller.updateCurrentUser(req, mock())).rejects.toThrowError(
				new BadRequestError('Invalid email address'),
			);
		});
	});

	describe('API Key methods', () => {
		let req: AuthenticatedRequest;
		beforeAll(() => {
			req = mock({ user });
		});

		describe('createAPIKey', () => {
			it('should create and save an API key', async () => {
				const { apiKey } = await controller.createAPIKey(req);
				expect(userRepository.update).toHaveBeenCalledWith(user.id, { apiKey });
			});
		});

		describe('getAPIKey', () => {
			it('should return the users api key', async () => {
				const { apiKey } = await controller.getAPIKey(req);
				expect(apiKey).toEqual(user.apiKey);
			});
		});

		describe('deleteAPIKey', () => {
			it('should delete the API key', async () => {
				await controller.deleteAPIKey(req);
				expect(userRepository.update).toHaveBeenCalledWith(user.id, { apiKey: null });
			});
		});
	});
});
