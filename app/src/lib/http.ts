import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function notFound(message = "not_found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(err: unknown) {
  // eslint-disable-next-line no-console
  console.error("[api] unhandled", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await req.json().catch(() => undefined);
  if (body === undefined) throw new HttpError(400, "invalid_json");
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, "validation_error", r.error.flatten());
  return r.data;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function handleError(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "validation_error", details: err.flatten() }, { status: 400 });
  }
  return serverError(err);
}
