import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { RateLimit } from '../common/throttler/rate-limit.decorator';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { DoorActionDto } from './dto/door-action.dto';
import { GenerateRegistrationTokenDto } from './dto/generate-registration-token.dto';
import { ScanQrDto } from './dto/scan-qr.dto';
import { QrService } from './qr.service';

@Controller('qr')
@UseGuards(AuthGuard)
export class QrController {
  constructor(private readonly service: QrService) {}

  // ── Member: generate tokens ───────────────────────────────────────────────

  /** POST /api/qr/registration-token — approved registration → k='r' QR token */
  @Post('registration-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('qr_generate')
  generateRegistrationToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateRegistrationTokenDto,
  ) {
    return this.service.generateRegistrationToken(user, dto.registrationId);
  }

  /** POST /api/qr/user-token — caller identity → k='u' QR token (kiosk walk-in) */
  @Post('user-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('qr_generate')
  generateUserToken(@CurrentUser() user: AuthenticatedUser) {
    return this.service.generateUserToken(user);
  }

  /** POST /api/qr/pending-token — pending registration → k='p' QR token */
  @Post('pending-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('qr_generate')
  generatePendingToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateRegistrationTokenDto,
  ) {
    return this.service.generatePendingToken(user, dto.registrationId);
  }

  // ── Organizer: scan + door ────────────────────────────────────────────────

  /** POST /api/qr/scan — verify QR token + award points atomically */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles('chapter_officer')
  @RateLimit('qr_scan')
  processScan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanQrDto) {
    return this.service.processScan(user, dto.token);
  }

  /** POST /api/qr/door-action — approve or reject a pending registration at the door */
  @Post('door-action')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles('chapter_officer')
  @RateLimit('qr_scan')
  processDoorAction(@CurrentUser() user: AuthenticatedUser, @Body() dto: DoorActionDto) {
    return this.service.processDoorAction(user, dto.registrationId, dto.action);
  }
}
