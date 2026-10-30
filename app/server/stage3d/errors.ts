/** a kit route's refusal: the status it sends, its sentence, and the plan validator's own errors when that is why */
export class KitError extends Error {
  readonly status: number
  readonly errors: string[]
  constructor(status: number, message: string, errors: string[] = []) { super(message); this.status = status; this.errors = errors }
}
