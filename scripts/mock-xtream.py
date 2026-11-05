#!/usr/bin/env python3
# ============================================================
# AuroraStream — Provedor Xtream Codes mock (para validação E2E)
# Serve player_api.php + mídia real (HLS, MP4 com Range, MKV).
# Uso: python3 scripts/mock-xtream.py [porta]   (padrão 8899)
# Credenciais: usuário "u", senha "p"  |  DNS: http://127.0.0.1:8899
# ============================================================
import json
import os
import re
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
MEDIA = "/tmp/aurora-mock"
UA = "AuroraStream"

# ---------------- geração de mídia de teste ----------------

def ensure_media():
    os.makedirs(MEDIA, exist_ok=True)
    seg_dur = 4

    # HLS ao vivo: master + 5 segmentos de 4 s (playlist "event" estática)
    hls_master = os.path.join(MEDIA, "hls", "master.m3u8")
    if not os.path.exists(hls_master):
        os.makedirs(os.path.join(MEDIA, "hls"), exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "lavfi", "-i", "testsrc=size=640x360:rate=15",
             "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
             "-t", "20", "-c:v", "libx264", "-preset", "ultrafast",
             "-c:a", "aac", "-b:a", "64k",
             "-hls_time", str(seg_dur), "-hls_list_size", "5",
             "-hls_playlist_type", "event",
             "-hls_segment_filename", os.path.join(MEDIA, "hls", "seg%d.ts"),
             os.path.join(MEDIA, "hls", "master.m3u8")],
            check=True)
        print("[mock] HLS gerado em", hls_master)

    def gen(path, dur, container_args):
        if os.path.exists(path):
            return
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "lavfi", "-i", f"testsrc=size=640x360:rate=15",
             "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
             "-t", str(dur), "-c:v", "libx264", "-preset", "ultrafast",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
             *container_args, path],
            check=True)
        print("[mock] mídia gerada:", path)

    gen(os.path.join(MEDIA, "movie1001.mp4"), 60, [])
    gen(os.path.join(MEDIA, "movie1002.mkv"), 40,
        ["-f", "matroska"])
    gen(os.path.join(MEDIA, "ep3001.mp4"), 30, [])
    gen(os.path.join(MEDIA, "ep3002.mp4"), 30, [])

# ---------------- catálogos ----------------

CATS_LIVE = [
    {"category_id": "1", "category_name": "Notícias", "parent_id": 0},
    {"category_id": "2", "category_name": "Esportes", "parent_id": 0},
]
CATS_VOD = [{"category_id": "10", "category_name": "Ação", "parent_id": 0}]
CATS_SER = [{"category_id": "20", "category_name": "Drama", "parent_id": 0}]

LIVE = [
    {"num": 1, "name": "Aurora Notícias 24h", "stream_type": "live",
     "stream_id": 101, "stream_icon": "", "category_id": "1", "added": "1700000000"},
    {"num": 2, "name": "Arena Futebol HD", "stream_type": "live",
     "stream_id": 102, "stream_icon": "", "category_id": "2", "added": "1700000001",
     "tv_archive": 0, "direct_source": ""},
]
VOD = [
    {"num": 1, "name": "Missão Aurora (MP4)", "stream_type": "movie",
     "stream_id": 1001, "stream_icon": "", "rating": "8.5", "category_id": "10",
     "container_extension": "mp4", "added": "1700000002"},
    {"num": 2, "name": "Rota Aurora (MKV)", "stream_type": "movie",
     "stream_id": 1002, "stream_icon": "", "rating": "7.9", "category_id": "10",
     "container_extension": "mkv", "added": "1700000003"},
]
SERIES = [
    {"num": 1, "name": "Segredos de Aurora", "series_id": 3000, "cover": "",
     "plot": "Série de teste com duas temporadas.", "genre": "Drama",
     "releaseDate": "2023-01-10", "last_modified": "1700000004",
     "rating": "9.1", "backdrop": [], "episode_run_time": 30, "category_id": "20"},
]

SERIES_INFO = {
    "info": {"name": "Segredos de Aurora", "cover": "", "plot": "Série de teste.",
             "genre": "Drama", "cast": "Ana, Bruno", "director": "Lia",
             "releaseDate": "2023-01-10", "rating": "9.1", "backdrop": [],
             "episode_run_time": 30},
    "seasons": [{"season": 1, "episode_count": 2, "name": "Temporada 1"}],
    "episodes": {
        "1": [
            {"id": "3001", "episode_num": 1, "title": "Piloto",
             "container_extension": "mp4",
             "info": {"movie_image": "", "plot": "Ep 1", "duration_secs": 30}},
            {"id": "3002", "episode_num": 2, "title": "Continuação",
             "container_extension": "mp4",
             "info": {"movie_image": "", "plot": "Ep 2", "duration_secs": 30}},
        ]
    },
}

