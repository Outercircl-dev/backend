import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { UsersModule } from "src/users/users.module";
import { ProfileModule } from "src/v1/profile/profile.module";
import { MembershipModule } from "src/membership/membership.module";

@Module({
    imports: [UsersModule, ProfileModule, MembershipModule],
    controllers: [MeController],
})
export class MeModule { }