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
  color: string;
}

const toolMap: Record<string, ToolDisplayInfo> = {
  // Search tools (actual tools in this project)
  tavilySearch: { label: "Web Search", icon: SearchIcon, color: "text-blue-500" },
  exaSearch: { label: "Web Search", icon: SearchIcon, color: "text-blue-500" },
  perplexitySearch: { label: "Web Search", icon: SearchIcon, color: "text-blue-500" },

  // Utility tools
  datetime: { label: "Date & Time", icon: ClockIcon, color: "text-cyan-500" },

  // Memory tools
  recall: { label: "Recall Memory", icon: BrainIcon, color: "text-pink-500" },
  remember: { label: "Remember", icon: BrainIcon, color: "text-pink-500" },
  getMemory: { label: "Get Memory", icon: BookOpenIcon, color: "text-pink-500" },
  forget: { label: "Forget", icon: Trash2Icon, color: "text-pink-500" },
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
      color: "text-violet-500",
    };
  }

  // Default: humanize the name with wrench icon
  return {
    label: humanizeToolName(toolName),
    icon: WrenchIcon,
    color: "text-muted-foreground",
  };
}
