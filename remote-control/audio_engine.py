"""Persistent low-latency playback with bounded decoded PCM cache."""
import array
from collections import OrderedDict
import json
import os
import sys
import subprocess
import threading
import miniaudio

RATE = 48000
CACHE_LIMIT = 128 * 1024 * 1024


class AudioEngine:
    def __init__(self):
        self.outputs = []
        self.output_key = None
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.cache_lock = threading.Lock()
        self.warming = False

    def config(self):
        snapshot = os.path.join(os.environ['LOCALAPPDATA'], 'Soundux-Pouf', 'remote-state.json')
        path = snapshot if os.path.exists(snapshot) else os.path.join(os.environ['APPDATA'], 'Soundux', 'config.json')
        with open(path, encoding='utf-8') as source:
            return json.load(source)

    def pcm(self, path):
        stat = os.stat(path)
        key = (path, stat.st_mtime_ns, stat.st_size)
        with self.cache_lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
        with open(path, 'rb') as source:
            samples = miniaudio.decode(source.read(), nchannels=2, sample_rate=RATE).samples
        size = len(samples) * samples.itemsize
        with self.cache_lock:
            if key in self.cache:
                return self.cache[key]
            if size <= CACHE_LIMIT:
                while self.cache and self.cache_bytes + size > CACHE_LIMIT:
                    _, old = self.cache.popitem(last=False)
                    self.cache_bytes -= len(old) * old.itemsize
                self.cache[key] = samples
                self.cache_bytes += size
        return samples

    def warm(self, config):
        if self.warming:
            return
        self.warming = True
        def worker():
            try:
                # Stop at the budget instead of evicting the sounds just warmed.
                for tab in config['data']['tabs']:
                    for sound in tab['sounds']:
                        if self.cache_bytes >= CACHE_LIMIT * .9:
                            return
                        try:
                            self.pcm(sound['path'])
                        except Exception:
                            pass  # An unavailable file must not disable other sounds.
            finally:
                self.warming = False
        threading.Thread(target=worker, daemon=True).start()

    @staticmethod
    def stream(output):
        frames = yield b''
        while True:
            # One tuple assignment replaces playback, including its cursor.
            playback = output['playback']
            if playback is None:
                chunk = b'\0' * (frames * 4)
            else:
                samples, position, gain = playback
                end = min(position + frames * 2, len(samples))
                chunk = samples[position:end]
                if gain != 1:
                    chunk = array.array('h', (int(value * gain) for value in chunk))
                if output['playback'] is playback:
                    output['playback'] = (samples, end, gain) if end < len(samples) else None
            frames = yield chunk

    def prepare(self, config):
        settings = config['settings']
        sounds = [sound for tab in config['data']['tabs'] for sound in tab['sounds']]
        needs_local = not settings.get('outputs') or settings.get('localVolume', 50) > 0 or any(
            sound.get('localVolume', 0) is not None and sound.get('localVolume', 0) > 0 for sound in sounds)
        key = (tuple(settings.get('outputs', [])), needs_local)
        if key == self.output_key:
            return
        available = miniaudio.Devices(backends=[miniaudio.Backend.WASAPI]).get_playbacks()
        names = list(dict.fromkeys(settings.get('outputs', [])))
        default_name = None
        if needs_local:
            default_name = subprocess.check_output(
                ['powershell.exe', '-NoProfile', '-File', os.path.join(os.path.dirname(__file__), 'default-output.ps1')],
                encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW, timeout=10).strip()
            if default_name not in names:
                names.append(default_name)
        prepared = []
        try:
            for name in names:
                target = next((d for d in available if d['name'] == name), None)
                if target is None:
                    raise ValueError('Saída de áudio desconectada: ' + name)
                output = {'name': name, 'local': name not in settings.get('outputs', []), 'playback': None}
                device = miniaudio.PlaybackDevice(device_id=target['id'], nchannels=2, sample_rate=RATE,
                    buffersize_msec=10, backends=[miniaudio.Backend.WASAPI], app_name='Soundux Remote')
                output['device'] = device
                prepared.append(output)
                stream = self.stream(output)
                next(stream)
                device.start(stream)
        except Exception:
            for output in prepared:
                output['device'].close()
            raise
        self.close()
        self.outputs = prepared
        self.output_key = key

    def close(self):
        for output in self.outputs:
            output['device'].close()
        self.outputs = []
        self.output_key = None

    def execute(self, command):
        action = command['action']
        if action == 'stop':
            for output in self.outputs:
                output['playback'] = None
            return {'ok': True}
        config = self.config()
        self.prepare(config)
        if action == 'prepare':
            self.warm(config)
            return {'ok': True}
        sound = next((s for t in config['data']['tabs'] for s in t['sounds'] if s['id'] == command['soundId']), None)
        if sound is None:
            raise ValueError('Áudio não encontrado')
        samples = self.pcm(sound['path'])
        settings = config['settings']
        for output in self.outputs:
            field = 'localVolume' if output['local'] else 'remoteVolume'
            volume = sound.get(field)
            if volume is None:
                volume = settings.get(field, 50 if output['local'] else 100)
            gain = max(0, min(100, volume)) / 100
            output['playback'] = (samples, 0, gain) if gain else None
        return {'ok': True, 'soundId': sound['id'], 'outputs': [o['name'] for o in self.outputs]}


def main():
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    engine = AudioEngine()
    try:
        for line in sys.stdin:
            request = {}
            try:
                request = json.loads(line)
                response = engine.execute(request)
            except Exception as error:
                response = {'error': str(error)}
            response['requestId'] = request.get('requestId')
            print(json.dumps(response, ensure_ascii=False), flush=True)
    finally:
        engine.close()


if __name__ == '__main__':
    main()
