import asyncio
from collections import defaultdict
from fastapi import WebSocket


class RealtimeService:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def register(self, document_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[document_id].append(ws)

    async def unregister(self, document_id: str, ws: WebSocket) -> None:
        async with self._lock:
            existing = self._connections.get(document_id, [])
            self._connections[document_id] = [item for item in existing if item is not ws]
            if not self._connections[document_id]:
                self._connections.pop(document_id, None)

    async def broadcast(self, document_id: str, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections.get(document_id, []))

        stale: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                existing = self._connections.get(document_id, [])
                self._connections[document_id] = [item for item in existing if item not in stale]
                if not self._connections[document_id]:
                    self._connections.pop(document_id, None)


realtime_service = RealtimeService()
