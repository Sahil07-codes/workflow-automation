import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@autoapply/shared';
import { Request } from 'express';

function accessTokenFromRequest(request: Request): string | null {
  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
  if (bearerToken) return bearerToken;

  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('autoapply_access='));
  return cookie ? cookie.slice('autoapply_access='.length) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: accessTokenFromRequest,
      ignoreExpiration: false,
      // Must be the PUBLIC key, verified with RS256, matching how
      // auth.module.ts signs tokens with the PRIVATE key. Using the same
      // secret on both sides (or mismatched HS256 secrets) was the bug —
      // this now correctly pairs with the asymmetric key pair in .env.
      secretOrKey: configService
        .getOrThrow<string>('jwt_public_key')
        .replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sid,
    };
  }
}
