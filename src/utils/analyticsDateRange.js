import ApiError from "./ApiError.js";
import { DEFAULT_TIMEZONE, MAX_ANALYTICS_RANGE_DAYS } from "../constants/analyticsConstants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const isValidTimezone = (timezone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const localParts = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === "24" ? 0 : values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
};

const timezoneOffsetMs = (date, timezone) => {
  const parts = localParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
};

const zonedDateTimeToUtc = (dateText, timeText, timezone) => {
  const guess = new Date(`${dateText}T${timeText}.000Z`);
  if (Number.isNaN(guess.getTime())) throw new ApiError(400, "Invalid date range");
  const offset = timezoneOffsetMs(guess, timezone);
  return new Date(guess.getTime() - offset);
};

const dateKey = (date, timezone) => {
  const parts = localParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const addDaysKey = (key, days) => {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const startOfMonthKey = (date, timezone) => {
  const parts = localParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
};

const startOfQuarterKey = (date, timezone) => {
  const parts = localParts(date, timezone);
  const quarterMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
  return `${parts.year}-${String(quarterMonth).padStart(2, "0")}-01`;
};

const monthOffsetKey = (key, offset) => {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
};

const parseCustomKey = (value, field) => {
  if (!value) throw new ApiError(400, `${field} is required for a custom range`);
  const key = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(new Date(`${key}T00:00:00.000Z`).getTime())) {
    throw new ApiError(400, `${field} is invalid`);
  }
  return key;
};

const presetKeys = (preset, now, timezone, custom = {}) => {
  const today = dateKey(now, timezone);
  switch (preset) {
    case "today":
      return { startKey: today, endKey: today };
    case "yesterday": {
      const yesterday = addDaysKey(today, -1);
      return { startKey: yesterday, endKey: yesterday };
    }
    case "last-7-days":
      return { startKey: addDaysKey(today, -6), endKey: today };
    case "last-90-days":
      return { startKey: addDaysKey(today, -89), endKey: today };
    case "this-month":
      return { startKey: startOfMonthKey(now, timezone), endKey: today };
    case "last-month": {
      const thisMonth = startOfMonthKey(now, timezone);
      const lastMonth = monthOffsetKey(thisMonth, -1);
      return { startKey: lastMonth, endKey: addDaysKey(thisMonth, -1) };
    }
    case "this-quarter":
      return { startKey: startOfQuarterKey(now, timezone), endKey: today };
    case "this-year": {
      const parts = localParts(now, timezone);
      return { startKey: `${parts.year}-01-01`, endKey: today };
    }
    case "custom":
      return {
        startKey: parseCustomKey(custom.dateFrom, "dateFrom"),
        endKey: parseCustomKey(custom.dateTo, "dateTo")
      };
    case "last-30-days":
    default:
      return { startKey: addDaysKey(today, -29), endKey: today };
  }
};

export const parseAnalyticsDateRange = (query = {}, company = null) => {
  const timezone = query.timezone || company?.timezone || DEFAULT_TIMEZONE;
  if (!isValidTimezone(timezone)) throw new ApiError(400, "Invalid timezone");

  const preset = query.preset || "last-30-days";
  const { startKey, endKey } = presetKeys(preset, new Date(), timezone, query);
  const start = zonedDateTimeToUtc(startKey, "00:00:00", timezone);
  const end = zonedDateTimeToUtc(endKey, "23:59:59", timezone);

  if (start > end) throw new ApiError(400, "dateFrom must be before dateTo");
  const days = Math.ceil((end.getTime() - start.getTime() + 1) / DAY_MS);
  if (days > MAX_ANALYTICS_RANGE_DAYS) {
    throw new ApiError(400, `Date range cannot exceed ${MAX_ANALYTICS_RANGE_DAYS} days`);
  }

  const comparePrevious = query.comparePrevious === true || query.comparePrevious === "true";
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - (end.getTime() - start.getTime()));

  return {
    preset,
    timezone,
    start,
    end,
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
    startKey,
    endKey,
    days,
    comparePrevious,
    previous: comparePrevious
      ? {
          start: previousStart,
          end: previousEnd,
          dateFrom: previousStart.toISOString(),
          dateTo: previousEnd.toISOString()
        }
      : null
  };
};

export const comparisonMetric = (value = 0, previousValue = null) => {
  const current = Number(value || 0);
  if (previousValue === null || previousValue === undefined) {
    return { value: current, previousValue: null, change: null, changePercent: null, direction: "unavailable" };
  }
  const previous = Number(previousValue || 0);
  const change = current - previous;
  let changePercent = null;
  if (previous === 0) {
    changePercent = current === 0 ? 0 : 100;
  } else {
    changePercent = Math.round((change / previous) * 10000) / 100;
  }
  return {
    value: current,
    previousValue: previous,
    change,
    changePercent,
    direction: change > 0 ? "up" : change < 0 ? "down" : "unchanged"
  };
};
