'use client'

import type { ConfigFieldDescriptor } from '@pandorakit/react-sdk'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ConfigField({
  field,
  scopeId,
  value,
  onChange,
}: {
  field: ConfigFieldDescriptor
  scopeId: string
  value: unknown
  onChange: (value: unknown) => void
}): React.JSX.Element {
  const id = `${scopeId}-${field.key}`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === 'enum' ? (
        <Select value={(value as string) ?? ''} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={field.placeholder ?? 'Select\u2026'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.type}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>): void => onChange(e.target.value)}
        />
      )}
      {field.description && <p className="text-muted-foreground text-sm">{field.description}</p>}
    </div>
  )
}
