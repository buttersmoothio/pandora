import {
  SearchIcon,
  GlobeIcon,
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  DatabaseIcon,
  BotIcon,
  WrenchIcon,
  CalculatorIcon,
  MailIcon,
  CalendarIcon,
  type LucideIcon,
} from "lucide-react";

export interface ToolDisplayInfo {
  label: string;
  icon: LucideIcon;
  color: string;
}

const toolMap: Record<string, ToolDisplayInfo> = {
  // Search tools
  webSearchNative: { label: "Web Search", icon: SearchIcon, color: "text-blue-500" },
  webSearch: { label: "Web Search", icon: GlobeIcon, color: "text-blue-500" },
  searchWeb: { label: "Web Search", icon: SearchIcon, color: "text-blue-500" },

  // Code tools
  executeCode: { label: "Run Code", icon: CodeIcon, color: "text-green-500" },
  codeInterpreter: { label: "Code Interpreter", icon: CodeIcon, color: "text-green-500" },
  runCode: { label: "Run Code", icon: CodeIcon, color: "text-green-500" },

  // File tools
  readFile: { label: "Read File", icon: FileTextIcon, color: "text-amber-500" },
  writeFile: { label: "Write File", icon: FileTextIcon, color: "text-amber-500" },
  listFiles: { label: "List Files", icon: FileTextIcon, color: "text-amber-500" },

  // Image tools
  generateImage: { label: "Generate Image", icon: ImageIcon, color: "text-purple-500" },
  analyzeImage: { label: "Analyze Image", icon: ImageIcon, color: "text-purple-500" },

  // Database tools
  queryDatabase: { label: "Query Database", icon: DatabaseIcon, color: "text-orange-500" },
  sqlQuery: { label: "SQL Query", icon: DatabaseIcon, color: "text-orange-500" },

  // Math/calculation
  calculator: { label: "Calculator", icon: CalculatorIcon, color: "text-cyan-500" },
  compute: { label: "Compute", icon: CalculatorIcon, color: "text-cyan-500" },

  // Communication
  sendEmail: { label: "Send Email", icon: MailIcon, color: "text-red-500" },
  email: { label: "Email", icon: MailIcon, color: "text-red-500" },

  // Calendar
  checkCalendar: { label: "Check Calendar", icon: CalendarIcon, color: "text-teal-500" },
  calendar: { label: "Calendar", icon: CalendarIcon, color: "text-teal-500" },
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
