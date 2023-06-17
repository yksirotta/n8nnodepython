import config from '@/config';
import { Service } from 'typedi';

@Service()
export class URLService {
	readonly baseUrl = this.generateBaseUrl();

	readonly webhookBaseUrl = this.generateWebhookBaseUrl();

	readonly instanceBaseUrl = this.generateInstanceBaseUrl();

	generateUserInviteUrl(inviterId: string, inviteeId: string): string {
		return `${this.instanceBaseUrl}/signup?inviterId=${inviterId}&inviteeId=${inviteeId}`;
	}

	/** Returns the base URL n8n is reachable from */
	private generateBaseUrl(): string {
		const protocol = config.getEnv('protocol');
		const host = config.getEnv('host');
		const port = config.getEnv('port');
		const path = config.getEnv('path');

		if ((protocol === 'http' && port === 80) || (protocol === 'https' && port === 443)) {
			return `${protocol}://${host}${path}`;
		}
		return `${protocol}://${host}:${port}${path}`;
	}

	/** Returns the base URL of the webhooks */
	private generateWebhookBaseUrl() {
		let urlBaseWebhook = this.baseUrl;

		// We renamed WEBHOOK_TUNNEL_URL to WEBHOOK_URL. This is here to maintain
		// backward compatibility. Will be deprecated and removed in the future.
		if (process.env.WEBHOOK_TUNNEL_URL !== undefined || process.env.WEBHOOK_URL !== undefined) {
			// @ts-ignore
			urlBaseWebhook = process.env.WEBHOOK_TUNNEL_URL ?? process.env.WEBHOOK_URL;
		}
		if (!urlBaseWebhook.endsWith('/')) {
			urlBaseWebhook += '/';
		}

		return urlBaseWebhook;
	}

	private generateInstanceBaseUrl(): string {
		const n8nBaseUrl = config.getEnv('editorBaseUrl') || this.generateWebhookBaseUrl();
		return n8nBaseUrl.endsWith('/') ? n8nBaseUrl.slice(0, n8nBaseUrl.length - 1) : n8nBaseUrl;
	}
}
