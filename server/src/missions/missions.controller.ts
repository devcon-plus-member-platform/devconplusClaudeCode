import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateMissionDto } from './dto/create-mission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { SubmitMissionDto } from './dto/submit-mission.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionsService } from './missions.service';

@Controller('missions')
@UseGuards(AuthGuard)
export class MissionsController {
  constructor(private readonly service: MissionsService) {}

  // ── Static admin routes (must precede /:id) ───────────────────────────────

  /** GET /api/missions/admin — hq_admin: all missions including inactive */
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getAllMissions() {
    return this.service.getAllMissions();
  }

  /** GET /api/missions/queue — hq_admin: pending submissions with profile+mission join */
  @Get('queue')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getPendingQueue() {
    return this.service.getPendingQueue();
  }

  /** GET /api/missions/submissions — hq_admin: all submissions across all statuses */
  @Get('submissions')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getAllSubmissions() {
    return this.service.getAllSubmissionsAdmin();
  }

  /** POST /api/missions/submissions/:id/approve — hq_admin: approve_mission_winner RPC */
  @Post('submissions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  approveMissionWinner(@Param() { id }: IdParamDto) {
    return this.service.approveMissionWinner(id);
  }

  /** POST /api/missions/submissions/:id/reject — hq_admin: reject with admin remarks */
  @Post('submissions/:id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  rejectSubmission(@Param() { id }: IdParamDto, @Body() { adminRemarks }: RejectSubmissionDto) {
    return this.service.rejectSubmission(id, adminRemarks);
  }

  // ── Member: consolidated data ─────────────────────────────────────────────

  /** GET /api/missions — active missions + caller's participants + submissions */
  @Get()
  getMemberData(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMemberData(user);
  }

  // ── Admin: mission CRUD ───────────────────────────────────────────────────

  /** POST /api/missions — hq_admin: create a mission */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  createMission(@Body() dto: CreateMissionDto) {
    return this.service.createMission(dto);
  }

  /** PATCH /api/missions/:id — hq_admin: update mission (including is_active toggle) */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  updateMission(@Param() { id }: IdParamDto, @Body() dto: UpdateMissionDto) {
    return this.service.updateMission(id, dto);
  }

  /** DELETE /api/missions/:id — hq_admin: delete mission */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  deleteMission(@Param() { id }: IdParamDto) {
    return this.service.deleteMission(id);
  }

  // ── Member: mission actions ───────────────────────────────────────────────

  /** POST /api/missions/:id/start — join a mission */
  @Post(':id/start')
  @HttpCode(HttpStatus.CREATED)
  startMission(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.startMission(user, id);
  }

  /** POST /api/missions/:id/submit — submit / update a mission submission */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submitMission(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: SubmitMissionDto,
  ) {
    return this.service.submitMission(user, id, dto.link);
  }
}
