import { IsNotEmpty, IsString } from 'class-validator';

/** Body for POST /events/:id/participants — the raffle-wheel access password. */
export class WheelAccessDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
