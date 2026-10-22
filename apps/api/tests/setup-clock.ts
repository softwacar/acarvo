// Optional test clock: ACARVO_TEST_NOW=<ISO instant> makes the process believe it is that moment (the clock keeps running from there).
// It exists to run the whole suite "on" other days (a DST week, a year end, a month end, around midnight) without waiting for them.
// Not set (the normal run): nothing changes. Only the JavaScript clock moves; PostgreSQL's now() stays real, so keep the offset within a few
// weeks of the real date (sessions and rate-limit windows compare against the database clock).

const target = process.env.ACARVO_TEST_NOW
if (target) {
  const at = Date.parse(target)
  if (Number.isNaN(at)) throw new Error(`ACARVO_TEST_NOW is not a valid instant: ${target}`)
  const RealDate = Date
  const offset = at - RealDate.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class ShiftedDate extends RealDate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super(...((args.length === 0 ? [RealDate.now() + offset] : args) as [any]))
    }
    static override now() {
      return RealDate.now() + offset
    }
  }
  globalThis.Date = ShiftedDate as unknown as DateConstructor
}
