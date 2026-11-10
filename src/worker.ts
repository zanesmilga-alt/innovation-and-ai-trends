import { Room, type Env } from './room';

export { Room };

const CODE = /^[A-Za-z0-9]{3,12}$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // /api/room/<CODE>/ws       live connection (stage and phones)
    // /api/room/<CODE>/poll     fallback when WebSockets are blocked
    // /api/room/<CODE>/message  fallback: send one answer or control
    const m = url.pathname.match(/^\/api\/room\/([^/]+)\/(ws|poll|message)$/);
    if (m) {
      const code = decodeURIComponent(m[1]);
      if (!CODE.test(code)) return new Response('Bad room code', { status: 400 });
      const stub = env.ROOM.get(env.ROOM.idFromName(code.toUpperCase()));
      const target = new URL(req.url);
      target.pathname = m[2] === 'ws' ? '/ws' : m[2] === 'poll' ? '/poll' : '/message';
      return stub.fetch(new Request(target.toString(), req));
    }

    // /api/picture/<id>  GET (everyone) and PUT (presenter, with ?key=)
    const pic = url.pathname.match(/^\/api\/picture\/(s\d{2})$/);
    if (pic) {
      const stub = env.ROOM.get(env.ROOM.idFromName('__content__'));
      const target = new URL(req.url);
      target.pathname = `/picture/${pic[1]}`;
      return stub.fetch(new Request(target.toString(), req));
    }

    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
