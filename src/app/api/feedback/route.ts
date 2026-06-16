import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message } = body;

        if (!message || typeof message !== 'string') {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        // Get IP address
        let ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip');

        // Handle multiple IPs in x-forwarded-for (e.g. client, proxy1, proxy2)
        if (ip && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        if (!ip) {
            ip = 'unknown';
        }

        const feedback = await prisma.feedback.create({
            data: {
                ip: ip as string,
                message: message.trim(),
            },
        });

        return NextResponse.json({ success: true, id: feedback.id });
    } catch (error) {
        console.error('Error saving feedback:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
