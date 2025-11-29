import { Injectable } from '@nestjs/common';

export type User = any;

@Injectable()
export class UsersService {
    private readonly users = [
        {
            'userId': 1,
            'userName': 'John',
            'password': 'pass'
        },
        {
            'userId': 2,
            'userName': 'Mary',
            'password': 'pass123'
        }
    ]

    async findOne(userName: string): Promise<User | undefined> {
        return this.users.find(user => user.userName == userName);
    }
}
