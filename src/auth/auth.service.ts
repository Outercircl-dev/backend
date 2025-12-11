import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ) { }

    //  use bcrypt, with a salted one-way hash algorithm to handle passwords
    // TODO: Validate the user using Supabase Payload
    // async validateUser(userName: string, pass: string): Promise<any> {
    //     const user = await this.usersService.findOne(userName);
    //     if (user && user.password == pass) {
    //         const { password, ...result } = user;
    //         return result;
    //     }
    //     return null;
    // }
    async login(user: any) {
        const payload = { userName: user.userName, sub: user.userId };
        return {
            access_token: this.jwtService.sign(payload)
        }
    }
}
