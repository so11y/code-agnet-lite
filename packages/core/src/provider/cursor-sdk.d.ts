declare module '@cursor/sdk' {
  export const Agent: {
    create(options: {
      apiKey: string;
      model: {id: string};
      local: {cwd: string};
    }): Promise<{
      send(prompt: string): Promise<{
        stream(): AsyncIterable<unknown>;
        wait(): Promise<{status: string; result?: string; id?: string}>;
      }>;
      [Symbol.asyncDispose](): Promise<void>;
    }>;
  };
}
