import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AppError, IS_PUBLIC, OPTIONAL_AUTH } from '../common/http'
import { AccessService, type Principal } from '../access/access.service'
import { TokensService } from './tokens.service'

export const ACCESS_COOKIE = 'cepca_at'
export const REFRESH_COOKIE = 'cepca_rt'

declare module 'express' {
  interface Request {
    principal?: Principal
  }
}

function extractToken(req: Request): string | null {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) return h.slice(7)
  const c = (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE]
  return c || null
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets)
    const req = ctx.switchToHttp().getRequest<Request>()
    if (isPublic && !optional) return true

    const raw = extractToken(req)
    const payload = raw ? this.tokens.verifyAccess(raw) : null
    if (!payload) {
      // Un jeton périmé sur une route publique = visiteur anonyme, jamais 401
      if (optional) return true
      throw new AppError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.')
    }
    const principal = await this.access.loadPrincipal(payload.sub)
    if (!principal) {
      if (optional) return true
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu. Contactez votre paroisse.')
    }
    req.principal = principal
    return true
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<Request>()
  if (!req.principal) throw new AppError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.')
  return req.principal
})

export const MaybeUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal | null => {
  return ctx.switchToHttp().getRequest<Request>().principal ?? null
})
