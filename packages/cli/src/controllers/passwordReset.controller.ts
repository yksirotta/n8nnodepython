import { IsNull, MoreThanOrEqual, Not } from 'typeorm';
import validator from 'validator';
import { Response } from 'express';
import { Service } from 'typedi';
import { LoggerProxy as logger } from 'n8n-workflow';

import config from '@/config';
import { Get, Post, RestController } from '@/decorators';
import {
	BadRequestError,
	InternalServerError,
	NotFoundError,
	UnauthorizedError,
	UnprocessableRequestError,
} from '@/ResponseHelper';
import { hashPassword, validatePassword } from '@/UserManagement/UserManagementHelper';
import { UserManagementMailer } from '@/UserManagement/email';

import { UserRepository } from '@db/repositories';
import { PasswordResetRequest } from '@/requests';
import { issueCookie } from '@/auth/jwt';
import { isLdapEnabled } from '@/Ldap/helpers';
import { isSamlCurrentAuthenticationMethod } from '../sso/ssoHelpers';
import { UserService } from '@/services/user.service';
import { URLService } from '@/services/url.service';
import { ExternalHooks } from '@/ExternalHooks';
import { InternalHooks } from '@/InternalHooks';

@Service()
@RestController()
export class PasswordResetController {
	constructor(
		private readonly externalHooks: ExternalHooks,
		private readonly internalHooks: InternalHooks,
		private readonly mailer: UserManagementMailer,
		private readonly userService: UserService,
		private readonly urlService: URLService,
		private readonly userRepository: UserRepository,
	) {}

	/**
	 * Send a password reset email.
	 */
	@Post('/forgot-password')
	async forgotPassword(req: PasswordResetRequest.Email) {
		if (config.getEnv('userManagement.emails.mode') === '') {
			logger.debug('Request to send password reset email failed because emailing was not set up');
			throw new InternalServerError(
				'Email sending must be set up in order to request a password reset email',
			);
		}

		const { email } = req.body;
		if (!email) {
			logger.debug(
				'Request to send password reset email failed because of missing email in payload',
				{ payload: req.body },
			);
			throw new BadRequestError('Email is mandatory');
		}

		if (!validator.isEmail(email)) {
			logger.debug(
				'Request to send password reset email failed because of invalid email in payload',
				{ invalidEmail: email },
			);
			throw new BadRequestError('Invalid email address');
		}

		// User should just be able to reset password if one is already present
		const user = await this.userRepository.findOne({
			where: {
				email,
				password: Not(IsNull()),
			},
			relations: ['authIdentities', 'globalRole'],
		});

		if (
			isSamlCurrentAuthenticationMethod() &&
			!(user?.globalRole.name === 'owner' || user?.settings?.allowSSOManualLogin === true)
		) {
			logger.debug('Request to send password reset email failed because login is handled by SAML');
			throw new UnauthorizedError(
				'Login is handled by SAML. Please contact your Identity Provider to reset your password.',
			);
		}

		const ldapIdentity = user?.authIdentities?.find((i) => i.providerType === 'ldap');

		if (!user?.password || (ldapIdentity && user.disabled)) {
			logger.debug(
				'Request to send password reset email failed because no user was found for the provided email',
				{ invalidEmail: email },
			);
			return;
		}

		if (isLdapEnabled() && ldapIdentity) {
			throw new UnprocessableRequestError('forgotPassword.ldapUserPasswordResetUnavailable');
		}

		const baseUrl = this.urlService.instanceBaseUrl;
		const { id, firstName, lastName } = user;
		const url = await this.userService.generatePasswordResetUrl(user);

		try {
			await this.mailer.passwordReset({
				email,
				firstName,
				lastName,
				passwordResetUrl: url,
				domain: baseUrl,
			});
		} catch (error) {
			void this.internalHooks.onEmailFailed({
				user,
				message_type: 'Reset password',
				public_api: false,
			});
			if (error instanceof Error) {
				throw new InternalServerError(`Please contact your administrator: ${error.message}`);
			}
		}

		logger.info('Sent password reset email successfully', { userId: user.id, email });
		void this.internalHooks.onUserTransactionalEmail({
			user_id: id,
			message_type: 'Reset password',
			public_api: false,
		});

		void this.internalHooks.onUserPasswordResetRequestClick({ user });
	}

	/**
	 * Verify password reset token and user ID.
	 */
	@Get('/resolve-password-token')
	async resolvePasswordToken(req: PasswordResetRequest.Credentials) {
		const { token: resetPasswordToken, userId: id } = req.query;

		if (!resetPasswordToken || !id) {
			logger.debug(
				'Request to resolve password token failed because of missing password reset token or user ID in query string',
				{
					queryString: req.query,
				},
			);
			throw new BadRequestError('');
		}

		// Timestamp is saved in seconds
		const currentTimestamp = Math.floor(Date.now() / 1000);

		const user = await this.userRepository.findOneBy({
			id,
			resetPasswordToken,
			resetPasswordTokenExpiration: MoreThanOrEqual(currentTimestamp),
		});

		if (!user) {
			logger.debug(
				'Request to resolve password token failed because no user was found for the provided user ID and reset password token',
				{
					userId: id,
					resetPasswordToken,
				},
			);
			throw new NotFoundError('');
		}

		logger.info('Reset-password token resolved successfully', { userId: id });
		void this.internalHooks.onUserPasswordResetEmailClick({ user });
	}

	/**
	 * Verify password reset token and user ID and update password.
	 */
	@Post('/change-password')
	async changePassword(req: PasswordResetRequest.NewPassword, res: Response) {
		const { token: resetPasswordToken, userId, password } = req.body;

		if (!resetPasswordToken || !userId || !password) {
			logger.debug(
				'Request to change password failed because of missing user ID or password or reset password token in payload',
				{
					payload: req.body,
				},
			);
			throw new BadRequestError('Missing user ID or password or reset password token');
		}

		const validPassword = validatePassword(password);

		// Timestamp is saved in seconds
		const currentTimestamp = Math.floor(Date.now() / 1000);

		const user = await this.userRepository.findOne({
			where: {
				id: userId,
				resetPasswordToken,
				resetPasswordTokenExpiration: MoreThanOrEqual(currentTimestamp),
			},
			relations: ['authIdentities'],
		});

		if (!user) {
			logger.debug(
				'Request to resolve password token failed because no user was found for the provided user ID and reset password token',
				{
					userId,
					resetPasswordToken,
				},
			);
			throw new NotFoundError('');
		}

		const passwordHash = await hashPassword(validPassword);

		await this.userRepository.update(userId, {
			password: passwordHash,
			resetPasswordToken: null,
			resetPasswordTokenExpiration: null,
		});

		logger.info('User password updated successfully', { userId });

		await issueCookie(res, user);

		void this.internalHooks.onUserUpdate({
			user,
			fields_changed: ['password'],
		});

		// if this user used to be an LDAP users
		const ldapIdentity = user?.authIdentities?.find((i) => i.providerType === 'ldap');
		if (ldapIdentity) {
			void this.internalHooks.onUserSignup(user, {
				user_type: 'email',
				was_disabled_ldap_user: true,
			});
		}

		await this.externalHooks.run('user.password.update', [user.email, passwordHash]);
	}
}
