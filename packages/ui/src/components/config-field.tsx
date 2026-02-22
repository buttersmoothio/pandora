'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ConfigFieldDescriptor } from '@/hooks/use-channels'

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
}) {
  const id = `${scopeId}-${field.key}`

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === 'enum' ? (
        <Select value={(value as string) ?? ''} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-8 w-full text-sm">
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
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      )}
      {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
    </div>
  )
}
