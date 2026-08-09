import pino from "pino";
import { env } from "../config/env";

// ============================================================================
// Structured logging. Every pipeline step logs through here, so a whole run can
// be replayed from the terminal (dev) or grepped as JSON (prod).
//
// Convention: attach a `scope` and the ids that identify the run, then log a
// short message. `scope` is rendered as a [prefix] in dev so a run reads as a
// vertical timeline instead of a wall of JSON.
// ============================================================================

const isProd = env.NODE_ENV === "production";

export const logger = pino({
    level: env.LOG_LEVEL,

    // pid/hostname add nothing when the API and the workers share a process.
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,

    ...(isProd ? {} : {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "HH:MM:ss.l",

                // `scope` is rendered as the [prefix] instead of being repeated
                // in the payload; singleLine keeps one event on one line so a
                // run reads as a timeline rather than a stack of objects.
                ignore: "pid,hostname,scope",
                messageFormat: "{scope} {msg}",
                singleLine: true,
            },
        },
    }),
});

/**
 * A logger bound to one subsystem, and usually to one repo/job. Pass the same
 * bindings everywhere in a run and the JSON output is filterable by repo.
 */
export const scopedLogger = (
    scope: string,
    bindings: Record<string, unknown> = {},
) => logger.child({ scope: `[${scope}]`, ...bindings });

/**
 * Millisecond stopwatch for "…took 812ms" lines. Every stage of the pipeline
 * reports its own duration, which is what makes a slow run diagnosable.
 */
export const startTimer = () => {
    const startedAt = Date.now();
    return () => Date.now() - startedAt;
};

/** Keeps a one-line log from swallowing the terminal on big diffs/prompts. */
export const truncate = (text: string, max = 160): string =>
    text.length <= max ? text : `${text.slice(0, max)}…`;
