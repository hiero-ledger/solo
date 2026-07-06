// SPDX-License-Identifier: Apache-2.0

/**
 * Composed command paths for one-shot falcon commands.
 *
 * These live in a separate file to break the circular import between
 * OneShotCommandDefinition (which imports DefaultOneShotCommand for DI metadata)
 * and DefaultOneShotCommand (which needs these paths for user-facing output).
 */
export const FALCON_PREPARE_COMMAND: string = 'one-shot falcon prepare';
export const FALCON_DEPLOY_COMMAND: string = 'one-shot falcon deploy';
export const SINGLE_DESTROY_COMMAND: string = 'one-shot single destroy';
