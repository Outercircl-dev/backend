/**
 * Seed script for activities table
 * OD-186: Load database with 500 dummy activity data
 * 
 * Usage: pnpm tsx scripts/seed-activities.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Activity categories
const CATEGORIES = [
  'Sports',
  'Arts & Culture',
  'Social',
  'Outdoor',
  'Food & Drink',
  'Music',
  'Technology',
  'Fitness',
  'Education',
  'Entertainment',
];

// Sample activity titles by category
const ACTIVITY_TITLES: Record<string, string[]> = {
  'Sports': [
    'Basketball Pickup Game',
    'Soccer Match',
    'Tennis Tournament',
    'Volleyball League',
    'Swimming Session',
    'Cycling Group Ride',
    'Running Club',
    'Yoga Class',
    'Martial Arts Training',
    'Rock Climbing',
  ],
  'Arts & Culture': [
    'Art Gallery Opening',
    'Poetry Reading',
    'Theater Performance',
    'Museum Tour',
    'Photography Walk',
    'Painting Workshop',
    'Dance Class',
    'Writing Circle',
    'Film Screening',
    'Cultural Festival',
  ],
  'Social': [
    'Coffee Meetup',
    'Book Club',
    'Game Night',
    'Trivia Night',
    'Networking Event',
    'Language Exchange',
    'Speed Dating',
    'Community Gathering',
    'Volunteer Event',
    'Hobby Group',
  ],
  'Outdoor': [
    'Hiking Adventure',
    'Beach Day',
    'Camping Trip',
    'Picnic in the Park',
    'Nature Walk',
    'Kayaking',
    'Surfing Session',
    'Gardening Workshop',
    'Stargazing Night',
    'Outdoor Yoga',
  ],
  'Food & Drink': [
    'Cooking Class',
    'Wine Tasting',
    'Food Tour',
    'BBQ Party',
    'Baking Workshop',
    'Restaurant Crawl',
    'Farmers Market Visit',
    'Brewery Tour',
    'Dinner Party',
    'Food Festival',
  ],
  'Music': [
    'Live Concert',
    'Open Mic Night',
    'Karaoke Night',
    'Music Festival',
    'Jazz Session',
    'DJ Night',
    'Acoustic Performance',
    'Dance Party',
    'Music Workshop',
    'Band Practice',
  ],
  'Technology': [
    'Coding Workshop',
    'Tech Meetup',
    'Hackathon',
    'AI Discussion',
    'Web Development Class',
    'Blockchain Seminar',
    'Gaming Tournament',
    'VR Experience',
    'Tech Conference',
    'Startup Pitch Night',
  ],
  'Fitness': [
    'CrossFit Class',
    'Pilates Session',
    'Zumba Dance',
    'Bootcamp Training',
    'Spin Class',
    'HIIT Workout',
    'Strength Training',
    'Cardio Session',
    'Stretching Class',
    'Fitness Challenge',
  ],
  'Education': [
    'Workshop Series',
    'Lecture Series',
    'Study Group',
    'Tutoring Session',
    'Skill Building Class',
    'Professional Development',
    'Language Class',
    'Science Fair',
    'History Tour',
    'Learning Circle',
  ],
  'Entertainment': [
    'Movie Night',
    'Comedy Show',
    'Magic Show',
    'Escape Room',
    'Board Game Tournament',
    'Video Game Night',
    'Karaoke Competition',
    'Talent Show',
    'Festival',
    'Carnival',
  ],
};

// Sample descriptions
const DESCRIPTIONS = [
  'Join us for an amazing experience!',
  'A fun and engaging activity for everyone.',
  'Perfect for beginners and experts alike.',
  'Come meet new people and have a great time!',
  'An exciting event you won\'t want to miss.',
  'Relax, learn, and connect with others.',
  'A unique opportunity to explore something new.',
  'Bring your friends and make it a group activity!',
  'All skill levels welcome.',
  'A community-driven event focused on fun and learning.',
];

// Time slots
const TIME_SLOTS = {
  morning: ['08:00', '09:00', '10:00', '11:00'],
  afternoon: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  evening: ['18:00', '19:00', '20:00', '21:00'],
};

// San Francisco area coordinates (for realistic location data)
const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.8,
  minLng: -122.5,
  maxLng: -122.4,
};

// Helper function to get random element from array
function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper function to get random number in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to get random float in range
function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Helper function to get random date in range (more future than past)
function randomDate(): Date {
  const now = new Date();
  const daysFromNow = randomInt(-30, 90); // -30 to +90 days
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

// Helper function to get random time
function randomTime(): string {
  const allTimes = [
    ...TIME_SLOTS.morning,
    ...TIME_SLOTS.afternoon,
    ...TIME_SLOTS.evening,
  ];
  return randomElement(allTimes);
}

// Helper function to add hours to time string
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const newHour = (h + hours) % 24;
  return `${String(newHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Helper function to get random interests (3-8 interests per activity)
function getRandomInterests(allInterests: string[]): string[] {
  const count = randomInt(3, 8);
  const shuffled = [...allInterests].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Helper function to get random location
function getRandomLocation(): { latitude: number; longitude: number; address?: string } {
  const lat = randomFloat(SF_BOUNDS.minLat, SF_BOUNDS.maxLat);
  const lng = randomFloat(SF_BOUNDS.minLng, SF_BOUNDS.maxLng);
  
  // 70% chance of having an address
  const hasAddress = Math.random() > 0.3;
  const address = hasAddress
    ? `${randomInt(100, 9999)} ${randomElement(['Main St', 'Oak Ave', 'Park Blvd', 'Market St', 'Mission St', 'Castro St'])}`
    : undefined;

  return { latitude: lat, longitude: lng, address };
}

async function seedActivities() {
  console.log('🌱 Starting activities seed...');

  // Initialize Prisma client with adapter (same as PrismaService)
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Use PrismaPg with connectionString directly (same as PrismaService)
  const adapter = new PrismaPg({
    connectionString: connectionString,
  });
  
  const prisma = new PrismaClient({ adapter });

  try {
    // Connect to database
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Fetch existing interests
    console.log('📋 Fetching interests...');
    const interests = await prisma.interest.findMany({
      select: { slug: true },
    });

    if (interests.length === 0) {
      throw new Error('No interests found in database. Please seed interests first.');
    }

    const interestSlugs = interests.map((i) => i.slug);
    console.log(`✅ Found ${interestSlugs.length} interests`);

    // Fetch existing user IDs from auth.users (via Supabase)
    // Note: We'll need to query auth.users directly or use a workaround
    // For now, we'll generate some test user IDs or use existing ones
    console.log('👥 Fetching user IDs...');
    
    // Try to get user IDs from user_profiles
    const profiles = await prisma.user_profiles.findMany({
      select: { user_id: true },
      take: 50, // Use up to 50 different hosts
    });

    let userIds: string[] = [];
    if (profiles.length > 0) {
      userIds = profiles.map((p) => p.user_id);
      console.log(`✅ Found ${userIds.length} existing user profiles`);
    } else {
      // If no profiles exist, we'll need to create test users or use placeholder UUIDs
      console.log('⚠️  No user profiles found. Using generated test user IDs.');
      // Generate 10 test user IDs for seeding
      for (let i = 0; i < 10; i++) {
        userIds.push(randomUUID());
      }
    }

    if (userIds.length === 0) {
      throw new Error('No user IDs available. Please create at least one user profile first.');
    }

    // Generate 500 activities
    console.log('🎲 Generating 500 activities...');
    const activities = [];
    const statuses: Array<'draft' | 'published' | 'completed' | 'cancelled'> = [
      'published',
      'published',
      'published',
      'published',
      'published',
      'published',
      'published',
      'published',
      'draft',
      'completed',
      'cancelled',
    ]; // 80% published, 10% draft, 5% completed, 5% cancelled

    for (let i = 0; i < 500; i++) {
      const category = randomElement(CATEGORIES);
      const title = randomElement(ACTIVITY_TITLES[category] || ACTIVITY_TITLES['Social']);
      const description = randomElement(DESCRIPTIONS);
      const activityDate = randomDate();
      const startTimeStr = randomTime();
      const endTimeStr = Math.random() > 0.2 ? addHours(startTimeStr, randomInt(1, 4)) : null; // 80% have end time
      
      // Convert time strings to Date objects (Prisma expects DateTime for Time fields)
      // Use a fixed date (2000-01-01) and set the time
      const [startHour, startMin] = startTimeStr.split(':').map(Number);
      const startTime = new Date(2000, 0, 1, startHour, startMin, 0);
      
      let endTime: Date | null = null;
      if (endTimeStr) {
        const [endHour, endMin] = endTimeStr.split(':').map(Number);
        endTime = new Date(2000, 0, 1, endHour, endMin, 0);
      }
      const maxParticipants = randomInt(2, 50);
      const currentParticipants = randomInt(0, maxParticipants);
      const status = randomElement(statuses);
      const isPublic = Math.random() > 0.1; // 90% public
      const hostId = randomElement(userIds);
      const activityInterests = getRandomInterests(interestSlugs);
      const location = getRandomLocation();

      activities.push({
        host_id: hostId,
        title,
        description,
        category,
        interests: activityInterests,
        location,
        activity_date: activityDate,
        start_time: startTime,
        end_time: endTime,
        max_participants: maxParticipants,
        current_participants: currentParticipants,
        status,
        is_public: isPublic,
      });

      if ((i + 1) % 50 === 0) {
        console.log(`  Generated ${i + 1}/500 activities...`);
      }
    }

    // Batch insert activities (100 at a time for performance)
    console.log('💾 Inserting activities into database...');
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < activities.length; i += batchSize) {
      const batch = activities.slice(i, i + batchSize);
      await prisma.activity.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/500 activities...`);
    }

    console.log('✅ Successfully seeded 500 activities!');
    console.log(`📊 Summary:`);
    console.log(`   - Total activities: ${inserted}`);
    console.log(`   - Categories: ${CATEGORIES.length}`);
    console.log(`   - Hosts used: ${userIds.length}`);
  } catch (error) {
    console.error('❌ Error seeding activities:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the seed
seedActivities()
  .then(() => {
    console.log('🎉 Seed completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seed failed:', error);
    process.exit(1);
  });

