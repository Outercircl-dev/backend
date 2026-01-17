import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { UsersModule } from "src/users/users.module";
import { ProfileModule } from "src/v1/profile/profile.module";

@Module({
    imports: [UsersModule, ProfileModule],
    controllers: [MeController],
})
export class MeModule { }