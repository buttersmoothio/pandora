import {
  SearchIcon,
  ClockIcon,
  BrainIcon,
  BookOpenIcon,
  Trash2Icon,
  BotIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

export interface ToolDisplayInfo {
  label: string;
  icon: LucideIcon;
}

const toolMap: Record<string, ToolDisplayInfo> = {
  // Search tools (actual tools in this project)
  tavilySearch: { label: "Web Search", icon: SearchIcon },
  exaSearch: { label: "Web Search", icon: SearchIcon },
  perplexitySearch: { label: "Web Search", icon: SearchIcon },

  // Utility tools
  datetime: { label: "Date & Time", icon: ClockIcon },

  // Memory tools
  recall: { label: "Search Memory", icon: BrainIcon },
  remember: { label: "Remember", icon: BrainIcon },
  getMemory: { label: "Get Memory", icon: BookOpenIcon },
  forget: { label: "Forget", icon: Trash2Icon },
};

/**
 * Convert camelCase or snake_case to Title Case.
 */
function humanizeToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * Get display info (label, icon, color) for a tool by name.
 * Returns humanized defaults for unknown tools.
 */
export function getToolDisplayInfo(toolName: string): ToolDisplayInfo {
  // Check direct match first
  if (toolMap[toolName]) {
    return toolMap[toolName];
  }

  // Check if it's a subagent (contains "Agent" or "Subagent")
  if (toolName.toLowerCase().includes("agent")) {
    return {
      label: humanizeToolName(toolName.replace(/Subagent$/i, "").replace(/Agent$/i, "")),
      icon: BotIcon,
    };
  }

  // Default: humanize the name with wrench icon
  return {
    label: humanizeToolName(toolName),
    icon: WrenchIcon,
  };
}
