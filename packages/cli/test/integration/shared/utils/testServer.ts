import { Container } from 'typedi';
import cookieParser from 'cookie-parser';
import express from 'express';
import type superagent from 'superagent';
import request from 'supertest';
import { URL } from 'url';

import config from '@/config';
import { ExternalHooks } from '@/ExternalHooks';
import { ActiveWorkflowRunner } from '@/ActiveWorkflowRunner';
import { workflowsController } from '@/workflows/workflows.controller';
import { AUTH_COOKIE_NAME } from '@/constants';
import { credentialsController } from '@/credentials/credentials.controller';
import type { User } from '@db/entities/User';
import { loadPublicApiVersions } from '@/PublicApi/';
import { issueJWT } from '@/auth/jwt';
import { UserManagementMailer } from '@/UserManagement/email/UserManagementMailer';
import { licenseController } from '@/license/license.controller';
import { registerController } from '@/decorators';
import { rawBodyReader, bodyParser, setupAuthMiddlewares } from '@/middlewares';

import { InternalHooks } from '@/InternalHooks';
import { PostHogClient } from '@/posthog';
import { variablesController } from '@/environments/variables/variables.controller';
import { LdapManager } from '@/Ldap/LdapManager.ee';
import { handleLdapInit } from '@/Ldap/helpers';
import { License } from '@/License';

import * as testDb from '../../shared/testDb';
import { AUTHLESS_ENDPOINTS, PUBLIC_API_REST_PATH_SEGMENT, REST_PATH_SEGMENT } from '../constants';
import type { EndpointGroup, SetupProps, TestServer } from '../types';
import { mockInstance } from './mocking';
import { MfaService } from '@/Mfa/mfa.service';
import {
	SettingsRepository,
	SharedCredentialsRepository,
	SharedWorkflowRepository,
} from '@/databases/repositories';
import { JwtService } from '@/services/jwt.service';
import { RoleService } from '@/services/role.service';
import { UserService } from '@/services/user.service';
import { executionsController } from '@/executions/executions.controller';
import { Logger } from '@/Logger';

/**
 * Plugin to prefix a path segment into a request URL pathname.
 *
 * Example: http://127.0.0.1:62100/me/password → http://127.0.0.1:62100/rest/me/password
 */
function prefix(pathSegment: string) {
	return async function (request: superagent.SuperAgentRequest) {
		const url = new URL(request.url);

		// enforce consistency at call sites
		if (url.pathname[0] !== '/') {
			throw new Error('Pathname must start with a forward slash');
		}

		url.pathname = pathSegment + url.pathname;
		request.url = url.toString();
		return request;
	};
}

/**
 * Classify endpoint groups into `routerEndpoints` (newest, using `express.Router`),
 * and `functionEndpoints` (legacy, namespaced inside a function).
 */
const classifyEndpointGroups = (endpointGroups: EndpointGroup[]) => {
	const routerEndpoints: EndpointGroup[] = [];
	const functionEndpoints: EndpointGroup[] = [];

	const ROUTER_GROUP = [
		'credentials',
		'workflows',
		'publicApi',
		'license',
		'variables',
		'executions',
	];

	endpointGroups.forEach((group) =>
		(ROUTER_GROUP.includes(group) ? routerEndpoints : functionEndpoints).push(group),
	);

	return [routerEndpoints, functionEndpoints];
};

function createAgent(app: express.Application, options?: { auth: boolean; user: User }) {
	const agent = request.agent(app);
	void agent.use(prefix(REST_PATH_SEGMENT));
	if (options?.auth && options?.user) {
		const { token } = issueJWT(options.user);
		agent.jar.setCookie(`${AUTH_COOKIE_NAME}=${token}`);
	}
	return agent;
}

function publicApiAgent(
	app: express.Application,
	{ user, version = 1 }: { user: User; version?: number },
) {
	const agent = request.agent(app);
	void agent.use(prefix(`${PUBLIC_API_REST_PATH_SEGMENT}/v${version}`));
	if (user.apiKey) {
		void agent.set({ 'X-N8N-API-KEY': user.apiKey });
	}
	return agent;
}

