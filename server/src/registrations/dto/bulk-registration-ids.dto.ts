import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Registration ids for a bulk organizer action.
 *
 * The event id is deliberately NOT in the body — it comes from the URL param and
 * is chapter-scope-checked once for the whole batch. Every id listed here is then
 * verified to belong to THAT event before any write (see
 * `RegistrationsService.resolveBulkTargets`), because the approve RPC only checks
 * that the caller holds an organizer role, not that the row is in scope.
 *
 * `ArrayUnique` matters: a duplicated id would otherwise be counted twice in the
 * partial-success summary the client renders.
 */
export class BulkRegistrationIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  registrationIds!: string[];
}
