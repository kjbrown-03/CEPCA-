import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PipeTransform,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

/** Erreur métier : code stable (lu par les clients) + message affichable en français. */
export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message: string, public readonly fields?: Record<string, string>) {
    super({ code, message, fields }, status)
  }
}

export const NotFound = (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable`)
export const Forbidden = (message = "Vous n'avez pas les droits pour cette action") => new AppError(403, 'FORBIDDEN', message)
export const BadRequest = (code: string, message: string) => new AppError(400, code, message)
export const Conflict = (code: string, message: string) => new AppError(409, code, message)

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    if (!fields[key]) fields[key] = issue.code === 'unrecognized_keys' ? 'Champ non autorisé' : issue.message
  }
  return fields
}

/** Validation stricte par schéma zod (les objets stricts refusent les champs inconnus). */
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value)
    if (!r.success) throw new AppError(400, 'VALIDATION', 'Certaines informations sont invalides', zodFields(r.error))
    return r.data
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Erreur')
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ code: 'RATE_LIMITED', message: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' })
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json(body)
      const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? 'Erreur')
      const code = status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'HTTP_' + status
      return res.status(status).json({ code, message: Array.isArray(message) ? message.join(', ') : message })
    }
    // Erreur imprévue : on journalise côté serveur, on ne divulgue rien au client.
    this.log.error(exception instanceof Error ? exception.stack : String(exception))
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'INTERNAL', message: 'Une erreur est survenue. Réessayez dans un instant.' })
  }
}

export const IS_PUBLIC = 'isPublic'
/** Route accessible sans compte. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
export const OPTIONAL_AUTH = 'optionalAuth'
/** Route publique qui se rattache au compte si un jeton valide est présent (jamais de 401). */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true)

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>()
  return req.ip ?? null
})
