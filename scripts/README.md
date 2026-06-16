# Database Migration Scripts

## Data Migration Script

The `migrate-data.ts` script transfers all data from your old database to your new database.

### Prerequisites

1. **Environment Variables**: Make sure you have both database URLs in your `.env.local` file:
   ```env
   OLD_DATABASE_URL="postgresql://user:password@old-host:5432/old_database"
   NEW_DATABASE_URL="postgresql://user:password@new-host:5432/new_database"
   ```

2. **Dependencies**: Install the required packages:
   ```bash
   npm install
   ```

3. **Database Setup**: Ensure both databases are accessible and the new database has the schema applied:
   ```bash
   npm run db:push
   ```

### Running the Migration

```bash
npm run migrate:data
```

### What the Script Does

1. **Connects** to both old and new databases
2. **Migrates `best_laps` table**:
   - Transfers all records in batches of 1000
   - Handles field name mapping (snake_case → camelCase)
   - Skips duplicate records if they already exist
   - Shows progress during migration

3. **Migrates `submitted_tracks` table**:
   - Transfers all records in batches of 1000
   - Handles field name mapping
   - Skips duplicate records if they already exist
   - Shows progress during migration

4. **Verifies** the migration by comparing record counts
5. **Reports** success/failure status

### Safety Features

- **Skip Duplicates**: Uses `skipDuplicates: true` to avoid errors if records already exist
- **Batch Processing**: Processes data in batches to avoid memory issues
- **Connection Management**: Properly opens and closes database connections
- **Error Handling**: Comprehensive error handling with detailed logging
- **Verification**: Compares record counts between old and new databases

### Troubleshooting

If the migration fails:

1. **Check Database Connections**: Ensure both database URLs are correct and accessible
2. **Check Schema**: Make sure the new database has the correct schema applied
3. **Check Permissions**: Ensure the database user has read access to old DB and write access to new DB
4. **Check Logs**: The script provides detailed error messages to help diagnose issues

### Example Output

```
🚀 Starting database migration from OLD_DATABASE_URL to NEW_DATABASE_URL
============================================================
🔌 Testing database connections...
✅ Connected to old database
✅ Connected to new database
🔄 Starting best_laps migration...
📊 Found 1500 best_laps records to migrate
📦 Processing batch 1 (1-1000)
✅ Migrated 1000/1500 best_laps records
📦 Processing batch 2 (1001-1500)
✅ Migrated 1500/1500 best_laps records
🎉 Successfully migrated 1500 best_laps records

🔄 Starting submitted_tracks migration...
📊 Found 25 submitted_tracks records to migrate
📦 Processing batch 1 (1-25)
✅ Migrated 25/25 submitted_tracks records
🎉 Successfully migrated 25 submitted_tracks records

🔍 Verifying migration...
📊 Migration Summary:
   best_laps: 1500 → 1500
   submitted_tracks: 25 → 25
✅ Migration verification successful! All records migrated.

🎉 Migration completed successfully!
🔌 Database connections closed
```
