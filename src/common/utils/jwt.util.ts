import { SignJWT, jwtVerify } from 'jose';

import { env } from '../../config/env.config.js';
import type { AccessTokenPayload } from '../interfaces/token-payload.interface.js';
import { UserRole } from '../enums/user-role.enum.js';

const textEncoder = new TextEncoder();
const issuer = env.SERVICE_NAME;
const audience = 'jesusname7-api';

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({
    typ: payload.type,
    email: payload.email,
    role: payload.role,
    sid: payload.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${env.AUTH_ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getAccessTokenSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getAccessTokenSecret(), {
    issuer,
    audience,
  });

  if (
    payload.typ !== 'access' ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.sid !== 'string' ||
    !isUserRole(payload.role)
  ) {
    throw new Error('Invalid access token payload.');
  }

  return {
    type: 'access',
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sid,
  };
}

function getAccessTokenSecret(): Uint8Array {
  return textEncoder.encode(env.JWT_ACCESS_TOKEN_SECRET);
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Object.values(UserRole).includes(value as UserRole);
}
