import humanId from 'human-id';
import type { N8nInstanceType } from '@/Interfaces';

export const generateId = () => humanId({ capitalize: false, separator: '-', adjectiveCount: 2 });

export function generateHostInstanceId(instanceType: N8nInstanceType) {
	return `${instanceType}-${generateId()}`;
}
