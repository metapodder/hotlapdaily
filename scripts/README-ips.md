# Best Lap IP Tracking

This directory contains scripts to track and analyze IP addresses of users submitting best lap times.

## What was implemented

1. **Modified `/src/app/api/best-lap/route.ts`** to store IP addresses in the `bestLapTrace` field when users submit best lap times.

2. **Created analysis scripts** to query and display IP data from the database.

## Scripts

### `get-raw-ips.ts`
Simple script that outputs just the raw IP addresses, one per line.

```bash
npx tsx scripts/get-raw-ips.ts
```

### `get-best-lap-ips.ts`
Detailed analysis script that shows:
- IP addresses grouped by submission count
- Driver names associated with each IP
- Track names and lap times
- Summary statistics
- Top IPs by submission count

```bash
npx tsx scripts/get-best-lap-ips.ts
```

## Data Structure

The IP data is stored in the `bestLapTrace` JSONB field with this structure:

```json
{
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "sessionId": "abc123..."
}
```

## Notes

- Only new submissions after the IP tracking was implemented will have IP data
- Existing submissions in the database will have `null` or empty `bestLapTrace` fields
- The IP extraction handles various proxy headers (`x-forwarded-for`, `x-real-ip`)
- Rate limiting is already implemented per IP address
