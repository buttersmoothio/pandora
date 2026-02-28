/** Shared types used across plugin hooks. */

export interface ToolPermissions {
  time?: boolean
  network?: string[]
  env?: string[]
  fs?: string[]
  random?: boolean
}

export interface ConfigFieldDescriptor {
  key: string
  label: string
  type: 'text' | 'number' | 'password' | 'enum'
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
}

export interface EnvVarDescriptor {
  name: string
  required?: boolean
  configured?: boolean
}

export interface Alert {
  level: 'info' | 'warning'
  message: string
}
