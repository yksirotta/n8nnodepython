import { Get, Post, RestController } from '@/decorators';
import { LicenseService } from '@/services/license.service';
import { IInternalHooksClass } from '@/Interfaces';
import type { ILicensePostResponse, ILicenseReadResponse } from '@/Interfaces';
import { LicenseRequest } from '@/requests';
import { BadRequestError } from '@/ResponseHelper';

@RestController('/license')
// TODO: add a @Authorized(['global', 'owner']) decorator
export class LicenseController {
	constructor(private licenseService: LicenseService, private internalHooks: IInternalHooksClass) {}

	@Get('/')
	async getLicense(): Promise<ILicenseReadResponse> {
		return this.licenseService.getLicenseData();
	}

	@Post('/activate')
	async activateLicense(req: LicenseRequest.Activate): Promise<ILicensePostResponse> {
		// Call the license manager activate function and tell it to throw an error
		try {
			await this.licenseService.activateLicense(req.body.activationKey);
		} catch (e) {
			const error = e as Error & { errorId?: string };

			switch (error.errorId ?? 'UNSPECIFIED') {
				case 'SCHEMA_VALIDATION':
					error.message = 'Activation key is in the wrong format';
					break;
				case 'RESERVATION_EXHAUSTED':
					error.message =
						'Activation key has been used too many times. Please contact sales@n8n.io if you would like to extend it';
					break;
				case 'RESERVATION_EXPIRED':
					error.message = 'Activation key has expired';
					break;
				case 'NOT_FOUND':
				case 'RESERVATION_CONFLICT':
					error.message = 'Activation key not found';
					break;
			}

			throw new BadRequestError((e as Error).message);
		}

		return this.getLicenseResponse();
	}

	@Post('/renew')
	async renewLicense(): Promise<ILicensePostResponse> {
		// Call the license manager activate function and tell it to throw an error
		try {
			await this.licenseService.renewLicense();
		} catch (e) {
			// not awaiting so as not to make the endpoint hang
			void this.internalHooks.onLicenseRenewAttempt({ success: false });
			if (e instanceof Error) {
				throw new BadRequestError(e.message);
			}
		}

		// not awaiting so as not to make the endpoint hang
		void this.internalHooks.onLicenseRenewAttempt({ success: true });
		return this.getLicenseResponse();
	}

	private async getLicenseResponse(): Promise<ILicensePostResponse> {
		// Return the read data, plus the management JWT
		return {
			managementToken: this.licenseService.getManagementToken(),
			...(await this.licenseService.getLicenseData()),
		};
	}
}
