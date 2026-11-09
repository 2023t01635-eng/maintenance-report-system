import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { runAlertScheduler } from "./alerts.service.js";

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zonedDateTimeToUtc(parts: Omit<ZonedParts, "minute" | "second">, timeZone: string) {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour));
  const rendered = zonedParts(guess, timeZone);
  const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
  return new Date(guess.getTime() - (renderedAsUtc - guess.getTime()));
}

export function millisecondsUntilNextRun(now = new Date()) {
  const current = zonedParts(now, env.ALERT_SCHEDULER_TIMEZONE);
  let target = zonedDateTimeToUtc(
    { year: current.year, month: current.month, day: current.day, hour: env.ALERT_SCHEDULER_HOUR },
    env.ALERT_SCHEDULER_TIMEZONE
  );
  if (target <= now) {
    const nextCalendarDay = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
    target = zonedDateTimeToUtc({
      year: nextCalendarDay.getUTCFullYear(),
      month: nextCalendarDay.getUTCMonth() + 1,
      day: nextCalendarDay.getUTCDate(),
      hour: env.ALERT_SCHEDULER_HOUR
    }, env.ALERT_SCHEDULER_TIMEZONE);
  }
  return target.getTime() - now.getTime();
}

export function startAlertScheduler() {
  let timer: NodeJS.Timeout | undefined;
  let activeRun: Promise<void> | undefined;
  let stopped = false;

  const run = () => {
    const task = runAlertScheduler()
      .then((result) => logger.info({ result }, "Alert scheduler completed"))
      .catch((error) => logger.error({ error }, "Alert scheduler failed"))
      .then(() => undefined);
    activeRun = task;
    void task.finally(() => {
      if (activeRun === task) activeRun = undefined;
    });
    return task;
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await run();
      schedule();
    }, millisecondsUntilNextRun());
    timer.unref();
  };

  void run();
  schedule();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await activeRun;
    }
  };
}

