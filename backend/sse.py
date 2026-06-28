"""Server-Sent Events markazi — xotiradagi obunachilar (bitta worker)."""
import asyncio

subscribers: set[asyncio.Queue] = set()


def broadcast() -> None:
    for q in list(subscribers):
        try:
            q.put_nowait("update")
        except Exception:
            pass


async def event_stream(request):
    q: asyncio.Queue = asyncio.Queue()
    subscribers.add(q)
    try:
        yield "retry: 3000\n\n"
        yield "event: hello\ndata: {}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                await asyncio.wait_for(q.get(), timeout=20)
                yield "event: update\ndata: {}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        subscribers.discard(q)
