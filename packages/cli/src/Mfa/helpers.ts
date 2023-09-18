import { Container } from 'typedi';
import config from '@/config';
import { MFA_FEATURE_ENABLED } from './constants';
import { UserRepository } from '@/databases/repositories';

export const isMfaFeatureEnabled = () => config.get(MFA_FEATURE_ENABLED);

export const handleMfaDisable = async () => {
	if (!isMfaFeatureEnabled()) {
		// check for users with MFA enabled, and if there are
		// users, then keep the feature enabled
		const count = await Container.get(UserRepository).countUsersWithMFA();
		if (count > 0) {
			config.set(MFA_FEATURE_ENABLED, true);
		}
	}
};
