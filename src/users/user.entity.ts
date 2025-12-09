export class User {
    id: string             // internal backend ID
    supabaseId: string     // Supabase user id (JWT sub)
    email: string
    hasOnboarded: boolean
    role: 'user' | 'admin'
}