export const setupTestServer = ({
	endpointGroups,
	applyAuth = true,
	enabledFeatures,
}: SetupProps): TestServer => {
	const app = express();
	app.use(rawBodyReader);
	app.use(cookieParser());

	// Mock all telemetry and logging
	mockInstance(Logger);
	mockInstance(InternalHooks);
	mockInstance(PostHogClient);

	const testServer: TestServer = {
		app,
		httpServer: app.listen(0),
		authAgentFor: (user: User) => createAgent(app, { auth: true, user }),
		authlessAgent: createAgent(app),
		publicApiAgentFor: (user) => publicApiAgent(app, { user }),
	};

	beforeAll(async () => {
		await testDb.init();

		config.set('userManagement.jwtSecret', 'My JWT secret');
		config.set('userManagement.isInstanceOwnerSetUp', true);

		if (enabledFeatures) {
			Container.get(License).isFeatureEnabled = (feature) => enabledFeatures.includes(feature);
		}

		const enablePublicAPI = endpointGroups?.includes('publicApi');
		if (applyAuth && !enablePublicAPI) {
			setupAuthMiddlewares(app, AUTHLESS_ENDPOINTS, REST_PATH_SEGMENT);
		}

		if (!endpointGroups) return;

		app.use(bodyParser);

		const [routerEndpoints, functionEndpoints] = classifyEndpointGroups(endpointGroups);

		if (routerEndpoints.length) {
			const map: Record<string, express.Router | express.Router[] | any> = {
				credentials: { controller: credentialsController, path: 'credentials' },
				workflows: { controller: workflowsController, path: 'workflows' },
				license: { controller: licenseController, path: 'license' },
				variables: { controller: variablesController, path: 'variables' },
				executions: { controller: executionsController, path: 'executions' },
			};

			if (enablePublicAPI) {
				const { apiRouters } = await loadPublicApiVersions(PUBLIC_API_REST_PATH_SEGMENT);
				map.publicApi = apiRouters;
			}

			for (const group of routerEndpoints) {
				if (group === 'publicApi') {
					app.use(...(map[group] as express.Router[]));
				} else {
					app.use(`/${REST_PATH_SEGMENT}/${map[group].path}`, map[group].controller);
				}
			}
		}

		if (functionEndpoints.length) {
			for (const group of functionEndpoints) {
				switch (group) {
					case 'metrics':
						const { MetricsService } = await import('@/services/metrics.service');
						await Container.get(MetricsService).configureMetrics(app);
						break;
					case 'eventBus':
						const { EventBusController } = await import('@/eventbus/eventBus.controller');
						registerController(app, config, new EventBusController());
						const { EventBusControllerEE } = await import('@/eventbus/eventBus.controller.ee');
						registerController(app, config, new EventBusControllerEE());
						break;
					case 'auth':
						const { AuthController } = await import('@/controllers/auth.controller');
						registerController(app, config, Container.get(AuthController));
						break;
					case 'mfa':
						const { MFAController } = await import('@/controllers/mfa.controller');
						registerController(app, config, Container.get(MFAController));
						break;
					case 'ldap':
						await handleLdapInit();
						const { service, sync } = LdapManager.getInstance();
						const { LdapController } = await import('@/controllers/ldap.controller');
						registerController(
							app,
							config,
							new LdapController(service, sync, Container.get(InternalHooks)),
						);
						break;
					case 'saml':
						const { setSamlLoginEnabled } = await import('@/sso/saml/samlHelpers');
						await setSamlLoginEnabled(true);
						const { SamlController } = await import('@/sso/saml/routes/saml.controller.ee');
						registerController(app, config, Container.get(SamlController));
						break;
					case 'sourceControl':
						const { SourceControlController } = await import(
							'@/environments/sourceControl/sourceControl.controller.ee'
						);
						registerController(app, config, Container.get(SourceControlController));
						break;
					case 'community-packages':
						const { CommunityPackagesController } = await import(
							'@/controllers/communityPackages.controller'
						);
						registerController(app, config, Container.get(CommunityPackagesController));
						break;
					case 'me':
						const { MeController } = await import('@/controllers/me.controller');
						registerController(app, config, Container.get(MeController));
						break;
					case 'passwordReset':
						const { PasswordResetController } = await import(
							'@/controllers/passwordReset.controller'
						);
						registerController(
							app,
							config,
							new PasswordResetController(
								Container.get(Logger),
								Container.get(ExternalHooks),
								Container.get(InternalHooks),
								Container.get(UserManagementMailer),
								Container.get(UserService),
								Container.get(JwtService),
								Container.get(MfaService),
							),
						);
						break;
					case 'owner':
						const { OwnerController } = await import('@/controllers/owner.controller');
						registerController(
							app,
							config,
							new OwnerController(
								config,
								Container.get(Logger),
								Container.get(InternalHooks),
								Container.get(SettingsRepository),
								Container.get(UserService),
							),
						);
						break;
					case 'users':
						const { UsersController } = await import('@/controllers/users.controller');
						registerController(
							app,
							config,
							new UsersController(
								config,
								Container.get(Logger),
								Container.get(ExternalHooks),
								Container.get(InternalHooks),
								Container.get(SharedCredentialsRepository),
								Container.get(SharedWorkflowRepository),
								Container.get(ActiveWorkflowRunner),
								Container.get(UserManagementMailer),
								Container.get(JwtService),
								Container.get(RoleService),
								Container.get(UserService),
							),
						);
						break;
					case 'tags':
						const { TagsController } = await import('@/controllers/tags.controller');
						registerController(app, config, Container.get(TagsController));
						break;
					case 'externalSecrets':
						const { ExternalSecretsController } = await import(
							'@/ExternalSecrets/ExternalSecrets.controller.ee'
						);
						registerController(app, config, Container.get(ExternalSecretsController));
						break;
					case 'workflowHistory':
						const { WorkflowHistoryController } = await import(
							'@/workflows/workflowHistory/workflowHistory.controller.ee'
						);
						registerController(app, config, Container.get(WorkflowHistoryController));
						break;
					case 'binaryData':
						const { BinaryDataController } = await import('@/controllers/binaryData.controller');
						registerController(app, config, Container.get(BinaryDataController));
						break;
				}
			}
		}
	});

	afterAll(async () => {
		await testDb.terminate();
		testServer.httpServer.close();
	});

	return testServer;
};
