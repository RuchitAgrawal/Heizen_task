import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { SESSION_DAYS } from './auth.constants';
import { StaffController } from '../staff/staff.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 16) throw new Error('JWT_SECRET must be set (16+ chars)');
        return { secret, signOptions: { expiresIn: `${SESSION_DAYS}d` } };
      },
    }),
  ],
  controllers: [AuthController, StaffController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
