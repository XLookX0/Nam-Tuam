import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const [waterLevels, tides, lastUpdated] = await Promise.all([
      redis.get('samutsongkhram:water_levels'),
      redis.get('samutsongkhram:tides'),
      redis.get('samutsongkhram:last_updated'),
    ]);

    return NextResponse.json({
      waterLevels: waterLevels || [],
      tides: tides || null,
      lastUpdated: lastUpdated || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching Redis water data:', error);
    return NextResponse.json({ error: 'Failed to fetch water data' }, { status: 500 });
  }
}