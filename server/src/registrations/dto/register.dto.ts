import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class RegisterDto {
  @IsUUID('4')
  eventId!: string;

  /**
   * Answers to the event's custom registration questions, keyed by
   * CustomFormField.id. Written in the same statement as the registration —
   * members hold no RLS grant to patch their own registration row afterwards,
   * so a client-side follow-up write is silently rejected (42501).
   */
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;
}
