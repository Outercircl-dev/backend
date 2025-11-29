export type User = any;
export declare class UsersService {
    private readonly users;
    findOne(userName: string): Promise<User | undefined>;
}
