import { PrismaService } from "src/prisma/prisma.service";

export class InterestsService {
    constructor(private readonly prisma: PrismaService) { }

    async getInterestsCatalog() {
        const rows = await this.prisma.interest.findMany({
            orderBy: [{ category: 'asc' }, { sort_order: 'asc' }],
            select: { id: true, slug: true, name: true, category: true, icon: true, sort_order: true },
        })

        const map = new Map<string, any[]>()
        for (const r of rows) {
            map.set(r.category, [...(map.get(r.category) ?? []), r])
        }

        return Array.from(map.entries()).map(([name, interests]) => ({ name, interests }))
    }
}