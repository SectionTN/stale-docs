export function parseArgs(argv) {
  return { verbose: argv.includes('--verbose') };
}

export function runServer(port = DEFAULT_PORT) {
  return port;
}

export const DEFAULT_PORT = 8080;
