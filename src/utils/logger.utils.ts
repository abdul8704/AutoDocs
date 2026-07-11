class Logger {
  info(message: string, ...args: unknown[]) {
    console.log(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }
}

export const logger = new Logger();