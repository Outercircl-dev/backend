# Seed Scripts

## Seed Activities (OD-186)

This script seeds the database with 500 dummy activities for testing the datafeed algorithm.

### Prerequisites

1. **Database connection**: Ensure `DATABASE_URL` is set in your `.env` file
2. **Interests**: The `interests` table must have at least some interests seeded
3. **Users**: At least one user profile should exist (or the script will generate test user IDs)

### Usage

```bash
# Run the seed script
pnpm seed:activities
```

### What it does

- Fetches existing interests from the database
- Fetches existing user IDs from `user_profiles` table (or generates test IDs)
- Generates 500 realistic activities with:
  - Random titles, descriptions, categories
  - Random interest combinations (3-8 interests per activity)
  - Random locations (San Francisco area coordinates)
  - Random dates (mix of past, present, future - more future than past)
  - Random times (morning, afternoon, evening)
  - Random participant counts
  - Random statuses (80% published, 10% draft, 5% completed, 5% cancelled)
- Inserts activities in batches of 100 for performance

### Verification

After running the script, verify the data:

1. **Check count in Supabase**:
   - Go to Supabase Table Editor
   - Open `activities` table
   - Should show 500 records

2. **Check via Prisma/Backend**:
   ```bash
   # In backend directory, you can query via Prisma Studio
   pnpm prisma studio
   # Navigate to activities table
   ```

3. **Check via API** (requires activities API to be implemented):
   ```bash
   # Note: These endpoints require the activities feature to be fully deployed
   # Get all activities
   curl http://localhost:3000/api/v1/activities
   
   # Get paginated (should show 500 total)
   curl http://localhost:3000/api/v1/activities?page=1&limit=20
   ```

4. **Check data variety**:
   - Different categories
   - Different statuses
   - Different dates (past, present, future)
   - Different participant counts
   - Different locations

### Troubleshooting

- **Error: "No interests found"**: Seed the interests table first
- **Error: "No user IDs available"**: Create at least one user profile first
- **Error: "DATABASE_URL not set"**: Check your `.env` file

