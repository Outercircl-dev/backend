import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { SupabaseJwtPayload } from '../auth/supabase-jwt.strategy'
import { User } from './user.entity'

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
            role: 'user',
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
}
