import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const interestsData = [
  { slug: 'running', name: 'Running', category: 'Fitness', icon: '🏃', sort_order: 1 },
  { slug: 'yoga', name: 'Yoga', category: 'Fitness', icon: '🧘', sort_order: 2 },
  { slug: 'cycling', name: 'Cycling', category: 'Fitness', icon: '🚴', sort_order: 3 },
  { slug: 'guitar', name: 'Guitar', category: 'Music', icon: '🎸', sort_order: 1 },
  { slug: 'piano', name: 'Piano', category: 'Music', icon: '🎹', sort_order: 2 },
  { slug: 'photography', name: 'Photography', category: 'Creative', icon: '📷', sort_order: 1 },
  { slug: 'painting', name: 'Painting', category: 'Creative', icon: '🎨', sort_order: 2 },
  { slug: 'cooking', name: 'Cooking', category: 'Lifestyle', icon: '🍳', sort_order: 1 },
  { slug: 'baking', name: 'Baking', category: 'Lifestyle', icon: '🥖', sort_order: 2 },
];

export async function main() {
  await prisma.interest.createMany({
    data: interestsData,
    skipDuplicates: true,
  });
}

main()
  .then(() => {
    console.log('Seed completed.');
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

