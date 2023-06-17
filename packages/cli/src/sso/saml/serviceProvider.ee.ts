/* eslint-disable @typescript-eslint/naming-convention */
import type { ServiceProviderInstance } from 'samlify';
import { ServiceProvider } from 'samlify';
import { Container } from 'typedi';
import { SamlUrls } from './constants';
import type { SamlPreferences } from './types/samlPreferences';
import { URLService } from '@/services/url.service';

let serviceProviderInstance: ServiceProviderInstance | undefined;

export function getServiceProviderEntityId(): string {
	return Container.get(URLService).instanceBaseUrl + SamlUrls.restMetadata;
}

export function getServiceProviderReturnUrl(): string {
	return Container.get(URLService).instanceBaseUrl + SamlUrls.restAcs;
}

export function getServiceProviderConfigTestReturnUrl(): string {
	return Container.get(URLService).instanceBaseUrl + SamlUrls.configTestReturn;
}

// TODO:SAML: make these configurable for the end user
export function getServiceProviderInstance(prefs: SamlPreferences): ServiceProviderInstance {
	if (serviceProviderInstance === undefined) {
		serviceProviderInstance = ServiceProvider({
			entityID: getServiceProviderEntityId(),
			authnRequestsSigned: prefs.authnRequestsSigned,
			wantAssertionsSigned: prefs.wantAssertionsSigned,
			wantMessageSigned: prefs.wantMessageSigned,
			signatureConfig: prefs.signatureConfig,
			relayState: prefs.relayState,
			nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
			assertionConsumerService: [
				{
					isDefault: prefs.acsBinding === 'post',
					Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
					Location: getServiceProviderReturnUrl(),
				},
				{
					isDefault: prefs.acsBinding === 'redirect',
					Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-REDIRECT',
					Location: getServiceProviderReturnUrl(),
				},
			],
		});
	}

	return serviceProviderInstance;
}
