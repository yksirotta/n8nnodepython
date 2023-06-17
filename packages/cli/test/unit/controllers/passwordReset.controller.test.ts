import { mock } from 'jest-mock-extended';
import type { ILogger } from 'n8n-workflow';
import { LoggerProxy } from 'n8n-workflow';

import config from '@/config';
import { PasswordResetController } from '@/controllers';
import type { UserRepository } from '@/databases/repositories';
import type { UserManagementMailer } from '@/UserManagement/email';
import type { PasswordResetRequest } from '@/requests';
import { BadRequestError } from '@/ResponseHelper';
import type { User } from '@/databases/entities/User';
import type { UserService } from '@/services/user.service';
import type { URLService } from '@/services/url.service';
import type { ExternalHooks } from '@/ExternalHooks';
import type { InternalHooks } from '@/InternalHooks';

import { randomEmail, randomName, randomValidPassword } from '../../integration/shared/random';

describe('PasswordResetController', () => {
	const externalHooks = mock<ExternalHooks>();
	const internalHooks = mock<InternalHooks>();
	const mailer = mock<UserManagementMailer>();
	const userService = mock<UserService>();
	const urlService = mock<URLService>({ instanceBaseUrl: 'base-url' });
	const userRepository = mock<UserRepository>();
	const controller = new PasswordResetController(
		externalHooks,
		internalHooks,
		mailer,
		userService,
		urlService,
		userRepository,
	);

	LoggerProxy.init(mock<ILogger>());

	config.set('userManagement.emails.mode', 'smtp');
	config.set('userManagement.authenticationMethod', 'email');

	describe('forgotPassword', () => {
		it('should throw a BadRequestError if the email is missing', async () => {
			const req = mock<PasswordResetRequest.Email>();
			await expect(controller.forgotPassword(req)).rejects.toThrowError(
				new BadRequestError('Email is mandatory'),
			);
		});

		test('should throw a BadRequestError if the email is invalid', async () => {
			const req = mock<PasswordResetRequest.Email>({ body: { email: 'invalid email' } });
			await expect(controller.forgotPassword(req)).rejects.toThrowError(
				new BadRequestError('Invalid email address'),
			);
		});

		test('quietly returns if no user is found for this email', async () => {
			userRepository.findOne.mockResolvedValueOnce(null);
			const req = mock<PasswordResetRequest.Email>({ body: { email: randomEmail() } });
			await controller.forgotPassword(req);
			expect(mailer.passwordReset).not.toHaveBeenCalled();
		});

		test('send email for a valid user', async () => {
			const user = mock<User>({
				email: randomEmail(),
				firstName: randomName(),
				lastName: randomName(),
				password: randomValidPassword(),
				authIdentities: undefined,
			});
			userRepository.findOne.mockResolvedValueOnce(user);
			userService.generatePasswordResetUrl.calledWith(user).mockResolvedValue('password-reset-url');

			const req = mock<PasswordResetRequest.Email>({ body: { email: user.email } });
			await controller.forgotPassword(req);

			expect(mailer.passwordReset).toHaveBeenCalledWith({
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				passwordResetUrl: 'password-reset-url',
				domain: 'base-url',
			});
		});
	});
});
