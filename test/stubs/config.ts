/**
 * Stands in for src/config.ts, which configure.js generates from its prompts
 * and .gitignore excludes. Host and port are mutable so a test can point the
 * backend at a throwaway local server on whatever port it was given.
 */
export const serverPort = 9979;
export let sigmaAirManagerHost = '127.0.0.1';
export let sigmaAirManagerPort = 0;
export const sigmaAirManagerUser = 'testuser';
export const sigmaAirManagerPassword = 'testpass';

export function pointAt(host: string, port: number) {
    sigmaAirManagerHost = host;
    sigmaAirManagerPort = port;
}
