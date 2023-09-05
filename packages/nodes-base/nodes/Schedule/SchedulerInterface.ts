export namespace RecurrenceRule {
	export interface NonActive {
		activated: false;
	}

	export interface Activated {
		activated: true;
		index: number;
		intervalSize: number;
		typeInterval: 'hours' | 'days' | 'weeks' | 'months';
	}

	export type Rule = NonActive | Activated;
}
