/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Transporter } from 'nodemailer';
import { createTransport } from 'nodemailer';
import { ErrorReporterProxy as ErrorReporter, LoggerProxy as Logger } from 'n8n-workflow';
import type { MailData, SendEmailResult } from './Interfaces';
import type SMTPConnection from 'nodemailer/lib/smtp-connection';

interface SMTPConfig {
	host: string;
	port: number;
	secure: boolean;
	auth: {
		user?: string;
		pass?: string;
		serviceClient?: string;
		privateKey?: string;
	};
	sender: string;
}

export class NodeMailer {
	private sender: string;

	private transport: Transporter;

	constructor({ host, port, secure, auth, sender }: SMTPConfig) {
		if (!sender && auth?.user?.includes('@')) {
			sender = auth.user;
		}
		this.sender = sender;

		const transportConfig: SMTPConnection.Options = { host, port, secure };
		const { user, pass, serviceClient, privateKey } = auth;
		if (user && pass) {
			transportConfig.auth = { user, pass };
		} else if (user && serviceClient && privateKey) {
			transportConfig.auth = {
				type: 'OAuth2',
				user,
				serviceClient,
				privateKey: privateKey.replace(/\\n/g, '\n'),
			};
		} else {
			Logger.warn('No Auth setup for SMTP');
		}
		this.transport = createTransport(transportConfig);
	}

	async verifyConnection(): Promise<void> {
		await this.transport.verify();
	}

	async sendMail(mailData: MailData): Promise<SendEmailResult> {
		try {
			await this.transport.sendMail({
				from: this.sender,
				to: mailData.emailRecipients,
				subject: mailData.subject,
				text: mailData.textOnly,
				html: mailData.body,
			});
			Logger.verbose(
				`Email sent successfully to the following recipients: ${mailData.emailRecipients.toString()}`,
			);
		} catch (error) {
			ErrorReporter.error(error);
			Logger.error('Failed to send email', { recipients: mailData.emailRecipients, error });
			throw error;
		}

		return { emailSent: true };
	}
}
