import { getCameraData, officialFetch } from '@/lib/traffic-server';

const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const SNAPSHOT_IMAGE_HOSTS = ['tdcctv.data.one.gov.hk'] as const;

function isApprovedSnapshotUrl(url: URL) {
  return url.protocol === 'https:' && url.port === '' && !url.username && !url.password && SNAPSHOT_IMAGE_HOSTS.some(host => host === url.hostname);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) return Response.json({ error: '快拍編號不正確。' }, { status: 400 });
  try {
    const inventory = await getCameraData('snapshot');
    const camera = inventory.cameras.find(c => c.sourceId === id);
    if (!camera?.imageUrl) return Response.json({ error: '官方名冊未有此快拍。' }, { status: 404 });
    const url = new URL(camera.imageUrl);
    if (!isApprovedSnapshotUrl(url)) throw new Error('官方影像網址格式已變更，暫時無法顯示。');
    const response = await officialFetch(url.href, { allowedRedirectHosts: SNAPSHOT_IMAGE_HOSTS });
    const finalUrl = new URL(response.url);
    if (!isApprovedSnapshotUrl(finalUrl)) throw new Error('官方影像重新導向至未受信任的網址。');
    const contentType = response.headers.get('content-type');
    if (!contentType?.toLowerCase().startsWith('image/') || !response.body) throw new Error('官方服務未有提供有效影像。');
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_SNAPSHOT_BYTES) throw new Error('官方影像檔案過大，暫時無法顯示。');

    let received = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_SNAPSHOT_BYTES) {
          controller.error(new Error('官方影像檔案超出大小上限。'));
          return;
        }
        controller.enqueue(chunk);
      },
    }));
    const modified = response.headers.get('Last-Modified');
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Snapshot-Fetched-At': new Date().toISOString(),
    });
    if (modified && !Number.isNaN(Date.parse(modified))) headers.set('Last-Modified', new Date(modified).toUTCString());
    return new Response(body, { headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '快拍暫時未能載入。' }, { status: 502 }); }
}
