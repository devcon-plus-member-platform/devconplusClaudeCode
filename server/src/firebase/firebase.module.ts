import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

// Global so any feature module can inject FirebaseService without re-importing.
// The service initializes the Admin SDK once at module init.
@Global()
@Module({
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
