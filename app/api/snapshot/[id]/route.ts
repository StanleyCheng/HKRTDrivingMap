import { getCameraData, officialFetch } from '@/lib/traffic-server';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) return Response.json({ error: '快拍編號不正確。' }, { status: 400 });
  try {
    const inventory = await getCameraData('snapshot');
    const camera = inventory.cameras.find(c => c.sourceId === id);
    if (!camera?.imageUrl) return Response.json({ error: '官方名冊未有此快拍。' }, { status: 404 });
    const url = new URL(camera.imageUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'tdcctv.data.one.gov.hk') throw new Error('官方影像網址格式已變更，暫時無法顯示。');
    const response = await officialFetch(url.href);
    if (!response.headers.get('content-type')?.includes('image/')) throw new Error('官方服務未有提供有效影像。');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const modified = response.headers.get('Last-Modified');
    return Response.json({ image: `data:image/jpeg;base64,${btoa(binary)}`, updatedAt: modified && !Number.isNaN(Date.parse(modified)) ? new Date(modified).toISOString() : null, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '快拍暫時未能載入。' }, { status: 502 }); }
}
