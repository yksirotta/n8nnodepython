/* eslint-disable @typescript-eslint/naming-convention */
import * as config from '../../config';
import { BooleanPath } from '../../config/types';

const noop = () => {};
const noopAsync = async () => {};
const AsyncFunction = noopAsync.constructor;

export const EnabledOn =
	(key: BooleanPath): ClassDecorator =>
	// eslint-disable-next-line @typescript-eslint/ban-types
	(target: Function) => {
		if (!config.getEnv(key)) {
			const descriptors = Object.getOwnPropertyDescriptors(target.prototype);
			// eslint-disable-next-line no-restricted-syntax, guard-for-in
			for (const propName in descriptors) {
				if (propName !== 'constructor') {
					const descriptor = descriptors[propName];
					const method: unknown = descriptor.value;
					if (method instanceof AsyncFunction) descriptor.value = noopAsync;
					else if (method instanceof Function) descriptor.value = noop;
					Object.defineProperty(target.prototype, propName, descriptor);
				}
			}
		}
	};
