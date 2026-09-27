type TimingFields = Record<string, string | number | boolean | null>;

/** One JSON line per step so CloudWatch can be filtered on `"timing"`. */
export function logTiming(step: string, startedAt: number, fields: TimingFields = {}): void {
  console.log(
    JSON.stringify({
      timing: step,
      ms: Date.now() - startedAt,
      fn: process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'local',
      ...fields,
    }),
  );
}
