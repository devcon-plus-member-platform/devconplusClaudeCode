import { Injectable } from '@nestjs/common';
import type { AdminAnalytics, PointTransaction, Profile, ProfileRole } from '../supabase/types';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  getUsers(): Promise<Profile[]> {
    return this.repo.findAllUsers();
  }

  getUserTransactions(userId: string): Promise<PointTransaction[]> {
    return this.repo.findUserTransactions(userId);
  }

  updateUserRole(userId: string, role: ProfileRole): Promise<void> {
    return this.repo.updateUserRole(userId, role);
  }

  getAnalytics(): Promise<AdminAnalytics> {
    return this.repo.getAnalytics();
  }
}
