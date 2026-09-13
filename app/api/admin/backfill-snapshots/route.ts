import { getAthleteId } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { loadEstimates } from '@/lib/estimates'
export async function POST(){const id=await getAthleteId();if(!id)return NextResponse.json({error:'Unauthorized'},{status:401});await loadEstimates(Number(id));return NextResponse.json({ok:true,message:'Current snapshot refreshed. Historical replay is available through the offline chronological evaluator; it never writes fitness trends.'})}
export async function GET(){return NextResponse.json({error:'Use POST'},{status:405})}
