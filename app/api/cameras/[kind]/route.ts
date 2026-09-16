import { getCameraData } from '@/lib/traffic-server';
import { kinds, LayerKind } from '@/lib/traffic';
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  if (!kinds.includes(kind as LayerKind)) return Response.json({ error: '找不到此圖層。' }, { status: 404 });
  try {
    const data = await getCameraData(kind as LayerKind, new URL(request.url).searchParams.has('refresh'));
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '官方資料暫時無法載入。' }, { status: 502 });
  }
}
