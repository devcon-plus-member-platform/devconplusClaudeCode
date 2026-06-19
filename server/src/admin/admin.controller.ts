import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { AdminService } from './admin.service';
import { InviteOfficerDto } from './dto/invite-officer.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('hq_admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  /** GET /api/admin/users — hq_admin+: all profiles */
  @Get('users')
  getUsers() {
    return this.service.getUsers();
  }

  /** GET /api/admin/users/:id/transactions — hq_admin+: recent point tx for a user */
  @Get('users/:id/transactions')
  getUserTransactions(@Param() { id }: IdParamDto) {
    return this.service.getUserTransactions(id);
  }

  /** PATCH /api/admin/users/:id/role — hq_admin+: admin_update_user_role RPC */
  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  updateUserRole(@Param() { id }: IdParamDto, @Body() dto: UpdateRoleDto) {
    return this.service.updateUserRole(id, dto.role);
  }

  /** GET /api/admin/analytics — hq_admin+: all 5 analytics RPCs + member/event counts */
  @Get('analytics')
  getAnalytics() {
    return this.service.getAnalytics();
  }

  /** POST /api/admin/officers/invite — hq_admin+: email an officer-assignment invite */
  @Post('officers/invite')
  @HttpCode(HttpStatus.OK)
  inviteOfficer(
    @Body() dto: InviteOfficerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.inviteOfficer(dto.email, dto.chapter_id, user.profile.full_name);
  }
}
