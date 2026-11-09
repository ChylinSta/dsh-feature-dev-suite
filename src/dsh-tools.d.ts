declare module "@deepseek-ai/dsh-tools" {
  export interface ToolExec {
    agent?: unknown;
    signal?: AbortSignal;
  }

  export interface ToolDef<TArgs, TResult> {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
      schema: { type: string };
      render: (args: TArgs, value: TResult) => { type: string; text: string }[];
    };
    execute: (args: TArgs, exec: ToolExec) => Promise<TResult> | TResult;
  }

  export function defineTool<TArgs, TResult>(tool: ToolDef<TArgs, TResult>): ToolDef<TArgs, TResult>;
}
