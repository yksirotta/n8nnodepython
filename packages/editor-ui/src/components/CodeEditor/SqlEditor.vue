<template>
	<div ref="sqlEditor" class="ph-no-capture sql-editor"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MSSQL, MySQL, PostgreSQL, sql, StandardSQL } from '@codemirror/lang-sql';
import type { SQLDialect } from 'n8n-workflow';
import { expressionInputHandler } from '@/plugins/codemirror/inputHandlers/expression.inputHandler';
import useEditor from './useEditor';

type SQLEditorProps = {
	value: string;
	dialect: SQLDialect;
	isReadOnly?: boolean;
	rows?: number;
};

const SQL_DIALECTS = {
	standard: StandardSQL,
	mssql: MSSQL,
	mysql: MySQL,
	postgres: PostgreSQL,
} as const;

const sqlEditor = ref<HTMLDivElement>();
const { value, dialect, isReadOnly, rows } = withDefaults(defineProps<SQLEditorProps>(), {
	isReadOnly: false,
	rows: 3,
});

const emit = defineEmits<{
	(event: 'valueChanged', value: string | undefined): void;
}>();

useEditor({
	container: sqlEditor,
	emit,
	value,
	isReadOnly,
	rows,
	extensions: {
		base: [
			sql({
				dialect: SQL_DIALECTS[dialect as SQLDialect] ?? SQL_DIALECTS.standard,
				upperCaseKeywords: true,
			}),
		],
		writable: [expressionInputHandler()],
	},
});
</script>

<script lang="ts">
import { defineComponent } from 'vue';
import { expressionManager } from '@/mixins/expressionManager';

export default defineComponent({ mixins: [expressionManager] });
</script>
