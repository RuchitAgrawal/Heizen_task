import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { loginSchema, LoginInput, Me, isPermission } from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentUser, Public, SignedIn } from './decorators';
import type { AuthUser } from './auth.types';
import { SESSION_COOKIE, SESSION_DAYS } from './auth.constants';

/** Compared against when the email is unknown, so timing does not reveal which emails exist. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Res({ passthrough: true }) res: Response): Promise<Me> {
    const staff = await this.prisma.staffUser.findUnique({ where: { email: body.email }, include: { role: true } });
    const ok = await bcrypt.compare(body.password, staff?.passwordHash ?? DUMMY_HASH);
    if (!staff || !staff.active || !ok) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'BAD_CREDENTIALS', 'Email or password is wrong');
    }
    const token = await this.jwt.signAsync({ sub: staff.id });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 24 * 3600 * 1000,
      path: '/',
    });
    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: { id: staff.role.id, name: staff.role.name },
      permissions: staff.role.permissions.filter(isPermission),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @SignedIn()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: { id: user.roleId, name: user.roleName },
      permissions: [...user.permissions],
    };
  }
}
