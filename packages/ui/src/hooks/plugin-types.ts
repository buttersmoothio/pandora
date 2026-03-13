/** Shared types used across plugin hooks — re-exported from SDK. */

export type { Alert, ConfigFieldDescriptor, ToolPermissions } from '@pandorakit/sdk/api'

import type { EnvVarDescriptor as BaseEnvVarDescriptor } from '@pandorakit/sdk/api'

/** EnvVarDescriptor with server-side `configured` status. */
export type EnvVarDescriptor = BaseEnvVarDescriptor & { configured?: boolean }