VOD_INFO = {
    "info": {"movie_image": "", "duration_secs": 60, "plot": "Filme de teste.",
             "cast": "Ana, Bruno", "director": "Lia", "genre": "Ação",
             "releaseDate": "2024-02-01", "rating": "8.5", "backdrop": [],
             "youtube_trailer": "", "country": "Brasil"},
    "movie_data": {"stream_id": 1001, "name": "Missão Aurora",
                   "container_extension": "mp4", "category_id": "10"},
}


def api_response(params):
    action = params.get("action", [""])[0]
    if not action:
        return {"user_info": {"username": "u", "auth": 1, "status": "Active",
                              "exp_date": "1999999999", "is_trial": "0",
                              "active_cons": "1", "max_connections": "2",
                              "created_at": "1700000000"},
                "server_info": {"url": "127.0.0.1", "port": str(PORT),
                                "server_protocol": "http",
                                "timezone": "America/Sao_Paulo"}}
    table = {
        "get_live_categories": CATS_LIVE,
        "get_vod_categories": CATS_VOD,
        "get_series_categories": CATS_SER,
        "get_live_streams": LIVE,
        "get_vod_streams": VOD,
        "get_series": SERIES,
    }
    if action in table:
        return table[action]
    if action == "get_series_info":
        return SERIES_INFO
    if action == "get_vod_info":
        return VOD_INFO
    if action == "get_simple_data_table":
        return {"epg_listings": [
            {"id": "1", "title": "TmVwbyBCcmFzaWw=",  # "Nepo Brasil" b64
             "start_timestamp": str(int(time.time()) - 600),
             "stop_timestamp": str(int(time.time()) + 1800),
             "description": ""}]}
    return {"error": f"ação desconhecida {action}"}


# ---------------- servidor HTTP ----------------

FILE_MAP = {
    "/movie/u/p/1001.mp4": f"{MEDIA}/movie1001.mp4",
    "/movie/u/p/1002.mkv": f"{MEDIA}/movie1002.mkv",
    "/series/u/p/3001.mp4": f"{MEDIA}/ep3001.mp4",
    "/series/u/p/3002.mp4": f"{MEDIA}/ep3002.mp4",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # enxuto
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    def _send(self, code, body, ctype="application/json", extra=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # ---- player_api.php ----
        if path.endswith("player_api.php"):
            data = api_response(qs)
            return self._send(200, json.dumps(data))

        # ---- HLS live ----
        if re.fullmatch(r"/live/u/p/10[12]\.m3u8", path):
            with open(os.path.join(MEDIA, "hls", "master.m3u8"), "r") as f:
                pl = f.read()
            # URLs absolutas para o mock
            pl = re.sub(r"^(?!#)(.+)$",
                        lambda m: f"http://127.0.0.1:{PORT}/live/u/p/{m.group(1).strip()}",
                        pl, flags=re.M)
            return self._send(200, pl, "application/vnd.apple.mpegurl")

        seg = re.fullmatch(r"/live/u/p/(seg\d+\.ts)", path)
        if seg:
            return self._file(os.path.join(MEDIA, "hls", seg.group(1)),
                              "video/mp2t")

        # ---- arquivos VOD com suporte a Range ----
        if path in FILE_MAP:
            ctype = "video/x-matroska" if path.endswith(".mkv") else "video/mp4"
            return self._file(FILE_MAP[path], ctype)

        # ---- imagens de pôster (1px gif) ----
        if path.endswith(".png") or path.endswith(".jpg"):
            gif = base64_gif()
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(gif)))
            self.end_headers()
            self.wfile.write(gif)
            return

        return self._send(404, '{"error":"not found"}')

    def _file(self, fpath, ctype):
        try:
            size = os.path.getsize(fpath)
        except OSError:
            return self._send(404, "arquivo ausente", "text/plain")
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        extra = {"Accept-Ranges": "bytes"}
        if rng:
            m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng.strip())
            if m:
                if m.group(1):
                    start = int(m.group(1))
                if m.group(2):
                    end = int(m.group(2))
                end = min(end, size - 1)
                code = 206
                extra["Content-Range"] = f"bytes {start}-{end}/{size}"
        length = end - start + 1
        extra["Content-Length"] = str(length)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        with open(fpath, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def base64_gif():
    import base64
    return base64.b64decode(
        "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")


def main():
    ensure_media()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[mock] Xtream mock em http://127.0.0.1:{PORT} (user=u pass=p)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
