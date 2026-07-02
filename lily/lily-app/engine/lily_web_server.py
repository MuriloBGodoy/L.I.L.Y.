import asyncio
import base64
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import edge_tts

from lily_bridge import VOICE, ask_lily


HOST = os.getenv("LILY_WEB_HOST", "127.0.0.1")
PORT = int(os.getenv("LILY_WEB_PORT", "8765"))


async def synthesize_to_base64(text: str) -> str:
    output_path = Path(tempfile.gettempdir()) / "lily_web_reply.mp3"
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(str(output_path))
    return base64.b64encode(output_path.read_bytes()).decode("ascii")


class LilyWebHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_empty(204)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self.send_json({"ok": True, "voice": VOICE})
            return
        self.send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/chat", "/speak"}:
            self.send_json({"error": "Not found"}, status=404)
            return

        try:
            payload = self.read_json()
            message = str(payload.get("message") or payload.get("text") or "").strip()
            speak = bool(payload.get("speak", True))

            if not message:
                self.send_json({"error": "Message is required"}, status=400)
                return

            reply = message if path == "/speak" else ask_lily(message)
            audio = asyncio.run(synthesize_to_base64(reply)) if speak else ""
            self.send_json({"reply": reply, "audio": audio, "voice": VOICE})
        except Exception as error:
            self.send_json({"error": str(error)}, status=500)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body or "{}")

    def send_empty(self, status: int) -> None:
        self.send_response(status)
        self.add_cors_headers()
        self.end_headers()

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.add_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def add_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args: object) -> None:
        print(f"L.I.L.Y web: {format % args}")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), LilyWebHandler)
    print(f"L.I.L.Y web server em http://{HOST}:{PORT} usando {VOICE}")
    server.serve_forever()


if __name__ == "__main__":
    main()
