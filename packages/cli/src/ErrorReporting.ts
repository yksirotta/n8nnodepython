import { createHash } from 'crypto';
import config from '@/config';
import { ErrorReporterProxy, NodeError } from 'n8n-workflow';

let initialized = false;

export const initErrorHandling = async () => {
	if (initialized) return;

	// if (!config.getEnv('diagnostics.enabled')) {
	// 	initialized = true;
	// 	return;
	// }

	// Collect longer stacktraces
	Error.stackTraceLimit = 50;

	const dsn = config.getEnv('diagnostics.config.sentry.dsn');
	const { N8N_VERSION: release, ENVIRONMENT: environment } = process.env;

	const { init, captureException, addGlobalEventProcessor, Integrations } = await import(
		'@sentry/node'
	);
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const { RewriteFrames } = await import('@sentry/integrations');
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const { ProfilingIntegration } = await import('@sentry/profiling-node');

	init({
		dsn,
		release,
		environment,
		tracesSampleRate: 1.0,
		profilesSampleRate: 1.0,
		integrations: (integrations) => {
			integrations = integrations.filter(({ name }) => name !== 'OnUncaughtException');
			integrations.push(
				new Integrations.Express(),
				new RewriteFrames({ root: process.cwd() }),
				new ProfilingIntegration(),
			);
			return integrations;
		},
	});

	const seenErrors = new Set<string>();
	addGlobalEventProcessor((event, { originalException }) => {
		if (originalException instanceof NodeError && originalException.severity === 'warning')
			return null;
		if (event.exception) {
			const eventHash = createHash('sha1').update(JSON.stringify(event.exception)).digest('base64');
			if (seenErrors.has(eventHash)) return null;
			seenErrors.add(eventHash);
		}
		return event;
	});

	process.on('uncaughtException', (error) => {
		ErrorReporterProxy.error(error);
		if (error.constructor?.name !== 'AxiosError') throw error;
	});

	ErrorReporterProxy.init({
		report: (error, options) => captureException(error, options),
	});

	initialized = true;
};
