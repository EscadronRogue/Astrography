import { readStorageItem } from './storageUtils.js';

function isDebugLoggingEnabled() {
  return Boolean(readStorageItem('astrography-debug'));
}

const DEBUG_LOGGING_ENABLED = isDebugLoggingEnabled();

function callConsole(method, args) {
  const logger = globalThis.console;
  if (!logger?.[method]) return;
  logger[method](...args);
}

export function logDebug(...args) {
  if (DEBUG_LOGGING_ENABLED) callConsole('debug', args);
}

export function logInfo(...args) {
  if (DEBUG_LOGGING_ENABLED) callConsole('info', args);
}

export function logWarn(...args) {
  callConsole('warn', args);
}

export function logError(...args) {
  callConsole('error', args);
}
