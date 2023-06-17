import { mock } from 'jest-mock-extended';
import type { ICredentialTypes, ILogger } from 'n8n-workflow';
import { LoggerProxy } from 'n8n-workflow';

import config from '@/config';
import type { TranslationRequest } from '@/controllers/translation.controller';
import {
	TranslationController,
	CREDENTIAL_TRANSLATIONS_DIR,
} from '@/controllers/translation.controller';
import { BadRequestError } from '@/ResponseHelper';

describe('TranslationController', () => {
	const credentialTypes = mock<ICredentialTypes>();
	const controller = new TranslationController(credentialTypes);

	LoggerProxy.init(mock<ILogger>());

	describe('getCredentialTranslation', () => {
		it('should throw 400 on invalid credential types', async () => {
			const credentialType = 'not-a-valid-credential-type';
			const req = mock<TranslationRequest.Credential>({ query: { credentialType } });
			credentialTypes.recognizes.calledWith(credentialType).mockReturnValue(false);

			await expect(controller.getCredentialTranslation(req)).rejects.toThrowError(
				new BadRequestError(`Invalid Credential type: "${credentialType}"`),
			);
		});

		it('should return translation json on valid credential types', async () => {
			const credentialType = 'credential-type';
			const req = mock<TranslationRequest.Credential>({ query: { credentialType } });
			config.set('defaultLocale', 'de');
			credentialTypes.recognizes.calledWith(credentialType).mockReturnValue(true);
			const response = { translation: 'string' };
			jest.mock(`${CREDENTIAL_TRANSLATIONS_DIR}/de/credential-type.json`, () => response, {
				virtual: true,
			});

			expect(await controller.getCredentialTranslation(req)).toEqual(response);
		});
	});
});
