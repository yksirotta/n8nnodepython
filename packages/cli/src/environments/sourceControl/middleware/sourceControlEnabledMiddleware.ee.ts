import type { RequestHandler } from 'express';
import { Container } from 'typedi';

import { License } from '@/License';
import { SourceControlPreferencesService } from '../sourceControlPreferences.service.ee';

export const sourceControlLicensedAndEnabledMiddleware: RequestHandler = (req, res, next) => {
	const preferencesService = Container.get(SourceControlPreferencesService);
	if (preferencesService.isSourceControlLicensedAndEnabled()) {
		next();
	} else {
		if (!preferencesService.isSourceControlConnected()) {
			res.status(412).json({
				status: 'error',
				message: 'source_control_not_connected',
			});
		} else {
			res.status(401).json({ status: 'error', message: 'Unauthorized' });
		}
	}
};

export const sourceControlLicensedMiddleware: RequestHandler = (req, res, next) => {
	if (Container.get(License).isSourceControlLicensed()) {
		next();
	} else {
		res.status(401).json({ status: 'error', message: 'Unauthorized' });
	}
};
