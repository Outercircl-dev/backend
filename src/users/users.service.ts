import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { SupabaseJwtPayload } from '../auth/supabase-jwt.strategy'
import { User } from './user.entity'
import { SubscriptionTier } from 'src/common/enums/subscription-tier.enum'

@Injectable()
export class UsersService {
    // In-memory store just for example; replace with DB.
    private users: User[] = []

    async findBySupabaseId(supabaseId: string): Promise<User | undefined> {
        return this.users.find(u => u.supabaseId === supabaseId)
    }

    async createFromSupabasePayload(payload: SupabaseJwtPayload): Promise<User> {
        const user: User = {
            id: randomUUID(),
            supabaseId: payload.sub,
            email: payload.email ?? '',
            hasOnboarded: false,
            role: payload.role ?? 'not-authenticated',
            type: SubscriptionTier.FREEMIUM,
        }

        this.users.push(user)
        return user
    }

    async findOrCreateFromSupabasePayload(payload: SupabaseJwtPayload): Promise<User> {
        let user = await this.findBySupabaseId(payload.sub)
        if (!user) {
            user = await this.createFromSupabasePayload(payload)
        }

        // Optional: if email changed in Supabase, sync it
        if (payload.email && payload.email !== user.email) {
            user.email = payload.email
        }

        return user
    }

    async markOnboarded(userId: string): Promise<User> {
        const user = this.users.find(u => u.id === userId)
        if (!user) {
            throw new Error('User not found')
        }
        user.hasOnboarded = true
        return user
    }

    async upsertHasOnboardedStatus(
        supabaseId: string,
        hasOnboarded: boolean,
        email?: string,
        role?: string,
        type?: SubscriptionTier,
    ): Promise<User> {
        let user = await this.findBySupabaseId(supabaseId)

        if (!user) {
            user = {
                id: randomUUID(),
                supabaseId,
                email: email ?? '',
                hasOnboarded,
                role: role ?? 'not-authenticated',
                type: type ?? SubscriptionTier.FREEMIUM,
            }
            this.users.push(user)
            return user
        }

        user.hasOnboarded = hasOnboarded
        if (email && user.email !== email) {
            user.email = email
        }
        if (role && user.role !== role) {
            user.role = role
        }
        if (type && user.type !== type) {
            user.type = type
        }
        if (!user.type) {
            user.type = SubscriptionTier.FREEMIUM
        }

        return user
    }
}
