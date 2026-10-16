"""Direct one-shot playback. No keyboard or mouse input APIs."""
import array
import json
import os
import sys
import subprocess
import miniaudio

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
devices = []

def stop():
    while devices:
        devices.pop().close()

def execute(command):
    if command['action'] == 'stop':
        stop()
        return {'ok': True}
    with open(os.path.join(os.environ['APPDATA'], 'Soundux', 'config.json'), encoding='utf-8') as f:
        config = json.load(f)
    sound = next((s for t in config['data']['tabs'] for s in t['sounds'] if s['id'] == command['soundId']), None)
    if sound is None:
        raise ValueError('Áudio não encontrado')
    available = miniaudio.Devices(backends=[miniaudio.Backend.WASAPI]).get_playbacks()
    targets = []
    for name in config['settings'].get('outputs', []):
        match = next((d for d in available if d['name'] == name), None)
        if match is None:
            raise ValueError('Saída de áudio desconectada: ' + name)
        if not any(d['name'] == name for d in targets):
            targets.append(match)
    for target in targets:
        target['volume'] = sound.get('remoteVolume') if sound.get('remoteVolume') is not None else config['settings'].get('remoteVolume', 100)
    local_volume = sound.get('localVolume') if sound.get('localVolume') is not None else config['settings'].get('localVolume', 50)
    if local_volume > 0 or not targets:
        default_name = subprocess.check_output(
            ['powershell.exe', '-NoProfile', '-File', os.path.join(os.path.dirname(__file__), 'default-output.ps1')],
            encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW, timeout=10).strip()
        if not any(d['name'] == default_name for d in targets):
            default_device = next((d for d in available if d['name'] == default_name), None)
            if default_device is None:
                raise ValueError('Saída local desconectada: ' + default_name)
            targets.append({**default_device, 'volume': local_volume})
    stop()
    # Python opens Unicode Windows paths correctly; pass encoded audio in memory.
    with open(sound['path'], 'rb') as audio_file:
        decoded = miniaudio.decode(audio_file.read(), nchannels=2, sample_rate=48000)
    try:
        for target in targets:
            gain = max(0, min(100, target['volume'])) / 100
            samples = decoded.samples if gain == 1 else array.array('h', (int(s * gain) for s in decoded.samples))
            device = miniaudio.PlaybackDevice(device_id=target['id'], nchannels=2, sample_rate=48000,
                                             backends=[miniaudio.Backend.WASAPI], app_name='Soundux Remote')
            devices.append(device)
            device.start(miniaudio.stream_raw_pcm_memory(samples, nchannels=2, sample_width=2))
    except Exception:
        stop()
        raise
    return {'ok': True, 'soundId': sound['id'], 'outputs': [d['name'] for d in targets]}

try:
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            response = execute(request)
        except Exception as error:
            response = {'error': str(error)}
        response['requestId'] = request.get('requestId')
        print(json.dumps(response, ensure_ascii=False), flush=True)
finally:
    stop()
