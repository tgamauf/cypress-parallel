interface Config {
  workingDirectory: string;
  countRunners: number;
}
interface TestFiles {
  integrationTests: string[];
  componentTests?: string[];
}

export type {
  Config,
  TestFiles
}