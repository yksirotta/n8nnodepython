import { Container, Service } from 'typedi';
import { Get, Post, RestController } from '@/decorators';
import { Logger } from '@/Logger';
import { License } from '@/License';
import { LicenseRequest } from '@/requests';
import { InternalHooks } from '@/InternalHooks';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

@Service()
@RestController('/license')
export class LicenseController {
	constructor(
		private readonly license: License,
		private readonly internalHooks: InternalHooks,
	) {}

	@Get('/')
	async getLicenseData() {
		return this.license.getLicenseData();
	}

	@Post('/activate')
	// TODO: add RequireGlobalScope('license:activate')
	async activateLicense(req: LicenseRequest.Activate) {
		try {
			await this.license.activate(req.body.activationKey);
		} catch (e) {
			const error = e as Error & { errorId?: string };

			let message = 'Failed to activate license';

			//override specific error messages (to map License Server vocabulary to n8n terms)
			switch (error.errorId ?? 'UNSPECIFIED') {
				case 'SCHEMA_VALIDATION':
					message = 'Activation key is in the wrong format';
					break;
				case 'RESERVATION_EXHAUSTED':
					message =
						'Activation key has been used too many times. Please contact sales@n8n.io if you would like to extend it';
					break;
				case 'RESERVATION_EXPIRED':
					message = 'Activation key has expired';
					break;
				case 'NOT_FOUND':
				case 'RESERVATION_CONFLICT':
					message = 'Activation key not found';
					break;
				case 'RESERVATION_DUPLICATE':
					message = 'Activation key has already been used on this instance';
					break;
				default:
					message += `: ${error.message}`;
					Container.get(Logger).error(message, { stack: error.stack ?? 'n/a' });
			}

			throw new BadRequestError(message);
		}

		// Return the read data, plus the management JWT
		return {
			managementToken: this.license.getManagementJwt(),
			...(await this.license.getLicenseData()),
		};
	}

	@Post('/renew')
	// TODO: add RequireGlobalScope('license:renew')
	async renewLicense() {
		try {
			await this.license.renew();
		} catch (e) {
			const error = e as Error & { errorId?: string };

			// not awaiting so as not to make the endpoint hang
			void this.internalHooks.onLicenseRenewAttempt({ success: false });
			if (error instanceof Error) {
				throw new BadRequestError(error.message);
			}
		}

		// not awaiting so as not to make the endpoint hang
		void this.internalHooks.onLicenseRenewAttempt({ success: true });

		// Return the read data, plus the management JWT
		return {
			managementToken: this.license.getManagementJwt(),
			...(await this.license.getLicenseData()),
		};
	}
}
